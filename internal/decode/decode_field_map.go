package decode

import (
	"encoding/json"
	"fmt"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*FieldMapProcessor)(nil)

type FieldMapProcessor struct {
	Mapping  map[string]string
	OutTopic string
}

func NewFieldMapProcessor(mapping map[string]string, outTopic string) *FieldMapProcessor {
	return &FieldMapProcessor{Mapping: mapping, OutTopic: outTopic}
}

func (p *FieldMapProcessor) Key() string  { return "field_map" }
func (p *FieldMapProcessor) Name() string { return "字段映射" }

func (p *FieldMapProcessor) Process(msg *types.Message) (*types.Message, error) {
	var data map[string]any
	if err := json.Unmarshal(msg.Payload, &data); err != nil {
		return nil, fmt.Errorf("field_map unmarshal: %w", err)
	}
	outData := make(map[string]any, len(p.Mapping))
	for from, to := range p.Mapping {
		if value, ok := data[from]; ok {
			outData[to] = value
		}
	}
	payload, err := json.Marshal(outData)
	if err != nil {
		return nil, fmt.Errorf("field_map marshal: %w", err)
	}
	out := cloneMessage(msg)
	out.Payload = payload
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return out, nil
}
