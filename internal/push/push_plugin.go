package push

import (
	"context"
	"fmt"
	"time"

	"github.com/injoyai/script-gateway/internal/plugin"
	"github.com/injoyai/script-gateway/internal/types"
)

// PluginPusher 通过插件实现的推送器
type PluginPusher struct {
	PluginName string
	Params     map[string]any
	Timeout    time.Duration
	topics     []string
}

// NewPluginPusher 创建一个基于插件的推送器
func NewPluginPusher(name string, params map[string]any, topics []string) *PluginPusher {
	return &PluginPusher{PluginName: name, Params: params, Timeout: 3 * time.Second, topics: topics}
}

// Push 推送消息到对应 pusher 插件
func (p *PluginPusher) Push(msg *types.Message) error {
	plg, ok := plugin.Default.Get(plugin.TypePusher, p.PluginName)
	if !ok {
		return fmt.Errorf("pusher plugin %q not found", p.PluginName)
	}
	return plugin.InvokePush(context.Background(), plg, msg.Payload, msg.Topic, msg.Metadata, p.Params, p.Timeout)
}

func (p *PluginPusher) Close() error { return nil }

func (p *PluginPusher) Topics() []string { return p.topics }
