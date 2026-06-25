package route

import (
	"strings"

	"github.com/injoyai/script-gateway/app/api"

	"github.com/gofiber/fiber/v3"
	"github.com/injoyai/frame/fbr"
)

func Run(port int) error {
	s := fbr.Default(fbr.WithPort(port))

	s.Group("/api", func(g fbr.Grouper) {
		g.Group("/auth", fbr.WithStruct(&api.Auth{}))
		g.Group("/user", fbr.WithStruct(&api.User{}))

		g.Group("/listener-parent", fbr.WithStruct(&api.ListenerParent{}))
		g.Group("/listener-conn", fbr.WithStruct(&api.ListenerConn{}))
		g.Group("/dispatcher", fbr.WithStruct(&api.Dispatcher{}))
		g.Group("/processor_chain", fbr.WithStruct(&api.ProcessorChain{}))
		g.Group("/viewer", fbr.WithStruct(&api.Viewer{}))
		g.Group("/mocker", fbr.WithStruct(&api.Mocker{}))
		g.Group("/flow-layout", fbr.WithStruct(&api.FlowLayout{}))

		g.Group("/decode", fbr.WithStruct(&api.Decode{}))

		g.Group("/audit", fbr.WithStruct(&api.OperationLog{}))
		g.Group("/monitor", fbr.WithStruct(&api.Monitor{}))
		g.Group("/queue", fbr.WithStruct(&api.Queue{}))
		g.Group("/metrics", fbr.WithStruct(&api.Metrics{}))
		g.Group("/snapshot", fbr.WithStruct(&api.ConfigSnapshot{}))
		g.Group("/hotreload", fbr.WithStruct(&api.ScriptHotReload{}))
		g.Group("/plugin", fbr.WithStruct(&api.Plugin{}))
		g.Group("/ssh", fbr.WithStruct(&api.Ssh{}))
	})

	s.Static("/", "./web/build/")
	s.App.Use(func(c fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/api") {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.SendFile("./web/build/index.html")
	})

	return s.Run()
}
