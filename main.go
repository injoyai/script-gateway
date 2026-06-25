package main

import (
	"github.com/injoyai/conv/cfg"
	"github.com/injoyai/frame"
	"github.com/injoyai/logs"
	"github.com/injoyai/script-gateway/app/api"
	"github.com/injoyai/script-gateway/app/route"
	"github.com/injoyai/script-gateway/internal/pipeline"
	"github.com/injoyai/script-gateway/internal/plugin"
)

func main() {
	// 加载插件（在 pipeline 启动前完成，确保业务流程可引用插件）
	pluginDir := cfg.GetString("plugin.dir", "plugins")
	plugin.Default.SetDir(pluginDir)
	if err := plugin.Default.LoadAll(); err != nil {
		logs.Errf("Load plugins error: %v", err)
	}
	for _, e := range plugin.Default.ListFailed() {
		logs.Errf("Plugin load failed: %v", e)
	}

	if err := pipeline.Default.Start(); err != nil {
		logs.Errf("Pipeline start error: %v", err)
	}

	// 加载并启动所有 enable 的 Mocker
	api.LoadMockers()

	port := cfg.GetInt("port", frame.DefaultPort)
	logs.Err(route.Run(port))
}
