package listen

import (
	"context"
	"io"
	"strings"
	"testing"
)

// 测试1：完整生命周期 → Start/Read/Write/Close 全流程
func TestScriptListener_FullLifecycle(t *testing.T) {
	src := `package main

import (
	"context"
	"time"
)

var count int

func Run(ctx context.Context) error {
	count = 0
	<-ctx.Done()
	return nil
}

func Close() error { return nil }

func Read(ctx context.Context) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Millisecond * 50):
	}
	count++
	return []byte("hello"), nil
}

func Write(p []byte) error { return nil }
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

// 测试2：缺少 Run 函数 → Start 返回明确错误
func TestScriptListener_MissingRun(t *testing.T) {
	src := `package main

func Close() error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("Start 应返回错误，但返回 nil")
	}
	if !strings.Contains(err.Error(), "Run") {
		t.Fatalf("错误信息应包含 Run, got: %v", err)
	}
}

// 测试3：缺少 Close 函数 → Start 返回明确错误
func TestScriptListener_MissingClose(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) error { <-ctx.Done(); return nil }
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("Start 应返回错误，但返回 nil")
	}
	if !strings.Contains(err.Error(), "Close") {
		t.Fatalf("错误信息应包含 Close, got: %v", err)
	}
}

// 测试4：缺少 Read 函数 → Start 返回明确错误
func TestScriptListener_MissingRead(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) error { <-ctx.Done(); return nil }
func Close() error { return nil }
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("Start 应返回错误，但返回 nil")
	}
	if !strings.Contains(err.Error(), "Read") {
		t.Fatalf("错误信息应包含 Read, got: %v", err)
	}
}

// 测试5：Write 函数缺失 → Write 静默丢弃，不报错
func TestScriptListener_MissingWriteSilentDrop(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) error { <-ctx.Done(); return nil }
func Close() error { return nil }
func Read(ctx context.Context) ([]byte, error) {
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

// 测试6：Write 函数存在时被调用，不报错
func TestScriptListener_WriteNoError(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) error { <-ctx.Done(); return nil }
func Close() error { return nil }
func Read(ctx context.Context) ([]byte, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}
func Write(p []byte) error { return nil }
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

// 测试7：旧脚本（顶级 Run 返回 []byte）→ Start 报签名不匹配
func TestScriptListener_LegacyRunSignature(t *testing.T) {
	src := `package main

import "context"

func Run(ctx context.Context) ([]byte, error) {
	return []byte("hello"), nil
}

func Close() error { return nil }

func Read(ctx context.Context) ([]byte, error) {
	return nil, nil
}
`
	l := NewScriptListener(src, "test/topic")
	err := l.Start(context.Background())
	if err == nil {
		t.Fatal("旧 Run 签名应报错，但 Start 返回 nil")
	}
	if !strings.Contains(err.Error(), "Run") {
		t.Fatalf("错误信息应提示 Run 签名, got: %v", err)
	}
}

// 测试8：包级变量状态在 Run/Read/Close 间共享（单例语义验证）
func TestScriptListener_PackageVarStateShared(t *testing.T) {
	src := `package main

import (
	"context"
	"time"
)

var started bool

func Run(ctx context.Context) error {
	started = true
	<-ctx.Done()
	return nil
}

func Close() error {
	// 验证 Run 设置的包级变量在此可见（单例状态共享）
	if !started {
		panic("started should be true in Close")
	}
	return nil
}

func Read(ctx context.Context) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Millisecond * 50):
	}
	return []byte("data"), nil
}
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// 读一条消息确保 Run 已执行
	_, _ = l.ReadMessage()

	// Close 会触发 panic 如果 started 未被 Run 设置（包级变量未共享）
	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v（包级变量状态未共享）", err)
	}
}
