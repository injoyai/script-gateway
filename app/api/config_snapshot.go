package api

import (
	"encoding/json"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

// ConfigSnapshot 配置快照 API
type ConfigSnapshot struct{}

func (*ConfigSnapshot) List(c fbr.Ctx) {
	var list []*model.ConfigSnapshot
	err := common.DB.Desc("id").Limit(50).Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (*ConfigSnapshot) Create(c fbr.Ctx) {
	data := new(model.ConfigSnapshot)
	c.Parse(data)

	snapshot := map[string]any{}

	var parents []*model.ListenerParent
	common.DB.Find(&parents)
	snapshot["listener_parents"] = parents

	var conns []*model.ListenerConn
	common.DB.Find(&conns)
	snapshot["listener_conns"] = conns

	var dispatchers []*model.DispatcherConfig
	common.DB.Find(&dispatchers)
	snapshot["dispatchers"] = dispatchers

	var chains []*model.ProcessorChain
	common.DB.Find(&chains)
	snapshot["processor_chains"] = chains

	var scripts []*model.Script
	common.DB.Find(&scripts)
	snapshot["scripts"] = scripts

	bs, _ := json.Marshal(snapshot)
	data.Data = string(bs)

	if data.Name == "" {
		data.Name = "自动快照"
	}

	_, err := common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

func (*ConfigSnapshot) Restore(c fbr.Ctx) {
	id := c.GetInt64("id")
	snapshot := new(model.ConfigSnapshot)
	has, err := common.DB.ID(id).Get(snapshot)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("快照不存在")
		return
	}

	var data struct {
		Parents         []*model.ListenerParent   `json:"listener_parents"`
		Conns           []*model.ListenerConn     `json:"listener_conns"`
		Dispatchers     []*model.DispatcherConfig `json:"dispatchers"`
		ProcessorChains []*model.ProcessorChain   `json:"processor_chains"`
		Scripts         []*model.Script           `json:"scripts"`
	}
	_ = json.Unmarshal([]byte(snapshot.Data), &data)

	session := common.DB.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		c.Fail(err)
		return
	}

	session.Where("1=1").Delete(new(model.ListenerConn))
	session.Where("1=1").Delete(new(model.ListenerParent))
	for _, v := range data.Parents {
		v.ID = 0
		session.InsertOne(v)
	}
	for _, v := range data.Conns {
		v.ID = 0
		session.InsertOne(v)
	}

	session.Where("1=1").Delete(new(model.DispatcherConfig))
	for _, v := range data.Dispatchers {
		v.ID = 0
		session.InsertOne(v)
	}

	session.Where("1=1").Delete(new(model.ProcessorChain))
	for _, v := range data.ProcessorChains {
		v.ID = 0
		session.InsertOne(v)
	}

	session.Where("1=1").Delete(new(model.Script))
	for _, v := range data.Scripts {
		session.InsertOne(v)
	}

	if err := session.Commit(); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*ConfigSnapshot) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.ConfigSnapshot))
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}
