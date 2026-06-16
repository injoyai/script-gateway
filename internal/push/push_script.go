package push

import (
	"fmt"

	"github.com/injoyai/script-gateway/internal/script"
	"github.com/injoyai/script-gateway/internal/types"
)

type Script struct {
	Func func(interface{}) error
}

func NewScript(content string) (*Script, error) {
	i := script.SafeInterpreter()
	_, err := i.Eval(content)
	if err != nil {
		return nil, err
	}

	v, err := i.Eval("Forward")
	if err != nil {
		v, err = i.Eval("main.Forward")
		if err != nil {
			return nil, err
		}
	}

	f, ok := v.Interface().(func(interface{}) error)
	if !ok {
		return nil, fmt.Errorf("script Forward function signature mismatch")
	}
	return &Script{Func: f}, nil
}

func (this *Script) PushRaw(msg any) error {
	return script.RunWithTimeout(func() error {
		return this.Func(msg)
	}, script.DefaultTimeout)
}

// ScriptDispatcher 适配 Dispatcher 接口
var _ Dispatcher = (*ScriptDispatcher)(nil)

type ScriptDispatcher struct {
	Func   func(interface{}) error
	topics []string
}

func NewScriptDispatcher(content string, topics []string) (*ScriptDispatcher, error) {
	i := script.SafeInterpreter()
	_, err := i.Eval(content)
	if err != nil {
		return nil, err
	}

	v, err := i.Eval("Forward")
	if err != nil {
		v, err = i.Eval("main.Forward")
		if err != nil {
			return nil, err
		}
	}

	f, ok := v.Interface().(func(interface{}) error)
	if !ok {
		return nil, fmt.Errorf("script Forward function signature mismatch")
	}
	return &ScriptDispatcher{Func: f, topics: topics}, nil
}

func (this *ScriptDispatcher) Push(msg *types.Message) error {
	return script.RunWithTimeout(func() error {
		return this.Func(msg.Payload)
	}, script.DefaultTimeout)
}

func (this *ScriptDispatcher) Close() error { return nil }

func (this *ScriptDispatcher) Topics() []string { return this.topics }
