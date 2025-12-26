package model

type Script struct {
	Key     string `xorm:"pk"`
	Name    string
	Version string
	Type    string
	Script  string
}
