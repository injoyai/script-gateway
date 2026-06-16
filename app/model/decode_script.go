package model

import "github.com/injoyai/conv"

type DecodeScript struct {
	ID     int64  `xorm:"'id'"`
	Name   string `xorm:"'name'"`
	Script string `xorm:"'script'"`
}

func (DecodeScript) TableName() string {
	return "decode_script"
}

func (this *DecodeScript) Key() string {
	return "script" + conv.String(this.ID)
}
