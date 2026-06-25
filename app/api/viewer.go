package api

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
	"github.com/injoyai/script-gateway/internal/queue"
)

// Viewer 订阅查看器 API
type Viewer struct{}

// List 列表
func (*Viewer) List(c fbr.Ctx) {
	var list []*model.Viewer
	if err := common.DB.Find(&list); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

// Create 创建
func (*Viewer) Create(c fbr.Ctx) {
	data := new(model.Viewer)
	c.Parse(data)
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	if _, err := common.DB.InsertOne(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

// Update 更新
func (*Viewer) Update(c fbr.Ctx) {
	data := new(model.Viewer)
	c.Parse(data)
	if data.ID == 0 {
		c.Fail("ID不能为空")
		return
	}
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	if _, err := common.DB.ID(data.ID).AllCols().Update(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

// Delete 删除
func (*Viewer) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	if id == 0 {
		c.Fail("ID不能为空")
		return
	}
	if _, err := common.DB.ID(id).Delete(new(model.Viewer)); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(nil)
}

// Enable 启用
func (*Viewer) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.Viewer)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("记录不存在")
		return
	}
	data.Enable = true
	if _, err := common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

// Disable 禁用
func (*Viewer) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.Viewer)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("记录不存在")
		return
	}
	data.Enable = false
	if _, err := common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

// Stream WebSocket 实时推送订阅的消息
func (*Viewer) Stream(c fbr.Ctx) {
	// topics 参数：逗号分隔
	topicsStr := c.GetString("topics")
	if topicsStr == "" {
		c.Fail("topics 不能为空")
		return
	}
	topics := strings.Split(topicsStr, ",")
	for i := range topics {
		topics[i] = strings.TrimSpace(topics[i])
	}

	err := fbr.DefaultUpgrader.Upgrade(c.RequestCtx(), func(conn *websocket.Conn) {
		defer conn.Close()

		// 订阅消息队列（带身份，便于 metrics 统计 WebSocket 订阅者繁忙度）
		sub, ch := pipeline.Default.Queue().SubscribeNamed(topics, queue.SubOpts{
			Name:      "viewer#" + remoteIP(c),
			OwnerType: "viewer",
			OwnerID:   time.Now().UnixNano(),
			Buffer:    64,
		})
		defer pipeline.Default.Queue().UnsubscribeSub(sub)

		// 发送连接成功消息
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"connected","topics":`+encodeTopics(topics)+`}`))

		for msg := range ch {
			payload, err := json.Marshal(map[string]any{
				"type":      "message",
				"topic":     msg.Topic,
				"data":      string(msg.Payload),
				"source":    msg.Metadata["source"],
				"timestamp": msg.Metadata["timestamp"],
				"id":        msg.ID,
			})
			if err != nil {
				continue
			}
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		}
	})
	if err != nil {
		c.Fail(err)
		return
	}
}

// Topics 获取当前所有可用 topic（用于前端下拉选择）
func (*Viewer) Topics(c fbr.Ctx) {
	topics := pipeline.Default.Queue().TopicsWithDepth()
	c.Succ(topics)
}

func encodeTopics(topics []string) string {
	b, _ := json.Marshal(topics)
	return string(b)
}

// remoteIP 返回客户端 IP（仅用于给 viewer 订阅者命名）
func remoteIP(c fbr.Ctx) string {
	ip := c.RequestCtx().RemoteAddr().String()
	if ip == "" {
		return "unknown"
	}
	return ip
}
