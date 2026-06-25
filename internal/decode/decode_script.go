package decode

import (
	"context"
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
	Fn    func(msg *types.Message) (*types.Message, error)
}

func (this *Script) Process(msg *types.Message) (*types.Message, error) {
	if this.Fn == nil {
		return msg, nil
	}
	return this.Fn(msg)
}

func (this *Script) Key() string  { return this.Key_ }
func (this *Script) Name() string { return this.Name_ }

func NewScript(key, name string, fn func(msg *types.Message) (*types.Message, error)) *Script {
	return &Script{Key_: key, Name_: name, Fn: fn}
}

// 旧的 Decoder 接口兼容
type Decoder interface {
	Decode([]byte) (map[string]any, error)
}

// ScriptProcessor 执行脚本处理器。
// 脚本必须定义 Process 函数：
//
//	func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error)
//
// outTopic 为空时，优先使用脚本返回的 topic，其次保留原 topic。
type ScriptProcessor struct {
	mu        sync.Mutex
	content   string
	outTopic  string
	timeout   time.Duration
	compiled  bool
	processFn func([]byte, string, map[string]any) ([]byte, string, map[string]any, bool, error)
}

func NewScriptProcessor(content string, outTopic string) *ScriptProcessor {
	return &ScriptProcessor{
		content:  content,
		outTopic: outTopic,
		timeout:  50 * time.Millisecond,
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
	v, err := itp.Eval("Process")
	if err != nil {
		return fmt.Errorf("script processor must define `Process` function: %w", err)
	}
	fn, ok := v.Interface().(func([]byte, string, map[string]any) ([]byte, string, map[string]any, bool, error))
	if !ok {
		return fmt.Errorf("script processor `Process` signature mismatch")
	}
	p.processFn = fn
	p.compiled = true
	return nil
}

func (p *ScriptProcessor) Process(msg *types.Message) (*types.Message, error) {
	if p == nil || p.content == "" {
		return msg, nil
	}
	if err := p.compile(); err != nil {
		return msg, err
	}
	type result struct {
		payload  []byte
		topic    string
		metadata map[string]any
		pass     bool
		err      error
	}
	resCh := make(chan result, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				resCh <- result{err: fmt.Errorf("script processor panic: %v", r)}
			}
		}()
		payload, topic, metadata, pass, err := p.processFn(msg.Payload, msg.Topic, msg.Metadata)
		resCh <- result{payload: payload, topic: topic, metadata: metadata, pass: pass, err: err}
	}()

	select {
	case r := <-resCh:
		if r.err != nil {
			return msg, r.err
		}
		if !r.pass {
			return nil, nil
		}
		out := &types.Message{ID: msg.ID, Payload: msg.Payload, Topic: msg.Topic, Metadata: msg.Metadata}
		if r.payload != nil {
			out.Payload = r.payload
		}
		if p.outTopic != "" {
			out.Topic = p.outTopic
		} else if r.topic != "" {
			out.Topic = r.topic
		}
		if r.metadata != nil {
			out.Metadata = r.metadata
		}
		return out, nil
	case <-time.After(p.timeout):
		return msg, fmt.Errorf("script processor timeout after %v", p.timeout)
	}
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

func (p *PluginProcessor) Process(msg *types.Message) (*types.Message, error) {
	if p == nil || p.PluginName == "" {
		return msg, nil
	}
	plg, ok := plugin.Default.Get(plugin.TypeProcessor, p.PluginName)
	if !ok {
		return msg, fmt.Errorf("processor plugin %q not found", p.PluginName)
	}
	np, nt, nm, pass, err := plugin.InvokeProcess(context.Background(), plg, msg.Payload, msg.Topic, msg.Metadata, p.Params, p.Timeout)
	if err != nil {
		return msg, err
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
	return out, nil
}
