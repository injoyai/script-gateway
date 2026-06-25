package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// Metrics 繁忙度指标 API
type Metrics struct{}

// Subscribers 返回所有订阅者的统计快照
func (*Metrics) Subscribers(c fbr.Ctx) {
	stats := pipeline.Default.Queue().Subscribers()
	c.Succ(stats)
}
