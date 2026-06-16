package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// ScriptHotReload 脚本热加载 API
type ScriptHotReload struct{}

func (*ScriptHotReload) ReloadAll(c fbr.Ctx) {
	pipeline.Default.StopAll()
	if err := pipeline.Default.Start(); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*ScriptHotReload) ReloadListener(c fbr.Ctx) {
	id := c.GetInt64("id")
	kind := c.GetString("kind")
	switch kind {
	case "parent":
		data := new(model.ListenerParent)
		has, err := common.DB.ID(id).Get(data)
		if err != nil {
			c.Fail(err)
			return
		}
		if !has {
			c.Fail("监听父级不存在")
			return
		}
		pipeline.Default.StopParent(id)
		if data.Enable {
			if err := pipeline.Default.StartParent(data); err != nil {
				c.Fail(err)
				return
			}
		}
	default:
		data := new(model.ListenerConn)
		has, err := common.DB.ID(id).Get(data)
		if err != nil {
			c.Fail(err)
			return
		}
		if !has {
			c.Fail("监听连接不存在")
			return
		}
		pipeline.Default.StopConn(id)
		if data.Enable {
			if err := pipeline.Default.StartConn(data); err != nil {
				c.Fail(err)
				return
			}
		}
	}
	c.Succ(true)
}

func (*ScriptHotReload) ReloadDispatcher(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.DispatcherConfig)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("分发器不存在")
		return
	}
	pipeline.Default.StopDispatcher(id)
	if data.Enable {
		if err := pipeline.Default.StartDispatcher(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(true)
}
