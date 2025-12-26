package listen

import (
	"context"
	"script-gateway/lib"

	"github.com/injoyai/conv"
	"github.com/injoyai/logs"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

var (
	_ Listener = (*Script)(nil)

	script *interp.Interpreter
)

func init() {
	script = interp.New(interp.Options{})
	err := script.Use(stdlib.Symbols)
	if err != nil {
		logs.Err(err)
	}
	err = script.Use(lib.Symbols)
	if err != nil {
		logs.Err(err)
	}
}

type Script struct {
	Program *interp.Program
}

func (this *Script) Close() error {
	//TODO implement me
	panic("implement me")
}

func (this *Script) Run(ctx context.Context, cfg conv.Extend, log *logs.Logger, queue chan []byte) error {
	//TODO implement me
	panic("implement me")
}
