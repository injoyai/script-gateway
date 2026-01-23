package server

import (
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/internal/decode"
)

func GetDecodeList() []*decode.Info {
	_ = common.DB
	return nil
}
