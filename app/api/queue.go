package api

import (
	"strconv"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// Queue 消息队列 API
type Queue struct{}

func (*Queue) Topics(c fbr.Ctx) {
	topics := pipeline.Default.Queue().TopicsWithDepth()
	c.Succ(topics)
}

func (*Queue) Messages(c fbr.Ctx) {
	topic := c.GetString("topic")
	if topic == "" {
		c.Fail("topic 不能为空")
		return
	}
	limit := 50
	if l := c.GetString("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	messages := pipeline.Default.Queue().RecentMessages(topic, limit)
	c.Succ(messages)
}
