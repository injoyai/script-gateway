package model

import "time"

// FlowLayout 数据流页面布局
// 目前按 key 全局保存一份，例如 key=data-flow
// Positions 使用 JSON 存储：{"listener-1":{"x":100,"y":80}}
type FlowLayout struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Key       string    `json:"key" xorm:"'key' unique notnull"`
	Positions string    `json:"positions" xorm:"'positions' text"`
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (FlowLayout) TableName() string {
	return "flow_layout"
}
