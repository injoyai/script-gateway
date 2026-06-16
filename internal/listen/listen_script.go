package listen

import (
	"context"
	"fmt"
	"io"
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

	// yaegi 解释器执行结果
	runFn       func() ([]byte, error)
	runCtxFn    func(context.Context) ([]byte, error)
	onMessageFn func([]byte) error

	// ReadMessage 用
	msgCh chan []byte
}

func (this *ScriptListener_) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	i := script.SafeInterpreter()
	_, err := i.Eval(this.content)
	if err != nil {
		return fmt.Errorf("脚本编译失败: %w", err)
	}

	this.ctx, this.cancel = context.WithCancel(ctx)

	// 尝试获取 OnMessage 函数（出站：接收队列消息）
	if v, err := i.Eval("OnMessage"); err == nil {
		if fn, ok := v.Interface().(func([]byte) error); ok {
			this.onMessageFn = fn
		}
	}

	// 尝试获取 Run 函数（入站：产生数据推入队列）
	v, err := i.Eval("Run")
	if err != nil {
		if this.onMessageFn == nil {
			return fmt.Errorf("脚本必须定义 Run 函数（入站）或 OnMessage 函数（出站），或两者都定义")
		}
		return nil
	}

	// 签名1：func Run(ctx context.Context) ([]byte, error)
	if fn2, ok2 := v.Interface().(func(context.Context) ([]byte, error)); ok2 {
		this.runCtxFn = fn2
		go this.runLoop(func() {
			bs, e := fn2(this.ctx)
			this.handleRunResult(bs, e)
		})
		return nil
	}

	// 签名2：func Run() ([]byte, error)
	if fn, ok := v.Interface().(func() ([]byte, error)); ok {
		this.runFn = fn
		go this.runLoop(func() {
			bs, e := fn()
			this.handleRunResult(bs, e)
		})
		return nil
	}

	if this.onMessageFn == nil {
		return fmt.Errorf("Run 函数签名不匹配，期望 func Run() ([]byte, error) 或 func Run(context.Context) ([]byte, error)")
	}

	return nil
}

func (this *ScriptListener_) runLoop(callFn func()) {
	for {
		select {
		case <-this.ctx.Done():
			return
		default:
		}

		runErr := script.RunWithTimeout(func() error {
			callFn()
			return nil
		}, script.DefaultTimeout)
		if runErr != nil {
			continue
		}
	}
}

func (this *ScriptListener_) handleRunResult(data []byte, err error) {
	if err != nil || data == nil {
		return
	}
	select {
	case this.msgCh <- data:
	default:
	}
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
	if this.onMessageFn == nil {
		return len(p), nil
	}
	err := script.RunWithTimeout(func() error {
		return this.onMessageFn(p)
	}, script.DefaultTimeout)
	if err != nil {
		return 0, err
	}
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
	return nil
}
