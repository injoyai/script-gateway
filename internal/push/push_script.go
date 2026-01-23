package push

import (
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

type Script struct {
	Interpreter *interp.Interpreter
	Func        func(interface{}) error
}

func NewScript(content string) (*Script, error) {
	i := interp.New(interp.Options{})
	i.Use(stdlib.Symbols)
	_, err := i.Eval(content)
	if err != nil {
		return nil, err
	}

	v, err := i.Eval("main.Forward")
	if err != nil {
		// Try without package prefix if it fails (though yaegi usually puts it in main if package is main)
		v, err = i.Eval("Forward")
		if err != nil {
			return nil, err
		}
	}

	f, ok := v.Interface().(func(interface{}) error)
	if !ok {
		// Try minimal signature? No, let's enforce signature
		return nil, err
	}
	return &Script{Interpreter: i, Func: f}, nil
}

func (this *Script) Push(msg any) error {
	return this.Func(msg)
}
