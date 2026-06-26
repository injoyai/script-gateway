package decode

import "github.com/injoyai/script-gateway/internal/types"

var _ Processor = (*Nothing)(nil)

type Nothing struct{}

func (this *Nothing) Process(msg *types.Message) ([]*types.Message, error) {
	return []*types.Message{msg}, nil
}

func (this *Nothing) Key() string  { return "pass" }
func (this *Nothing) Name() string { return "忽略" }

// Decode 保留旧接口兼容
func (this *Nothing) Decode(bs []byte) (map[string]any, error) {
	return nil, nil
}
