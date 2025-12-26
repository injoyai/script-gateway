package xx

import (
	"context"
	"io"

	"github.com/injoyai/ios"
	"github.com/injoyai/ios/module/tcp"
	"github.com/injoyai/logs"
)

const (
	Name    = "Print"
	Version = "v1.0"
)

func init() {
	logs.Debug(665)
}

func Run(ctx context.Context) error {
	logs.Debug(666)
	return nil
}

func ReadFrom(r io.Reader) (result []byte, err error) {

	return
}

func NewListenFunc() ios.ListenFunc {
	return tcp.NewListen(10086)
}
