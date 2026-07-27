package push

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Dispatcher = (*StdoutDispatcher)(nil)

// StdoutDispatcher 将消息直接打印到服务端终端（stdout），用于调试
type StdoutDispatcher struct {
	topics []string
}

func NewStdoutDispatcher(topics []string) *StdoutDispatcher {
	return &StdoutDispatcher{topics: topics}
}

func (this *StdoutDispatcher) Push(msg *types.Message) error {
	ts := time.Now().Format("2006-01-02 15:04:05.000")
	// payload 为合法 JSON 时美化为多行，否则原样打印
	var pretty any
	if json.Unmarshal(msg.Payload, &pretty) == nil {
		bs, _ := json.MarshalIndent(pretty, "", "  ")
		fmt.Fprintf(os.Stdout, "[%s] [stdout] topic=%s\n%s\n", ts, msg.Topic, string(bs))
	} else {
		fmt.Fprintf(os.Stdout, "[%s] [stdout] topic=%s\n%s\n", ts, msg.Topic, string(msg.Payload))
	}
	return nil
}

func (this *StdoutDispatcher) Close() error { return nil }

func (this *StdoutDispatcher) Topics() []string { return this.topics }
