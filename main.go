package main

import (
	"github.com/injoyai/conv/cfg"
	"github.com/injoyai/frame"
	"github.com/injoyai/script-gateway/app/route"
	"github.com/injoyai/script-gateway/internal/pipeline"

	"github.com/injoyai/logs"
)

func main() {
	if err := pipeline.Default.Start(); err != nil {
		logs.Errf("Pipeline start error: %v", err)
	}

	port := cfg.GetInt("port", frame.DefaultPort)
	logs.Err(route.Run(port))
}
