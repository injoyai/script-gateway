package decode

import (
	"context"
	"encoding/json"
	"time"

	"github.com/injoyai/script-gateway/internal/plugin"
	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*PluginDecoder)(nil)

// PluginDecoder 通过插件实现的解码处理器
type PluginDecoder struct {
	PluginName string
	Params     map[string]any
	Timeout    time.Duration
}

// NewPluginDecoder 创建一个基于插件的解码器
func NewPluginDecoder(name string, params map[string]any) *PluginDecoder {
	return &PluginDecoder{PluginName: name, Params: params, Timeout: 50 * time.Millisecond}
}

func (d *PluginDecoder) Key() string  { return "plugin:" + d.PluginName }
func (d *PluginDecoder) Name() string { return "插件解码:" + d.PluginName }

func (d *PluginDecoder) Process(msg *types.Message) ([]*types.Message, error) {
	p, ok := plugin.Default.Get(plugin.TypeDecoder, d.PluginName)
	if !ok {
		return []*types.Message{msg}, nil
	}
	out, err := plugin.InvokeDecode(context.Background(), p, msg.Payload, d.Params, d.Timeout)
	if err != nil {
		return nil, err
	}
	if out == nil {
		return []*types.Message{msg}, nil
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return []*types.Message{{ID: msg.ID, Payload: b, Topic: msg.Topic, Metadata: msg.Metadata}}, nil
}
