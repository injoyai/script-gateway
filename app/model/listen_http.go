package model

import "script-gateway/internal/listen"

type ListenHTTP struct {
	ID   int64
	Name string
	Port string
	Path []string

	svr listen.HTTP
}
