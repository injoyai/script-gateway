package decode

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/internal/plugin"
	"github.com/injoyai/script-gateway/internal/script"
	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*Script)(nil)

type Script struct {
	Key_  string
	Name_ string
	Fn    func(msg *types.Message) ([]*types.Message, error)
}

func (this *Script) Process(msg *types.Message) ([]*types.Message, error) {
	if this.Fn == nil {
		return []*types.Message{msg}, nil
	}
	return this.Fn(msg)
}

func (this *Script) Key() string  { return this.Key_ }
func (this *Script) Name() string { return this.Name_ }

func NewScript(key, name string, fn func(msg *types.Message) ([]*types.Message, error)) *Script {
	return &Script{Key_: key, Name_: name, Fn: fn}
}

// 旧的 Decoder 接口兼容
type Decoder interface {
	Decode([]byte) (map[string]any, error)
}

// ScriptProcessor 执行脚本处理器。
// 脚本必须定义 Deal 函数：
//
//	func Deal(payload []byte) (map[string]any, error)
//
// 返回值约定：
//
//	map 不为空, nil - 通过；key 为 topic，value 为消息内容（框架自动 JSON 序列化，[]byte 直接透传）
//	nil/空 map, nil - 丢弃该消息
//	_, err         - 出错，调用方降级使用原消息
//
// topic 完全由脚本返回的 key 决定，outTopic 已废弃。
type ScriptProcessor struct {
	mu        sync.Mutex
	content   string
	timeout   time.Duration
	compiled  bool
	processFn func([]byte) (map[string]any, error)
}

func NewScriptProcessor(content string, _ string) *ScriptProcessor {
	return &ScriptProcessor{
		content: content,
		timeout: 50 * time.Millisecond,
	}
}

func (p *ScriptProcessor) Key() string  { return "script" }
func (p *ScriptProcessor) Name() string { return "脚本处理" }

func (p *ScriptProcessor) compile() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.compiled {
		return nil
	}
	itp := script.SafeInterpreterWithWhitelist()
	if _, err := itp.Eval(p.content); err != nil {
		return fmt.Errorf("compile script processor: %w", err)
	}
	v, err := itp.Eval("Deal")
	if err != nil {
		return fmt.Errorf("script processor must define `Deal` function: %w", err)
	}
	fn, ok := v.Interface().(func([]byte) (map[string]any, error))
	if !ok {
		return fmt.Errorf("script processor `Deal` signature mismatch, expect func([]byte) (map[string]any, error)")
	}
	p.processFn = fn
	p.compiled = true
	return nil
}

func (p *ScriptProcessor) Process(msg *types.Message) ([]*types.Message, error) {
	if p == nil || p.content == "" {
		return []*types.Message{msg}, nil
	}
	if err := p.compile(); err != nil {
		return nil, err
	}
	type result struct {
		items map[string]any
		err   error
	}
	resCh := make(chan result, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				resCh <- result{err: fmt.Errorf("script processor panic: %v", r)}
			}
		}()
		items, err := p.processFn(msg.Payload)
		resCh <- result{items: items, err: err}
	}()

	select {
	case r := <-resCh:
		if r.err != nil {
			return []*types.Message{msg}, r.err
		}
		if len(r.items) == 0 {
			return nil, nil
		}
		outs := make([]*types.Message, 0, len(r.items))
		for topic, data := range r.items {
			if topic == "" {
				continue
			}
			payload, err := marshalScriptData(data)
			if err != nil {
				return []*types.Message{msg}, fmt.Errorf("script processor marshal topic %q: %w", topic, err)
			}
			outs = append(outs, &types.Message{
				ID:       msg.ID,
				Payload:  payload,
				Topic:    topic,
				Metadata: msg.Metadata,
			})
		}
		if len(outs) == 0 {
			return nil, nil
		}
		return outs, nil
	case <-time.After(p.timeout):
		return []*types.Message{msg}, fmt.Errorf("script processor timeout after %v", p.timeout)
	}
}

func marshalScriptData(data any) ([]byte, error) {
	if data == nil {
		return nil, nil
	}
	if payload, ok := data.([]byte); ok {
		return payload, nil
	}
	return json.Marshal(data)
}

// PluginProcessor 通过 processor 插件实现的处理器链节点
type PluginProcessor struct {
	PluginName string
	Params     map[string]any
	Timeout    time.Duration
}

func NewPluginProcessor(name string, params map[string]any) *PluginProcessor {
	return &PluginProcessor{PluginName: name, Params: params, Timeout: 200 * time.Millisecond}
}

func (p *PluginProcessor) Key() string  { return "plugin:" + p.PluginName }
func (p *PluginProcessor) Name() string { return "插件处理:" + p.PluginName }

func (p *PluginProcessor) Process(msg *types.Message) ([]*types.Message, error) {
	if p == nil || p.PluginName == "" {
		return []*types.Message{msg}, nil
	}
	plg, ok := plugin.Default.Get(plugin.TypeProcessor, p.PluginName)
	if !ok {
		return nil, fmt.Errorf("processor plugin %q not found", p.PluginName)
	}
	np, nt, nm, pass, err := plugin.InvokeProcess(context.Background(), plg, msg.Payload, msg.Topic, msg.Metadata, p.Params, p.Timeout)
	if err != nil {
		return nil, err
	}
	if !pass {
		return nil, nil
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
	return []*types.Message{out}, nil
}
