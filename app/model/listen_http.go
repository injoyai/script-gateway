package model

import "github.com/injoyai/script-gateway/internal/listen"

type ListenHTTP struct {
	ID     int64  `json:"id" xorm:"'id'"`
	Name   string `json:"name" xorm:"'name'"`
	Port   int    `json:"port" xorm:"'port'"`
	Enable bool   `json:"enable" xorm:"'enable'"`

	svr listen.HTTP
}

func (ListenHTTP) TableName() string {
	return "listen_http"
}

type ListenHTTPNode struct {
	Name   string
	Path   string
	Decode string
}
