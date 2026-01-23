package model

import "github.com/injoyai/script-gateway/internal/listen"

type ListenHTTP struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Enable bool   `json:"enable"`

	svr listen.HTTP
}

type ListenHTTPNode struct {
	Name   string
	Path   string
	Decode string
}
