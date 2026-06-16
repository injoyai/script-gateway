package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/decode"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// ProcessorChain 处理器链 API
type ProcessorChain struct{}

func (*ProcessorChain) List(c fbr.Ctx) {
	var list []*model.ProcessorChain
	err := common.DB.Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (*ProcessorChain) Create(c fbr.Ctx) {
	data := new(model.ProcessorChain)
	c.Parse(data)
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	_, err := common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		pipeline.Default.StartPipeline(data)
	}
	c.Succ(data)
}

func (*ProcessorChain) Update(c fbr.Ctx) {
	data := new(model.ProcessorChain)
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
	pipeline.Default.StopPipeline(data.ID)
	if data.Enable {
		pipeline.Default.StartPipeline(data)
	}
	c.Succ(data)
}

func (*ProcessorChain) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.ProcessorChain)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("数据不存在")
		return
	}
	data.Enable = true
	_, err = common.DB.ID(id).Cols("enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StartPipeline(data)
	c.Succ(true)
}

func (*ProcessorChain) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Cols("enable").Update(&model.ProcessorChain{Enable: false})
	if err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopPipeline(id)
	c.Succ(true)
}

func (*ProcessorChain) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.ProcessorChain))
	if err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopPipeline(id)
	c.Succ(true)
}

// ProcessorTypes 返回可用的处理器类型列表
func (*ProcessorChain) Types(c fbr.Ctx) {
	c.Succ(decode.All())
}
