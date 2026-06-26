package decode

import (
	"fmt"

	"github.com/injoyai/script-gateway/internal/types"
)

// Processor 数据处理器接口
//
// Process 返回 []*Message：
//   - 长度 0 或返回 nil 切片：丢弃该消息（不向下游传递）
//   - 长度 1：常规一进一出
//   - 长度 >1：一进多出（分流场景，如脚本按 topic 拆分）
type Processor interface {
	Process(msg *types.Message) ([]*types.Message, error)
	Key() string
	Name() string
}

// Pipeline 处理器链，顺序执行（fan-out 模式：上游产出的每条消息独立流过下游）
type Pipeline struct {
	processors []Processor
}

// NewPipeline 创建处理器链
func NewPipeline(processors ...Processor) *Pipeline {
	return &Pipeline{processors: processors}
}

// Process 顺序执行处理器，错误中断链路。
// 返回最终产出的消息列表（可能 0 / 1 / N 条）。
func (p *Pipeline) Process(msg *types.Message) ([]*types.Message, error) {
	current := []*types.Message{msg}
	for _, proc := range p.processors {
		next := make([]*types.Message, 0, len(current))
		for _, m := range current {
			out, err := proc.Process(m)
			if err != nil {
				return nil, fmt.Errorf("processor %s failed: %w", proc.Key(), err)
			}
			next = append(next, out...)
		}
		current = next
		if len(current) == 0 {
			// 所有消息均被丢弃，提前结束
			return nil, nil
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
		{Key: "plugin", Name: "插件处理器"},
		{Key: "pass", Name: "忽略"},
	}
}
