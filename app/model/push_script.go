package model

type PushScript struct {
	ID           int64  `xorm:"'id' pk autoincr"`
	Name         string `xorm:"'name'"`
	PluginName   string `xorm:"'plugin_name'"`
	PluginParams string `xorm:"'plugin_params'"`
	Enable       bool   `xorm:"'enable'"`
}

func (PushScript) TableName() string {
	return "push_script"
}
