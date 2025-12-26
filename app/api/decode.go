package api

import (
	"script-gateway/app/server"
	"script-gateway/internal/decode"

	"github.com/injoyai/frame/fbr"
)

type Decode struct{}

func (*Decode) List(c fbr.Ctx) {
	info := server.GetDecodeList()
	info = append(decode.All(), info...)
	c.Succ(info)
}
