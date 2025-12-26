package model

import "github.com/injoyai/conv"

type DecodeScript struct {
	ID     int64
	Name   string
	Script string
}

func (this *DecodeScript) Key() string {
	return "script" + conv.String(this.ID)
}
