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

		g.Group("/listen", func(g fbr.Grouper) {
			g.Group("/http", fbr.WithStruct(&api.ListenHTTP{}))
		})

		g.Group("/decode", fbr.WithStruct(&api.Decode{}))
		g.Group("/push", func(g fbr.Grouper) {
			g.Group("/http", fbr.WithStruct(&api.PushHTTP{}))
		})

		g.Group("/audit", fbr.WithStruct(&api.OperationLog{}))
		g.Group("/monitor", fbr.WithStruct(&api.Monitor{}))
		g.Group("/queue", fbr.WithStruct(&api.Queue{}))
		g.Group("/snapshot", fbr.WithStruct(&api.ConfigSnapshot{}))
		g.Group("/hotreload", fbr.WithStruct(&api.ScriptHotReload{}))
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
