package types

import (
	"crypto/rand"
	"fmt"
	"time"
)

// Message 是管道中流转的统一消息类型
type Message struct {
	ID       string         `json:"id"`       // 唯一ID
	Payload  []byte         `json:"payload"`  // 原始数据
	Topic    string         `json:"topic"`    // topic（来自监听器配置或处理器动态指定）
	Metadata map[string]any `json:"metadata"` // 来源监听器ID、时间戳、链路ID等
}

// NewMessage 创建新消息
func NewMessage(payload []byte, topic string) *Message {
	return &Message{
		ID:      generateID(),
		Payload: payload,
		Topic:   topic,
		Metadata: map[string]any{
			"timestamp": time.Now().UnixMilli(),
		},
	}
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
