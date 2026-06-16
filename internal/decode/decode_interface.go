package decode

import (
	"fmt"

	"github.com/injoyai/script-gateway/internal/types"
)

// Processor 数据处理器接口
type Processor interface {
	Process(msg *types.Message) (*types.Message, error)
	Key() string
	Name() string
}

// Pipeline 处理器链，顺序执行
type Pipeline struct {
	processors []Processor
}

// NewPipeline 创建处理器链
func NewPipeline(processors ...Processor) *Pipeline {
	return &Pipeline{processors: processors}
}

// Process 顺序执行处理器，错误中断链路
func (p *Pipeline) Process(msg *types.Message) (*types.Message, error) {
	var err error
	current := msg
	for _, proc := range p.processors {
		current, err = proc.Process(current)
		if err != nil {
			return nil, fmt.Errorf("processor %s failed: %w", proc.Key(), err)
		}
		if current == nil {
			return nil, fmt.Errorf("processor %s returned nil message", proc.Key())
		}
	}
	return current, nil
}

// Processors 返回处理器列表
func (p *Pipeline) Processors() []Processor {
	return p.processors
}

// Info 处理器信息
type Info struct {
	Key  string
	Name string
}

func All() []*Info {
	return []*Info{
		{Key: "json_format", Name: "JSON格式化"},
		{Key: "json_extract", Name: "JSON提取"},
		{Key: "json_filter", Name: "JSON过滤"},
		{Key: "text_replace", Name: "文本替换"},
		{Key: "text_regex_filter", Name: "正则过滤"},
		{Key: "field_map", Name: "字段映射"},
		{Key: "dlt645", Name: "DLT645协议"},
		{Key: "modbus_rtu", Name: "Modbus RTU协议"},
		{Key: "modbus_tcp", Name: "Modbus TCP协议"},
		{Key: "script", Name: "自定义脚本"},
		{Key: "pass", Name: "忽略"},
	}
}
