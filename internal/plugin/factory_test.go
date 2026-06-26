package plugin

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestInvokeSafely_RecoversPanic(t *testing.T) {
	err := invokeSafely(func() error { panic("boom") })
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("expect recovered error, got %v", err)
	}
}

func TestInvokeDecode_Timeout(t *testing.T) {
	p := &Plugin{
		Manifest: Manifest{Name: "slow", Type: TypeDecoder},
		Decode: func(payload []byte, params map[string]any) (map[string]any, error) {
			time.Sleep(100 * time.Millisecond)
			return nil, nil
		},
	}
	_, err := InvokeDecode(context.Background(), p, []byte("x"), nil, 10*time.Millisecond)
	if err == nil || !strings.Contains(err.Error(), "timeout") {
		t.Fatalf("expect timeout, got %v", err)
	}
	// 等候后台 goroutine 退出，避免 mu 残留影响其它用例
	time.Sleep(120 * time.Millisecond)
}

func TestInvokeProcess_Pass(t *testing.T) {
	p := &Plugin{
		Manifest: Manifest{Name: "ok", Type: TypeProcessor},
		Process: func(payload []byte, topic string, metadata, params map[string]any) ([]byte, string, map[string]any, bool, error) {
			return []byte("X"), "t", nil, true, nil
		},
	}
	np, nt, _, pass, err := InvokeProcess(context.Background(), p, []byte("x"), "", nil, nil, time.Second)
	if err != nil || !pass || string(np) != "X" || nt != "t" {
		t.Fatalf("bad result: %s %s %v %v", np, nt, pass, err)
	}
}

// 静默 sync 包未使用警告（保留以备未来并发用例）
var _ sync.Mutex
