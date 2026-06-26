package plugin

import (
	"context"
	"fmt"
	"runtime/debug"
	"time"
)

// invokeSafely 包装一次函数调用，recover panic 为 error
func invokeSafely(fn func() error) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("plugin panic: %v\n%s", r, debug.Stack())
		}
	}()
	return fn()
}

func InvokeDecode(ctx context.Context, p *Plugin, payload []byte, params map[string]any, timeout time.Duration) (map[string]any, error) {
	if p == nil || p.Decode == nil {
		return nil, fmt.Errorf("nil decoder plugin")
	}
	type result struct {
		out map[string]any
		err error
	}
	ch := make(chan result, 1)
	p.Mu.Lock()
	go func() {
		defer p.Mu.Unlock()
		var r result
		r.err = invokeSafely(func() error {
			o, e := p.Decode(payload, params)
			r.out = o
			return e
		})
		ch <- r
	}()
	if timeout <= 0 {
		timeout = 50 * time.Millisecond
	}
	select {
	case r := <-ch:
		return r.out, r.err
	case <-time.After(timeout):
		return nil, fmt.Errorf("plugin decode timeout after %v", timeout)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// InvokeProcess 调用 processor 插件；返回 (newPayload, newTopic, newMetadata, pass, err)
func InvokeProcess(ctx context.Context, p *Plugin, payload []byte, topic string, metadata, params map[string]any, timeout time.Duration) ([]byte, string, map[string]any, bool, error) {
	if p == nil || p.Process == nil {
		return nil, "", nil, true, fmt.Errorf("nil processor plugin")
	}
	type result struct {
		payload  []byte
		topic    string
		metadata map[string]any
		pass     bool
		err      error
	}
	ch := make(chan result, 1)
	p.Mu.Lock()
	go func() {
		defer p.Mu.Unlock()
		var r result
		r.err = invokeSafely(func() error {
			np, nt, nm, pass, e := p.Process(payload, topic, metadata, params)
			r.payload, r.topic, r.metadata, r.pass = np, nt, nm, pass
			return e
		})
		ch <- r
	}()
	if timeout <= 0 {
		timeout = 50 * time.Millisecond
	}
	select {
	case r := <-ch:
		return r.payload, r.topic, r.metadata, r.pass, r.err
	case <-time.After(timeout):
		return nil, "", nil, true, fmt.Errorf("plugin process timeout after %v", timeout)
	case <-ctx.Done():
		return nil, "", nil, true, ctx.Err()
	}
}

func InvokePush(ctx context.Context, p *Plugin, payload []byte, topic string, metadata, params map[string]any, timeout time.Duration) error {
	if p == nil || p.Push == nil {
		return fmt.Errorf("nil pusher plugin")
	}
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	p.Mu.Lock()
	defer p.Mu.Unlock()
	return invokeSafely(func() error { return p.Push(cctx, payload, topic, metadata, params) })
}

// RunListener / RunTask 没有超时（长生命周期）；调用方负责 ctx
func RunListener(ctx context.Context, p *Plugin, params map[string]any, emit EmitFunc) error {
	if p == nil || p.RunListener == nil {
		return fmt.Errorf("nil listener plugin")
	}
	return invokeSafely(func() error { return p.RunListener(ctx, params, emit) })
}

func RunTask(ctx context.Context, p *Plugin, params map[string]any) error {
	if p == nil || p.RunTask == nil {
		return fmt.Errorf("nil task plugin")
	}
	return invokeSafely(func() error { return p.RunTask(ctx, params) })
}
