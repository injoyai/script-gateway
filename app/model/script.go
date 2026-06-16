package model

type Script struct {
	Key     string `xorm:"'key' pk"`
	Name    string `xorm:"'name'"`
	Version string `xorm:"'version'"`
	Type    string `xorm:"'type'"`
	Script  string `xorm:"'script'"`
}

func (Script) TableName() string {
	return "script"
}
