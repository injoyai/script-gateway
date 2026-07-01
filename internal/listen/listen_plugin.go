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
	plugin *plugin.Plugin
}

func (l *PluginListener) Start(ctx context.Context) error {
	p, ok := plugin.Default.Get(plugin.TypeListener, l.name)
	if !ok {
		return fmt.Errorf("listener plugin %q not found", l.name)
	}
	l.closed.Store(false)
	l.msgCh = make(chan []byte, 100)
	l.ctx, l.cancel = context.WithCancel(ctx)
	l.plugin = p

	// 启动 Run（阻塞，Close 使其自然返回）
	go func() {
		defer func() { _ = recover() }()
		_ = plugin.RunListener(p)
	}()

	// 启动 Read 循环，把插件 Read 的数据推入 msgCh
	go l.readLoop()

	return nil
}

func (l *PluginListener) readLoop() {
	for {
		select {
		case <-l.ctx.Done():
			return
		default:
		}
		data, err := plugin.ReadListener(l.plugin)
		if err != nil {
			continue
		}
		if len(data) == 0 {
			continue
		}
		select {
		case l.msgCh <- data:
		case <-l.ctx.Done():
			return
		}
	}
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

func (l *PluginListener) Write(p []byte) (int, error) {
	if err := plugin.WriteListener(l.plugin, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (l *PluginListener) Closed() bool { return l.closed.Load() }

func (l *PluginListener) Close() error {
	l.closed.Store(true)
	if l.cancel != nil {
		l.cancel()
	}
	if l.plugin != nil && l.plugin.Close != nil {
		defer func() { _ = recover() }()
		_ = l.plugin.Close()
	}
	return nil
}
