package server

import (
	"script-gateway/app/common"
	"script-gateway/internal/decode"
)

func GetDecodeList() []*decode.Info {
	_ = common.DB
	return nil
}
