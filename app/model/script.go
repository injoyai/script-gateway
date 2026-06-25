package model

type Script struct {
	Key          string `xorm:"'key' pk"`
	Name         string `xorm:"'name'"`
	Version      string `xorm:"'version'"`
	Type         string `xorm:"'type'"`
	Script       string `xorm:"'script'"`
	PluginName   string `xorm:"'plugin_name'"`
	PluginParams string `xorm:"'plugin_params'"` // JSON
}

func (Script) TableName() string {
	return "script"
}
