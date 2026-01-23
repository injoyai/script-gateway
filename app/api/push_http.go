package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

type PushHTTP struct{}

func (*PushHTTP) List(c fbr.Ctx) {
	var list []*model.PushHTTP
	err := common.DB.Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (*PushHTTP) Create(c fbr.Ctx) {
	data := new(model.PushHTTP)
	c.Parse(data)
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	if data.URL == "" {
		c.Fail("URL不能为空")
		return
	}
	_, err := common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

func (*PushHTTP) Update(c fbr.Ctx) {
	data := new(model.PushHTTP)
	c.Parse(data)
	if data.ID == 0 {
		c.Fail("ID不能为空")
		return
	}
	_, err := common.DB.ID(data.ID).AllCols().Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

func (*PushHTTP) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.PushHTTP)
	data.Enable = true
	_, err := common.DB.ID(id).Cols("Enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*PushHTTP) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.PushHTTP)
	data.Enable = false
	_, err := common.DB.ID(id).Cols("Enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*PushHTTP) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.PushHTTP))
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}
