package model

import "script-gateway/internal/listen"

type ListenHTTP struct {
	ID     int64
	Name   string
	Port   int
	Enable bool

	svr listen.HTTP
}

type ListenHTTPNode struct {
	Name   string
	Path   string
	Decode string
}
