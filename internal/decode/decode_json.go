package decode

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*JSONFormatProcessor)(nil)
var _ Processor = (*JSONExtractProcessor)(nil)
var _ Processor = (*JSONFilterProcessor)(nil)

type JSONFormatProcessor struct {
	Pretty   bool
	OutTopic string
}

func NewJSONFormatProcessor(pretty bool, outTopic string) *JSONFormatProcessor {
	return &JSONFormatProcessor{Pretty: pretty, OutTopic: outTopic}
}

func (p *JSONFormatProcessor) Key() string  { return "json_format" }
func (p *JSONFormatProcessor) Name() string { return "JSON格式化" }

func (p *JSONFormatProcessor) Process(msg *types.Message) (*types.Message, error) {
	var data any
	if err := json.Unmarshal(msg.Payload, &data); err != nil {
		return nil, fmt.Errorf("json_format unmarshal: %w", err)
	}
	var payload []byte
	var err error
	if p.Pretty {
		payload, err = json.MarshalIndent(data, "", "  ")
	} else {
		payload, err = json.Marshal(data)
	}
	if err != nil {
		return nil, fmt.Errorf("json_format marshal: %w", err)
	}
	out := cloneMessage(msg)
	out.Payload = payload
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return out, nil
}

type JSONExtractProcessor struct {
	Path     string
	OutTopic string
}

func NewJSONExtractProcessor(path string, outTopic string) *JSONExtractProcessor {
	return &JSONExtractProcessor{Path: path, OutTopic: outTopic}
}

func (p *JSONExtractProcessor) Key() string  { return "json_extract" }
func (p *JSONExtractProcessor) Name() string { return "JSON提取" }

func (p *JSONExtractProcessor) Process(msg *types.Message) (*types.Message, error) {
	var data any
	if err := json.Unmarshal(msg.Payload, &data); err != nil {
		return nil, fmt.Errorf("json_extract unmarshal: %w", err)
	}
	value, ok := getJSONPathValue(data, p.Path)
	if !ok {
		return nil, fmt.Errorf("json_extract path not found: %s", p.Path)
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("json_extract marshal: %w", err)
	}
	out := cloneMessage(msg)
	out.Payload = payload
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return out, nil
}

type JSONFilterProcessor struct {
	Path     string
	Equals   string
	OutTopic string
}

func NewJSONFilterProcessor(path string, equals string, outTopic string) *JSONFilterProcessor {
	return &JSONFilterProcessor{Path: path, Equals: equals, OutTopic: outTopic}
}

func (p *JSONFilterProcessor) Key() string  { return "json_filter" }
func (p *JSONFilterProcessor) Name() string { return "JSON过滤" }

func (p *JSONFilterProcessor) Process(msg *types.Message) (*types.Message, error) {
	var data any
	if err := json.Unmarshal(msg.Payload, &data); err != nil {
		return nil, fmt.Errorf("json_filter unmarshal: %w", err)
	}
	value, ok := getJSONPathValue(data, p.Path)
	if !ok {
		return nil, nil
	}
	if fmt.Sprint(value) != p.Equals {
		return nil, nil
	}
	out := cloneMessage(msg)
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return out, nil
}

func getJSONPathValue(data any, path string) (any, bool) {
	if path == "" {
		return data, true
	}
	current := data
	for _, part := range strings.Split(path, ".") {
		m, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = m[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func cloneMessage(msg *types.Message) *types.Message {
	metadata := map[string]any{}
	for k, v := range msg.Metadata {
		metadata[k] = v
	}
	return &types.Message{
		ID:       msg.ID,
		Payload:  append([]byte(nil), msg.Payload...),
		Topic:    msg.Topic,
		Metadata: metadata,
	}
}
