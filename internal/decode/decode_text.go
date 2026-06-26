package decode

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*TextReplaceProcessor)(nil)
var _ Processor = (*TextRegexFilterProcessor)(nil)

type TextReplaceProcessor struct {
	From     string
	To       string
	OutTopic string
}

func NewTextReplaceProcessor(from string, to string, outTopic string) *TextReplaceProcessor {
	return &TextReplaceProcessor{From: from, To: to, OutTopic: outTopic}
}

func (p *TextReplaceProcessor) Key() string  { return "text_replace" }
func (p *TextReplaceProcessor) Name() string { return "文本替换" }

func (p *TextReplaceProcessor) Process(msg *types.Message) ([]*types.Message, error) {
	out := cloneMessage(msg)
	out.Payload = []byte(strings.ReplaceAll(string(msg.Payload), p.From, p.To))
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return []*types.Message{out}, nil
}

type TextRegexFilterProcessor struct {
	Pattern  string
	OutTopic string
}

func NewTextRegexFilterProcessor(pattern string, outTopic string) *TextRegexFilterProcessor {
	return &TextRegexFilterProcessor{Pattern: pattern, OutTopic: outTopic}
}

func (p *TextRegexFilterProcessor) Key() string  { return "text_regex_filter" }
func (p *TextRegexFilterProcessor) Name() string { return "正则过滤" }

func (p *TextRegexFilterProcessor) Process(msg *types.Message) ([]*types.Message, error) {
	re, err := regexp.Compile(p.Pattern)
	if err != nil {
		return nil, fmt.Errorf("text_regex_filter compile: %w", err)
	}
	if !re.Match(msg.Payload) {
		return nil, nil
	}
	out := cloneMessage(msg)
	if p.OutTopic != "" {
		out.Topic = p.OutTopic
	}
	return []*types.Message{out}, nil
}
