package api

import (
	"encoding/json"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

type PushHTTP struct{}

func (*PushHTTP) List(c fbr.Ctx) {
	var list []*model.DispatcherConfig
	err := common.DB.Where("type = ?", "http").Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (*PushHTTP) Create(c fbr.Ctx) {
	data := new(model.DispatcherConfig)
	c.Parse(data)
	data.Type = "http"
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	var cfg struct {
		URL    string            `json:"url"`
		Method string            `json:"method"`
		Header map[string]string `json:"header"`
	}
	json.Unmarshal([]byte(data.Config), &cfg)
	if cfg.URL == "" {
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
	data := new(model.DispatcherConfig)
	c.Parse(data)
	data.Type = "http"
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
	data := new(model.DispatcherConfig)
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
	data := new(model.DispatcherConfig)
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
	_, err := common.DB.ID(id).Delete(new(model.DispatcherConfig))
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}
