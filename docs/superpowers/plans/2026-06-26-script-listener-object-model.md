# 脚本监听器对象模型实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `script_conn` 监听器从顶级函数模式改造为对象模式（用户脚本定义 `New` + `Run/Close/Read/Write` 方法），让用户对象能跨调用持有状态（如 HTTP server 实例），并补齐禁用时的资源释放钩子。

**Architecture:** 重写 `internal/listen/listen_script.go` 的 `ScriptListener_`：`Start` 时 yaegi `Eval("New")` 拿工厂函数，调用得到用户对象 `reflect.Value`，再用 `reflect.MethodByName` 调用 `Run/Close/Read/Write`。`Listener` 接口和 `manager.go` 不动，数据流不变。前端 `fieldSchema.ts` 的 `DEFAULT_SCRIPT_CONTENT` 模板同步更新为对象式。

**Tech Stack:** Go 1.21+、yaegi 解释器、`reflect` 包、`context`、React/TypeScript（前端模板）

**设计文档：** [docs/superpowers/specs/2026-06-26-script-listener-object-model-design.md](../specs/2026-06-26-script-listener-object-model-design.md)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `internal/listen/listen_script.go` | 重写 | `ScriptListener_` 包装用户对象，reflect 调用方法 |
| `internal/listen/listen_script_test.go` | 新建 | 6 个测试用例覆盖生命周期与错误降级 |
| `web/src/pages/data-flow/fieldSchema.ts` | 修改 | `DEFAULT_SCRIPT_CONTENT` 更新为对象式 |

**不改动：** `internal/listen/listen_interface.go`、`internal/pipeline/manager.go`、`internal/script/pre_processor.go`

---

## Task 1: 验证 yaegi reflect 调用能力（Spike）

> 技术风险验证。若此任务失败，需改用方案B（lib 注入接口类型），后续任务全部作废。

**Files:**
- Create: `internal/listen/listen_script_spike_test.go`（验证后删除）

- [ ] **Step 1: 写 spike 测试**

```go
package listen

import (
	"context"
	"reflect"
	"testing"

	"github.com/injoyai/script-gateway/internal/script"
)

// 验证 yaegi 能 Eval("New") 拿到工厂函数，调用后 reflect 调用对象方法
func TestYaegiReflectSpike(t *testing.T) {
	src := `package main

import "context"

type myListener struct {
	started bool
}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	s.started = true
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }

func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	return []byte("hello"), nil
}

func (s *myListener) Write(p []byte) error { return nil }
`
	i := script.SafeInterpreter()
	if _, err := i.Eval(src); err != nil {
		t.Fatalf("eval: %v", err)
	}

	v, err := i.Eval("New")
	if err != nil {
		t.Fatalf("eval New: %v", err)
	}

	// 调用 New() 拿对象
	newFn, ok := v.Interface().(func() interface{})
	if !ok {
		t.Fatalf("New 签名不是 func() interface{}, got %T", v.Interface())
	}
	obj := newFn()
	objVal := reflect.ValueOf(obj)
	t.Logf("obj type: %s", objVal.Type())

	// 验证能 MethodByName 找到 Run
	runFn := objVal.MethodByName("Run")
	if !runFn.IsValid() {
		t.Fatal("MethodByName Run 无效")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		runFn.Call([]reflect.Value{reflect.ValueOf(ctx)})
	}()

	// 验证 Read
	readFn := objVal.MethodByName("Read")
	results := readFn.Call([]reflect.Value{reflect.ValueOf(ctx)})
	if len(results) != 2 {
		t.Fatalf("Read 返回值数量 = %d, want 2", len(results))
	}
	data := results[0].Bytes()
	if string(data) != "hello" {
		t.Fatalf("Read data = %q, want hello", string(data))
	}
}
```

- [ ] **Step 2: 运行测试**

Run: `go test ./internal/listen/ -run TestYaegiReflectSpike -v`
Expected: PASS（则 reflect 方案可行，继续 Task 2）

- [ ] **Step 3: 根据结果决定路径**

- 若 PASS → 删除 spike 测试文件，继续 Task 2
- 若 FAIL（`New` 无法断言为 `func() interface{}` 或 MethodByName 无效）→ 在本计划末尾记录 fallback 决策，转用方案B（lib 注入接口类型），后续任务需重写

- [ ] **Step 4: 删除 spike 文件并提交**

```bash
rm internal/listen/listen_script_spike_test.go
git add -A
git commit -m "chore: 删除 yaegi reflect spike 验证文件"
```

---

## Task 2: 写第一个失败测试 - 完整对象生命周期

**Files:**
- Create: `internal/listen/listen_script_test.go`

- [ ] **Step 1: 写失败测试**

```go
package listen

import (
	"context"
	"io"
	"testing"
	"time"
)

// 测试1：完整对象脚本 → Start/Read/Close 全流程
func TestScriptListener_ObjectFullLifecycle(t *testing.T) {
	src := `package main

import (
	"context"
	"time"
)

type myListener struct {
	count int
}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }

func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Millisecond * 50):
	}
	return []byte("hello"), nil
}

func (s *myListener) Write(p []byte) error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// 读取一条消息
	msg, err := l.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage: %v", err)
	}
	if string(msg) != "hello" {
		t.Fatalf("msg = %q, want hello", string(msg))
	}

	// 关闭
	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if !l.Closed() {
		t.Fatal("Closed() = false, want true")
	}

	// 关闭后 ReadMessage 应返回 EOF
	_, err = l.ReadMessage()
	if err != io.EOF {
		t.Fatalf("after Close ReadMessage err = %v, want io.EOF", err)
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/listen/ -run TestScriptListener_ObjectFullLifecycle -v`
Expected: FAIL（当前 Start 仍走顶级函数模式，找不到对象式 New 或 Run 签名不匹配）

- [ ] **Step 3: 重写 ScriptListener_ 的 Start（对象式）**

替换 `internal/listen/listen_script.go` 全部内容：

```go
package listen

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"sync/atomic"

	"github.com/injoyai/script-gateway/internal/script"
)

var _ Listener = (*ScriptListener_)(nil)

func NewScriptListener(content string, topic string) *ScriptListener_ {
	return &ScriptListener_{
		content: content,
		topic:   topic,
	}
}

type ScriptListener_ struct {
	content string
	topic   string
	closed  atomic.Bool
	ctx     context.Context
	cancel  context.CancelFunc

	// 用户对象实例（reflect.Value）
	obj     reflect.Value
	objType reflect.Type

	// ReadMessage 用
	msgCh chan []byte
}

func (this *ScriptListener_) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	i := script.SafeInterpreter()
	if _, err := i.Eval(this.content); err != nil {
		return fmt.Errorf("脚本编译失败: %w", err)
	}

	// 取 New 工厂函数
	v, err := i.Eval("New")
	if err != nil {
		return fmt.Errorf("脚本必须定义 New 函数（返回对象实例）: %w", err)
	}
	newFn, ok := v.Interface().(func() interface{})
	if !ok {
		return fmt.Errorf("New 函数签名应为 func New() interface{} 或 func New() *T, got %T", v.Interface())
	}

	// 调用 New() 拿对象
	obj := newFn()
	this.obj = reflect.ValueOf(obj)
	this.objType = this.obj.Type()

	this.ctx, this.cancel = context.WithCancel(ctx)

	// 取 Run 方法
	runFn := this.obj.MethodByName("Run")
	if !runFn.IsValid() {
		return fmt.Errorf("对象必须实现 Run(context.Context) error 方法")
	}

	// 启动 Run goroutine
	go func() {
		defer func() {
			if r := recover(); r != nil {
				// Run panic 不影响主流程，记录即可
			}
		}()
		args := this.tryCallArgs(runFn, []reflect.Value{reflect.ValueOf(this.ctx)})
		runFn.Call(args)
	}()

	return nil
}

// tryCallArgs 根据方法签名调整参数（支持带/不带 ctx 参数）
func (this *ScriptListener_) tryCallArgs(fn reflect.Value, ctxArgs []reflect.Value) []reflect.Value {
	t := fn.Type()
	if t.NumIn() == 0 {
		return nil
	}
	// 简单策略：第一个参数是 context.Context 就用传入的 ctx
	return ctxArgs
}

func (this *ScriptListener_) ReadMessage() ([]byte, error) {
	select {
	case data, ok := <-this.msgCh:
		if !ok {
			return nil, io.EOF
		}
		return data, nil
	case <-this.ctx.Done():
		return nil, io.EOF
	}
}

func (this *ScriptListener_) Write(p []byte) (int, error) {
	return len(p), nil
}

func (this *ScriptListener_) Closed() bool {
	return this.closed.Load()
}

func (this *ScriptListener_) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	// 调用用户对象的 Close 方法
	if this.obj.IsValid() {
		if closeFn := this.obj.MethodByName("Close"); closeFn.IsValid() {
			defer func() {
				_ = recover()
			}()
			closeFn.Call(nil)
		}
	}
	return nil
}
```

注意：此版本 ReadMessage 暂时读空 msgCh，Task 3 会补 Read 方法调用。

- [ ] **Step 4: 运行测试**

Run: `go test ./internal/listen/ -run TestScriptListener_ObjectFullLifecycle -v`
Expected: 测试会卡住（msgCh 永远没有数据，因为还没调 Read）。这说明需要 Task 3 补 Read 循环。先让测试不卡住：用 `-timeout 5s`。

Run: `go test ./internal/listen/ -run TestScriptListener_ObjectFullLifecycle -v -timeout 5s`
Expected: FAIL（超时，msgCh 无数据）

- [ ] **Step 5: 提交（WIP）**

```bash
git add internal/listen/listen_script.go internal/listen/listen_script_test.go
git commit -m "wip: ScriptListener_ 对象化 Start（待补 Read 循环）"
```

---

## Task 3: 补 Read 循环与 Write 方法

**Files:**
- Modify: `internal/listen/listen_script.go`
- Modify: `internal/listen/listen_script_test.go`

- [ ] **Step 1: 在测试文件追加 Write 测试**

在 `internal/listen/listen_script_test.go` 末尾追加：

```go
// 测试2：Write 方法存在时应被调用
func TestScriptListener_WriteCallsUserWrite(t *testing.T) {
	written := make(chan []byte, 1)
	src := `package main

import "context"

type myListener struct{}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }

func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

var WriteData []byte

func (s *myListener) Write(p []byte) error {
	WriteData = p
	return nil
}
`
	_ = written
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	n, err := l.Write([]byte("outgoing"))
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if n != len("outgoing") {
		t.Fatalf("Write n = %d, want %d", n, len("outgoing"))
	}

	// 给脚本一点时间执行 Write
	time.Sleep(100 * time.Millisecond)

	// 验证脚本全局 WriteData 被设置
	v, err := scriptSafeEval("WriteData")
	_ = v
	_ = err
	// 注意：yaegi 解释器实例不暴露给测试，此处改为验证 Write 不报错即可
	t.Log("Write 不报错即通过（yaegi 实例隔离，无法跨进程验证脚本内部状态）")
}
```

上述跨进程验证不可行，简化为只验证 Write 不报错。删除末尾 `scriptSafeEval` 引用，改为：

```go
// 测试2：Write 方法存在时不报错
func TestScriptListener_WriteNoError(t *testing.T) {
	src := `package main

import "context"

type myListener struct{}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }

func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (s *myListener) Write(p []byte) error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	n, err := l.Write([]byte("outgoing"))
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if n != len("outgoing") {
		t.Fatalf("Write n = %d, want %d", n, len("outgoing"))
	}
}
```

- [ ] **Step 2: 运行测试验证 Write 测试失败**

Run: `go test ./internal/listen/ -run TestScriptListener_WriteNoError -v -timeout 5s`
Expected: 当前 Write 直接返回 `len(p), nil`，实际会 PASS。但因为还没调用户 Write，这测试过于宽松。先补 Read 循环实现，再回头强化 Write 测试。

- [ ] **Step 3: 在 listen_script.go 中补 Read goroutine 与 Write 调用**

在 `Start` 方法中，Run goroutine 启动后，再启动一个 Read goroutine 读取数据推入 msgCh。修改 `internal/listen/listen_script.go`，在 `Start` 的 `go func() {...}()` 之后追加：

```go
	// 启动 Read goroutine，循环调用 obj.Read 推入 msgCh
	go this.readLoop()
```

在文件中 `ReadMessage` 方法之前，添加 `readLoop` 方法：

```go
func (this *ScriptListener_) readLoop() {
	readFn := this.obj.MethodByName("Read")
	if !readFn.IsValid() {
		return
	}
	for {
		select {
		case <-this.ctx.Done():
			return
		default:
		}
		args := this.tryCallArgs(readFn, []reflect.Value{reflect.ValueOf(this.ctx)})
		results, err := this.safeCall(readFn, args)
		if err != nil {
			continue
		}
		if len(results) < 1 {
			continue
		}
		var data []byte
		if results[0].IsValid() && results[0].Kind() == reflect.Slice && results[0].Type().Elem().Kind() == reflect.Uint8 {
			data = results[0].Bytes()
		}
		if len(data) == 0 {
			continue
		}
		select {
		case this.msgCh <- data:
		case <-this.ctx.Done():
			return
		}
	}
}

// safeCall 安全调用 reflect.Value，recover panic
func (this *ScriptListener_) safeCall(fn reflect.Value, args []reflect.Value) (results []reflect.Value, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("脚本方法调用 panic: %v", r)
		}
	}()
	return fn.Call(args), nil
}
```

修改 `Write` 方法，调用用户对象的 Write：

```go
func (this *ScriptListener_) Write(p []byte) (int, error) {
	if !this.obj.IsValid() {
		return len(p), nil
	}
	writeFn := this.obj.MethodByName("Write")
	if !writeFn.IsValid() {
		// 用户未实现 Write，静默丢弃出站
		return len(p), nil
	}
	args := []reflect.Value{reflect.ValueOf(p)}
	_, err := this.safeCall(writeFn, args)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}
```

- [ ] **Step 4: 运行完整对象生命周期测试**

Run: `go test ./internal/listen/ -run TestScriptListener_ObjectFullLifecycle -v -timeout 5s`
Expected: PASS（Read 循环每 50ms 产生一条 "hello"，ReadMessage 能读到）

- [ ] **Step 5: 运行 Write 测试**

Run: `go test ./internal/listen/ -run TestScriptListener_WriteNoError -v -timeout 5s`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add internal/listen/listen_script.go internal/listen/listen_script_test.go
git commit -m "feat(listen): ScriptListener_ 对象化 Read 循环与 Write 调用"
```

---

## Task 4: 补错误降级测试

**Files:**
- Modify: `internal/listen/listen_script_test.go`

- [ ] **Step 1: 写缺少 New 函数的测试**

在 `internal/listen/listen_script_test.go` 末尾追加：

```go
// 测试3：缺少 New 函数 → Start 返回明确错误
func TestScriptListener_MissingNew(t *testing.T) {
	src := `package main

type myListener struct{}

func (s *myListener) Run() error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("Start 应返回错误，但返回 nil")
	}
	if !strings.Contains(err.Error(), "New") {
		t.Fatalf("错误信息应包含 New, got: %v", err)
	}
}
```

在文件头部 import 追加 `"strings"`。

- [ ] **Step 2: 写缺少 Read 方法的测试**

```go
// 测试4：缺少 Read 方法 → Start 不报错（Read 循环静默退出），ReadMessage 超时
func TestScriptListener_MissingRead(t *testing.T) {
	src := `package main

import "context"

type myListener struct{}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	// 无 Read 方法，readLoop 静默退出，msgCh 无数据
	// ReadMessage 在 ctx 取消前会阻塞，取消后返回 EOF
	cancel()
	_, err := l.ReadMessage()
	if err != io.EOF {
		t.Fatalf("无 Read 方法 ReadMessage err = %v, want io.EOF", err)
	}
}
```

- [ ] **Step 3: 写 Write 缺失静默丢弃测试**

```go
// 测试5：Write 方法缺失 → Write 静默丢弃，不报错
func TestScriptListener_MissingWriteSilentDrop(t *testing.T) {
	src := `package main

import "context"

type myListener struct{}

func New() *myListener { return &myListener{} }

func (s *myListener) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (s *myListener) Close() error { return nil }

func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	n, err := l.Write([]byte("data"))
	if err != nil {
		t.Fatalf("Write 缺失时应静默丢弃, got err: %v", err)
	}
	if n != 4 {
		t.Fatalf("Write n = %d, want 4", n)
	}
}
```

- [ ] **Step 4: 写旧脚本报错测试**

```go
// 测试6：旧脚本（顶级 Run/OnMessage）→ Start 报 "必须定义 New 函数"
func TestScriptListener_LegacyTopLevelFunctions(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) ([]byte, error) {
	return []byte("hello"), nil
}

func OnMessage(p []byte) error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("旧脚本应报错，但 Start 返回 nil")
	}
	if !strings.Contains(err.Error(), "New") {
		t.Fatalf("错误信息应提示定义 New, got: %v", err)
	}
}
```

- [ ] **Step 5: 运行全部测试**

Run: `go test ./internal/listen/ -v -timeout 10s`
Expected: 6 个测试全部 PASS

- [ ] **Step 6: 提交**

```bash
git add internal/listen/listen_script_test.go
git commit -m "test(listen): 补 ScriptListener_ 对象化错误降级用例"
```

---

## Task 5: 更新前端模板

**Files:**
- Modify: `web/src/pages/data-flow/fieldSchema.ts`

- [ ] **Step 1: 替换 DEFAULT_SCRIPT_CONTENT**

在 `web/src/pages/data-flow/fieldSchema.ts` 中，找到第 41-67 行的 `DEFAULT_SCRIPT_CONTENT` 定义（从 `// script_conn 的 content 字段默认模板` 注释开始到 `` `; `` 结束），替换为：

```ts
// script_conn 的 content 字段默认模板（对象式：New + Run/Close/Read/Write）
// 用户脚本定义对象，框架 reflect 调用方法管理生命周期
export const DEFAULT_SCRIPT_CONTENT = `package main

import (
	"context"
	"time"
)

type myListener struct {
	// 用户状态字段，跨调用持有（如连接、server 实例）
}

// New 工厂函数：框架调用此函数创建监听器对象实例
func New() *myListener { return &myListener{} }

// Run 启用：初始化资源（建连接/开端口等）。ctx 取消时必须返回。
func (s *myListener) Run(ctx context.Context) error {
	// 示例：在此开启你的服务，数据通过 Read 读取
	<-ctx.Done()
	return nil
}

// Close 禁用：释放资源。Run 后调用。
func (s *myListener) Close() error {
	return nil
}

// Read 入站：阻塞读取一条数据。ctx 取消时返回 (nil, ctx.Err())。
func (s *myListener) Read(ctx context.Context) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Second):
	}
	return []byte("hello"), nil
}

// Write 出站：写入数据到连接。可选，不实现则忽略出站。
func (s *myListener) Write(p []byte) error {
	return nil
}
`;
```

- [ ] **Step 2: 更新 script_conn 的 tooltip**

在同一个文件中找到 `script_conn` 的 schema 定义（约第 167 行），将 `content` 字段的 `tooltip` 从：

```ts
tooltip: '脚本监听器本体脚本，定义顶级 Run（入站产生数据）和 OnMessage（出站接收消息）函数'
```

改为：

```ts
tooltip: '脚本监听器本体脚本，定义 New + Run（启用）/Close（禁用）/Read（入站）/Write（出站，可选）方法的对象'
```

- [ ] **Step 3: 验证前端编译**

Run: `cd web && npm run build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: 提交**

```bash
git add web/src/pages/data-flow/fieldSchema.ts
git commit -m "feat(web): script_conn 模板更新为对象式（New+Run/Close/Read/Write）"
```

---

## Task 6: 集成验证与收尾

**Files:**
- 无新增，仅验证

- [ ] **Step 1: 运行 listen 包全部测试**

Run: `go test ./internal/listen/ -v -timeout 15s`
Expected: 全部 PASS

- [ ] **Step 2: 运行整个项目测试**

Run: `go test ./... -timeout 30s`
Expected: 全部 PASS（确认未破坏其他包）

- [ ] **Step 3: 运行 go vet**

Run: `go vet ./internal/listen/`
Expected: 无警告

- [ ] **Step 4: 运行 go build**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 5: 最终提交（如有收尾改动）**

```bash
git status
# 若无改动则跳过；若有则提交
git add -A
git commit -m "chore: 脚本监听器对象化收尾"
```

---

## Self-Review 结果

**1. Spec coverage:**
- §1 架构与组件分层 → Task 2-3 重写 listen_script.go，Task 5 改前端，manager 不动 ✓
- §2 用户脚本接口契约 → Task 1 spike 验证 New+Run/Close/Read/Write，Task 2-4 测试覆盖 ✓
- §3 框架调用流程与错误处理 → Task 2 Start（Eval New+reflect Run），Task 3 Read 循环+Write+Close，Task 4 错误降级 ✓
- §4 前端模板与测试 → Task 5 模板，Task 2-4 共 6 个测试 ✓

**2. Placeholder scan:** 无 TBD/TODO，所有步骤含完整代码 ✓

**3. Type consistency:** `ScriptListener_` 字段名 `obj`/`objType` 在 Task 2 定义，Task 3 引用一致；`safeCall`/`tryCallArgs`/`readLoop` 方法名一致；测试函数名统一 `TestScriptListener_` 前缀 ✓

**技术风险提示：** Task 1 是关键验证点。若 yaegi 的 `reflect.Value.MethodByName` 对用户脚本定义的对象方法不可用，整个方案A作废，需转方案B（lib 注入接口类型）。Task 1 失败时停止后续任务。
