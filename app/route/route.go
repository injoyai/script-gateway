package route

import (
	"strings"

	"github.com/injoyai/script-gateway/app/api"

	"github.com/injoyai/frame/fbr"
)

func Run() error {
	s := fbr.Default()

	s.Group("/api", func(g fbr.Grouper) {

		g.Group("/listen", func(g fbr.Grouper) {
			g.Group("/http", obj(&api.ListenHTTP{}))
		})

		g.Group("/decode", obj(&api.Decode{}))

		g.Group("/push", func(g fbr.Grouper) {
			g.Group("/http", obj(&api.PushHTTP{}))
			g.Group("/mqtt", obj(&api.PushMQTT{}))
			g.Group("/script", obj(&api.PushScript{}))
		})

		g.Group("/ssh", obj(&api.SSH{}))

	})

	return s.Run()
}

var obj = fbr.NewWithStruct(func(g fbr.Grouper, funcName string, f fbr.Handler) {
	path := strings.ToLower(funcName)
	switch path {
	case "list", "all", "info", "connect":
		g.GET(path, f)
	case "create":
		g.POST(path, f)
	case "update", "enable", "disable":
		g.PUT(path, f)
	case "delete", "del":
		g.DELETE(path, f)
	default:
		g.POST(path, f)
	}
})
