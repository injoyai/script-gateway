package listen

import (
	"context"
	"io"

	"github.com/injoyai/conv"
	"github.com/injoyai/logs"
)

/*


监听 -> 分包(可选) -> 解析/中间件 -> 缓存/中间件 -> 订阅/定时 -> 推送



*/

type Listener interface {
	io.Closer
	Run(ctx context.Context, cfg conv.Extend, log *logs.Logger, queue chan []byte) error
}
