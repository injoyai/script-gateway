package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/internal/script"
)

// ScriptTest 脚本测试 API
type ScriptTest struct{}

// testRequest 测试请求
type testRequest struct {
	Type    string `json:"type"`    // deal | forward | listener
	Content string `json:"content"` // 脚本内容
	Payload string `json:"payload"` // 测试 payload（deal/forward 用）
}

// testResult 测试结果
type testResult struct {
	Success bool   `json:"success"`
	Output  string `json:"output"`
	Console string `json:"console"` // 脚本中 fmt.Println 等终端输出
	Error   string `json:"error"`
}

// 测试专用超时，比生产 50ms 宽松
const testTimeout = 5 * time.Second

// Test 测试脚本
func (*ScriptTest) Test(c fbr.Ctx) {
	req := new(testRequest)
	c.Parse(req)

	if req.Content == "" {
		c.Fail("脚本内容不能为空")
		return
	}

	if req.Type != "deal" && req.Type != "forward" && req.Type != "listener" {
		c.Fail("不支持的脚本类型: " + req.Type)
		return
	}

	var result testResult
	func() {
		defer func() {
			if r := recover(); r != nil {
				result = testResult{Error: fmt.Sprintf("运行时 panic: %v", r)}
			}
		}()
		switch req.Type {
		case "deal":
			result = testDealScript(req.Content, req.Payload)
		case "forward":
			result = testForwardScript(req.Content, req.Payload)
		case "listener":
			result = testListenerScript(req.Content)
		}
	}()
	c.Succ(result)
}

func testDealScript(content, payload string) testResult {
	// 用 bytes.Buffer 作为解释器的 stdout/stderr，捕获脚本中的 fmt.Println 等输出
	var buf bytes.Buffer
	i := script.SafeInterpreterWithWhitelistAndStdout(&buf, &buf)
	if _, err := i.Eval(content); err != nil {
		return testResult{Error: fmt.Sprintf("编译失败: %v", err)}
	}

	v, err := i.Eval("Deal")
	if err != nil {
		return testResult{Error: fmt.Sprintf("未找到 Deal 函数: %v", err), Console: buf.String()}
	}

	fn, ok := v.Interface().(func([]byte) (map[string]any, error))
	if !ok {
		return testResult{Error: "Deal 签名不匹配，期望 func([]byte) (map[string]any, error)", Console: buf.String()}
	}

	var items map[string]any
	var runErr error
	err = script.RunWithTimeout(func() error {
		items, runErr = fn([]byte(payload))
		return runErr
	}, testTimeout)

	console := buf.String()

	if err != nil {
		return testResult{Error: fmt.Sprintf("运行失败: %v", err), Console: console}
	}

	if len(items) == 0 {
		return testResult{Success: true, Output: "消息将被丢弃（返回空 map / nil）", Console: console}
	}

	// 将 []byte 值转为字符串，便于 JSON 序列化展示
	display := make(map[string]any, len(items))
	for k, val := range items {
		if b, ok := val.([]byte); ok {
			display[k] = string(b)
		} else {
			display[k] = val
		}
	}
	out, _ := json.MarshalIndent(display, "", "  ")
	return testResult{Success: true, Output: string(out), Console: console}
}

func testForwardScript(content, payload string) testResult {
	var buf bytes.Buffer
	i := script.SafeInterpreterWithStdout(&buf, &buf)
	if _, err := i.Eval(content); err != nil {
		return testResult{Error: fmt.Sprintf("编译失败: %v", err)}
	}

	v, err := i.Eval("Forward")
	if err != nil {
		return testResult{Error: fmt.Sprintf("未找到 Forward 函数: %v", err), Console: buf.String()}
	}

	fn, ok := v.Interface().(func(interface{}) error)
	if !ok {
		return testResult{Error: "Forward 签名不匹配，期望 func(interface{}) error", Console: buf.String()}
	}

	err = script.RunWithTimeout(func() error {
		return fn([]byte(payload))
	}, testTimeout)

	console := buf.String()

	if err != nil {
		return testResult{Error: fmt.Sprintf("运行失败: %v", err), Console: console}
	}

	return testResult{Success: true, Output: "Forward 执行成功，无错误返回", Console: console}
}

func testListenerScript(content string) testResult {
	var buf bytes.Buffer
	i := script.SafeInterpreterWithStdout(&buf, &buf)
	if _, err := i.Eval(content); err != nil {
		return testResult{Error: fmt.Sprintf("编译失败: %v", err)}
	}

	var checks []string

	// Run（必须）
	if v, err := i.Eval("Run"); err != nil {
		return testResult{Error: "未找到 Run 函数: " + err.Error()}
	} else {
		if _, ok := v.Interface().(func() error); !ok {
			return testResult{Error: "Run 签名不匹配，期望 func() error"}
		}
		checks = append(checks, "  Run:   func() error ✓")
	}

	// Close（必须）
	if v, err := i.Eval("Close"); err != nil {
		return testResult{Error: "未找到 Close 函数: " + err.Error()}
	} else {
		if _, ok := v.Interface().(func() error); !ok {
			return testResult{Error: "Close 签名不匹配，期望 func() error"}
		}
		checks = append(checks, "  Close: func() error ✓")
	}

	// Read（必须）
	if v, err := i.Eval("Read"); err != nil {
		return testResult{Error: "未找到 Read 函数: " + err.Error()}
	} else {
		if _, ok := v.Interface().(func() ([]byte, error)); !ok {
			return testResult{Error: "Read 签名不匹配，期望 func() ([]byte, error)"}
		}
		checks = append(checks, "  Read:  func() ([]byte, error) ✓")
	}

	// Write（可选）
	if v, err := i.Eval("Write"); err == nil {
		if _, ok := v.Interface().(func([]byte) error); !ok {
			return testResult{Error: "Write 签名不匹配，期望 func([]byte) error"}
		}
		checks = append(checks, "  Write: func([]byte) error ✓（可选）")
	}

	return testResult{Success: true, Output: "编译通过，函数签名校验通过\n" + stringJoin(checks, "\n")}
}

func stringJoin(ss []string, sep string) string {
	buf := bytes.Buffer{}
	for i, s := range ss {
		if i > 0 {
			buf.WriteString(sep)
		}
		buf.WriteString(s)
	}
	return buf.String()
}
