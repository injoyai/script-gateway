package types

import (
	"context"
	"io"
)

const (
	Listener = "Listener" //监听
	Splitter = "Splitter" //分包
	Decoder  = "Decoder"  //解析
	Pusher   = "Pusher"   //推送
	Runner   = "Runner"   //
)

type (
	FuncRun    = func(ctx context.Context) error
	FuncDecode = func(msg any) (map[string]any, error)
	FuncPush   = func(msg any) error
	FuncSplit  = func(r io.Reader) ([]byte, error)
)
