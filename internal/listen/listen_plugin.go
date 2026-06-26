package listen

import (
	"context"
	"fmt"
	"io"
	"sync/atomic"

	"github.com/injoyai/script-gateway/internal/plugin"
)

var _ Listener = (*PluginListener)(nil)

// NewPluginListener 创建一个基于插件的监听器
// pluginName: plugins/listeners/<name> 中的插件名
// params: 插件运行时参数
// topic: 监听器关联 topic（默认透传，不修改）
func NewPluginListener(pluginName string, params map[string]any, topic string) *PluginListener {
	return &PluginListener{name: pluginName, params: params, topic: topic}
}

type PluginListener struct {
	name   string
	params map[string]any
	topic  string
	closed atomic.Bool
	ctx    context.Context
	cancel context.CancelFunc
	msgCh  chan []byte
}

func (l *PluginListener) Start(ctx context.Context) error {
	p, ok := plugin.Default.Get(plugin.TypeListener, l.name)
	if !ok {
		return fmt.Errorf("listener plugin %q not found", l.name)
	}
	l.closed.Store(false)
	l.msgCh = make(chan []byte, 100)
	l.ctx, l.cancel = context.WithCancel(ctx)

	emit := func(payload []byte, topic string, metadata map[string]any) error {
		select {
		case l.msgCh <- payload:
			return nil
		case <-l.ctx.Done():
			return l.ctx.Err()
		}
	}
	go func() {
		_ = plugin.RunListener(l.ctx, p, l.params, emit)
	}()
	return nil
}

func (l *PluginListener) ReadMessage() ([]byte, error) {
	select {
	case data, ok := <-l.msgCh:
		if !ok {
			return nil, io.EOF
		}
		return data, nil
	case <-l.ctx.Done():
		return nil, io.EOF
	}
}

func (l *PluginListener) Write(p []byte) (int, error) { return len(p), nil }

func (l *PluginListener) Closed() bool { return l.closed.Load() }

func (l *PluginListener) Close() error {
	l.closed.Store(true)
	if l.cancel != nil {
		l.cancel()
	}
	return nil
}
