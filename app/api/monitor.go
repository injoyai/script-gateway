package api

import (
	"time"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/metrics"
)

// Monitor 监控 API
type Monitor struct{}

func (*Monitor) Realtime(c fbr.Ctx) {
	c.Succ(metrics.GetSnapshot())
}

func (*Monitor) History(c fbr.Ctx) {
	name := c.GetString("name")
	startStr := c.GetString("start")
	endStr := c.GetString("end")

	end := time.Now()
	if endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			end = t
		}
	}
	start := end.Add(-time.Hour)
	if startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			start = t
		}
	}

	var list []*model.Metric
	session := common.DB.Where("timestamp BETWEEN ? AND ?", start, end)
	if name != "" {
		session = session.Where("name = ?", name)
	}
	if err := session.Desc("timestamp").Limit(1000).Find(&list); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (*Monitor) System(c fbr.Ctx) {
	snapshot := metrics.GetSnapshot()
	parentCount, _ := common.DB.Where("enable = ?", true).Count(new(model.ListenerParent))
	connCount, _ := common.DB.Where("enable = ?", true).Count(new(model.ListenerConn))
	dispatcherCount, _ := common.DB.Where("enable = ?", true).Count(new(model.DispatcherConfig))

	c.Succ(map[string]any{
		"metrics":            snapshot,
		"active_parents":     parentCount,
		"active_listeners":   connCount,
		"active_dispatchers": dispatcherCount,
	})
}
