package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

// OperationLog 操作日志 API
type OperationLog struct{}

func (*OperationLog) List(c fbr.Ctx) {
	var list []*model.OperationLog
	err := common.DB.Desc("id").Limit(200).Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}
