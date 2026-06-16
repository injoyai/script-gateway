package push

import "github.com/injoyai/script-gateway/internal/types"

var _ Dispatcher = (*RocketMQDispatcher)(nil)

type RocketMQDispatcher struct {
	topics []string
}

func NewRocketMQDispatcher(topics []string) *RocketMQDispatcher {
	return &RocketMQDispatcher{topics: topics}
}

func (this *RocketMQDispatcher) Push(msg *types.Message) error {
	// TODO: 实现 RocketMQ 分发
	return nil
}

func (this *RocketMQDispatcher) Close() error { return nil }

func (this *RocketMQDispatcher) Topics() []string { return this.topics }
