package model

import "time"

// TaskPluginConfig task 类型插件的参数配置
type TaskPluginConfig struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' unique"` // 插件名称
	Params    string    `json:"params" xorm:"'params' text"` // JSON 格式的参数
	Enable    bool      `json:"enable" xorm:"'enable'"`   // 是否自动启动
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (TaskPluginConfig) TableName() string {
	return "task_plugin_config"
}
