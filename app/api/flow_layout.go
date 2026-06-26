package api

import (
	"encoding/json"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

// FlowLayout 数据流布局 API
type FlowLayout struct{}

const dataFlowLayoutKey = "data-flow"

// Get 获取全局数据流布局
func (*FlowLayout) Get(c fbr.Ctx) {
	var layout model.FlowLayout
	has, err := common.DB.Where("`key` = ?", dataFlowLayoutKey).Get(&layout)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Succ(map[string]any{
			"key":       dataFlowLayoutKey,
			"positions": map[string]any{},
		})
		return
	}

	var positions map[string]any
	if layout.Positions != "" {
		_ = json.Unmarshal([]byte(layout.Positions), &positions)
	}
	if positions == nil {
		positions = map[string]any{}
	}
	c.Succ(map[string]any{
		"id":        layout.ID,
		"key":       layout.Key,
		"positions": positions,
	})
}

// Save 保存全局数据流布局
func (*FlowLayout) Save(c fbr.Ctx) {
	var req struct {
		Positions map[string]any `json:"positions"`
	}
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		c.Fail(err)
		return
	}
	if req.Positions == nil {
		req.Positions = map[string]any{}
	}
	positionsJSON, _ := json.Marshal(req.Positions)

	var existing model.FlowLayout
	has, err := common.DB.Where("`key` = ?", dataFlowLayoutKey).Get(&existing)
	if err != nil {
		c.Fail(err)
		return
	}
	if has {
		existing.Positions = string(positionsJSON)
		if _, err = common.DB.ID(existing.ID).Cols("positions").Update(&existing); err != nil {
			c.Fail(err)
			return
		}
		c.Succ(true)
		return
	}

	layout := &model.FlowLayout{
		Key:       dataFlowLayoutKey,
		Positions: string(positionsJSON),
	}
	if _, err = common.DB.InsertOne(layout); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}
