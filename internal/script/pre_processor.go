package script

import (
	"fmt"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

// PreProcessor 监听器前置处理脚本
// 用户脚本必须定义函数:
//
//	func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error)
//
// 返回值:
//
//	newPayload  - 处理后的 payload (传 nil 表示不修改)
//	newTopic    - 处理后的 topic   (传空串表示不修改)
//	newMetadata - 处理后的 metadata(传 nil 表示不修改)
//	pass        - false 表示丢弃该消息,不投递到内部消息总线
//	err         - 处理出错
type PreProcessor struct {
	mu        sync.Mutex
	content   string
	timeout   time.Duration
	compiled  bool
	processFn func([]byte, string, map[string]any) ([]byte, string, map[string]any, bool, error)
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
	fn, ok := v.Interface().(func([]byte, string, map[string]any) ([]byte, string, map[string]any, bool, error))
	if !ok {
		return fmt.Errorf("pre_script `Process` signature mismatch, expect func([]byte, string, map[string]any) ([]byte, string, map[string]any, bool, error)")
	}
	p.processFn = fn
	p.compiled = true
	return nil
}

// Process 执行预处理。返回 (msg, pass, err)。
// pass=false 表示消息被脚本丢弃。
// 当 err != nil 时调用方应使用原始消息(降级)。
func (p *PreProcessor) Process(msg *types.Message) (*types.Message, bool, error) {
	if p == nil || p.processFn == nil {
		return msg, true, nil
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
				resCh <- result{err: fmt.Errorf("pre_script panic: %v", r)}
			}
		}()
		np, nt, nm, pass, err := p.processFn(msg.Payload, msg.Topic, msg.Metadata)
		resCh <- result{payload: np, topic: nt, metadata: nm, pass: pass, err: err}
	}()

	select {
	case r := <-resCh:
		if r.err != nil {
			return msg, true, r.err
		}
		if !r.pass {
			return nil, false, nil
		}
		out := &types.Message{
			ID:       msg.ID,
			Payload:  msg.Payload,
			Topic:    msg.Topic,
			Metadata: msg.Metadata,
		}
		if r.payload != nil {
			out.Payload = r.payload
		}
		if r.topic != "" {
			out.Topic = r.topic
		}
		if r.metadata != nil {
			out.Metadata = r.metadata
		}
		return out, true, nil
	case <-time.After(p.timeout):
		return msg, true, fmt.Errorf("pre_script timeout after %v", p.timeout)
	}
}
