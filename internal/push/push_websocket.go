package push

import (
	"github.com/injoyai/ios/client"
	"github.com/injoyai/script-gateway/internal/types"
)

var _ Pusher = (*Websocket)(nil)

type Websocket struct {
	Address string
	*client.Client
}

// PushRaw implements the Pusher interface
func (this *Websocket) PushRaw(msg any) error {
	if this.Client != nil {
		this.Client.WriteAny(msg)
	}
	return nil
}

// Push implements the Pusher interface
func (this *Websocket) Push(msg any) error {
	return this.PushRaw(msg)
}

// WebsocketDispatcher 适配 Dispatcher 接口
var _ Dispatcher = (*WebsocketDispatcher)(nil)

type WebsocketDispatcher struct {
	Address string
	Client  *client.Client
	topics  []string
}

func NewWebsocketDispatcher(addr string, topics []string) *WebsocketDispatcher {
	return &WebsocketDispatcher{Address: addr, topics: topics}
}

func (this *WebsocketDispatcher) Push(msg *types.Message) error {
	if this.Client != nil {
		this.Client.WriteAny(msg.Payload)
	}
	return nil
}

func (this *WebsocketDispatcher) Close() error { return nil }

func (this *WebsocketDispatcher) Topics() []string { return this.topics }
