package script

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/internal/plugin"
	"github.com/injoyai/script-gateway/internal/types"
)

// PreProcessor 监听器前置处理脚本
// 用户脚本必须定义函数:
//
//	func Process(payload []byte) ([]byte, error)
//
// 返回值约定:
//
//	data, nil  - 通过，使用 data 替换原 payload（topic/metadata 不变）
//	nil,  nil  - 丢弃该消息，不投递到内部消息总线
//	_,    err  - 出错，调用方降级使用原消息
type PreProcessor struct {
	mu        sync.Mutex
	content   string
	timeout   time.Duration
	compiled  bool
	processFn func([]byte) ([]byte, error)
}

// NewPreProcessor 创建预处理脚本执行器,如 content 为空则返回 nil
func NewPreProcessor(content string) (*PreProcessor, error) {
	if content == "" {
		return nil, nil
	}
	p := &PreProcessor{
		content: content,
		timeout: 200 * time.Millisecond,
	}
	if err := p.compile(); err != nil {
		return nil, err
	}
	return p, nil
}

func (p *PreProcessor) compile() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.compiled {
		return nil
	}
	itp := SafeInterpreterWithWhitelist()
	if _, err := itp.Eval(p.content); err != nil {
		return fmt.Errorf("compile pre_script: %w", err)
	}
	v, err := itp.Eval("Process")
	if err != nil {
		return fmt.Errorf("pre_script must define `Process` function: %w", err)
	}
	fn, ok := v.Interface().(func([]byte) ([]byte, error))
	if !ok {
		return fmt.Errorf("pre_script `Process` signature mismatch, expect func([]byte) ([]byte, error)")
	}
	p.processFn = fn
	p.compiled = true
	return nil
}

// Process 执行预处理。返回 (msg, pass, err)。
// pass=false 表示消息被脚本丢弃（payload 为 nil）。
// 当 err != nil 时调用方应使用原始消息(降级)。
func (p *PreProcessor) Process(msg *types.Message) (*types.Message, bool, error) {
	if p == nil || p.processFn == nil {
		return msg, true, nil
	}

	type result struct {
		payload []byte
		err     error
	}
	resCh := make(chan result, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				resCh <- result{err: fmt.Errorf("pre_script panic: %v", r)}
			}
		}()
		np, err := p.processFn(msg.Payload)
		resCh <- result{payload: np, err: err}
	}()

	select {
	case r := <-resCh:
		if r.err != nil {
			return msg, true, r.err
		}
		// 约定：payload 为 nil 表示丢弃
		if r.payload == nil {
			return nil, false, nil
		}
		out := &types.Message{
			ID:       msg.ID,
			Payload:  r.payload,
			Topic:    msg.Topic,
			Metadata: msg.Metadata,
		}
		return out, true, nil
	case <-time.After(p.timeout):
		return msg, true, fmt.Errorf("pre_script timeout after %v", p.timeout)
	}
}

// PluginPreProcessor 通过插件名包装 PreProcessor 行为
type PluginPreProcessor struct {
	name    string
	params  map[string]any
	timeout time.Duration
}

func NewPluginPreProcessor(pluginName string, params map[string]any) *PluginPreProcessor {
	return &PluginPreProcessor{name: pluginName, params: params, timeout: 200 * time.Millisecond}
}

func (p *PluginPreProcessor) Process(msg *types.Message) (*types.Message, bool, error) {
	if p == nil {
		return msg, true, nil
	}
	plg, ok := plugin.Default.Get(plugin.TypeProcessor, p.name)
	if !ok {
		return msg, true, fmt.Errorf("processor plugin %q not found", p.name)
	}
	np, nt, nm, pass, err := plugin.InvokeProcess(context.Background(), plg, msg.Payload, msg.Topic, msg.Metadata, p.params, p.timeout)
	if err != nil {
		return msg, true, err
	}
	if !pass {
		return nil, false, nil
	}
	out := &types.Message{ID: msg.ID, Payload: msg.Payload, Topic: msg.Topic, Metadata: msg.Metadata}
	if np != nil {
		out.Payload = np
	}
	if nt != "" {
		out.Topic = nt
	}
	if nm != nil {
		out.Metadata = nm
	}
	return out, true, nil
}

// _ ensure unused-mutex check
var _ sync.Mutex
