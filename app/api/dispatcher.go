package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// Dispatcher 统一分发器 API
type Dispatcher struct{}

func (*Dispatcher) List(c fbr.Ctx) {
	var list []*model.DispatcherConfig
	err := common.DB.Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	running := pipeline.Default.RunningDispatchers()
	type dispResp struct {
		*model.DispatcherConfig
		Running bool `json:"running"`
	}
	resp := make([]dispResp, len(list))
	for i, item := range list {
		resp[i] = dispResp{DispatcherConfig: item, Running: running[item.ID]}
	}
	c.Succ(resp)
}

func (*Dispatcher) Create(c fbr.Ctx) {
	data := new(model.DispatcherConfig)
	c.Parse(data)
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	if data.Type == "" {
		c.Fail("类型不能为空")
		return
	}
	_, err := common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		pipeline.Default.StartDispatcher(data)
	}
	c.Succ(data)
}

func (*Dispatcher) Update(c fbr.Ctx) {
	data := new(model.DispatcherConfig)
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
	pipeline.Default.StopDispatcher(data.ID)
	if data.Enable {
		pipeline.Default.StartDispatcher(data)
	}
	c.Succ(data)
}

func (*Dispatcher) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.DispatcherConfig)
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
	pipeline.Default.StartDispatcher(data)
	c.Succ(true)
}

func (*Dispatcher) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Cols("enable").Update(&model.DispatcherConfig{Enable: false})
	if err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopDispatcher(id)
	c.Succ(true)
}

func (*Dispatcher) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.DispatcherConfig))
	if err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopDispatcher(id)
	c.Succ(true)
}
