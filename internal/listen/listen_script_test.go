package listen

import (
	"context"
	"io"
	"strings"
	"testing"
)

// 测试1：完整对象生命周期 → Start/Read/Write/Close 全流程
func TestScriptListener_ObjectFullLifecycle(t *testing.T) {
	src := `package main

import (
	"context"
	"time"
)

type myListener struct {
	Run   func(context.Context) error
	Close func() error
	Read  func(context.Context) ([]byte, error)
	Write func([]byte) error
}

func New() *myListener {
	s := &myListener{}
	s.Run = func(ctx context.Context) error {
		<-ctx.Done()
		return nil
	}
	s.Close = func() error { return nil }
	s.Read = func(ctx context.Context) ([]byte, error) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Millisecond * 50):
		}
		return []byte("hello"), nil
	}
	s.Write = func(p []byte) error { return nil }
	return s
}
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

// 测试4：缺少 Read 字段 → Start 不报错，ReadMessage 在 ctx 取消后返回 EOF
func TestScriptListener_MissingRead(t *testing.T) {
	src := `package main

import "context"

type myListener struct {
	Run   func(context.Context) error
	Close func() error
}

func New() *myListener {
	s := &myListener{}
	s.Run = func(ctx context.Context) error { <-ctx.Done(); return nil }
	s.Close = func() error { return nil }
	return s
}
`
	l := NewScriptListener(src, "test/topic")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := l.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	// 无 Read 字段，readLoop 静默退出，msgCh 无数据
	cancel()
	_, err := l.ReadMessage()
	if err != io.EOF {
		t.Fatalf("无 Read 字段 ReadMessage err = %v, want io.EOF", err)
	}
}

// 测试5：Write 字段缺失 → Write 静默丢弃，不报错
func TestScriptListener_MissingWriteSilentDrop(t *testing.T) {
	src := `package main

import "context"

type myListener struct {
	Run   func(context.Context) error
	Close func() error
	Read  func(context.Context) ([]byte, error)
}

func New() *myListener {
	s := &myListener{}
	s.Run = func(ctx context.Context) error { <-ctx.Done(); return nil }
	s.Close = func() error { return nil }
	s.Read = func(ctx context.Context) ([]byte, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	return s
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

// 测试7：Write 字段存在时被调用，不报错
func TestScriptListener_WriteNoError(t *testing.T) {
	src := `package main

import "context"

type myListener struct {
	Run   func(context.Context) error
	Close func() error
	Read  func(context.Context) ([]byte, error)
	Write func([]byte) error
}

func New() *myListener {
	s := &myListener{}
	s.Run = func(ctx context.Context) error { <-ctx.Done(); return nil }
	s.Close = func() error { return nil }
	s.Read = func(ctx context.Context) ([]byte, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	s.Write = func(p []byte) error { return nil }
	return s
}
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
