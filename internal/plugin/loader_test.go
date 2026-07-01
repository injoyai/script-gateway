package plugin

import (
	"os"
	"path/filepath"
	"testing"
)

func writePlugin(t *testing.T, root, typ, name, yamlText, gocode string) {
	t.Helper()
	dir := filepath.Join(root, typ+"s", name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "plugin.yaml"), []byte(yamlText), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte(gocode), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestLoader_LoadDecoder(t *testing.T) {
	root := t.TempDir()
	writePlugin(t, root, "decoder", "echo",
		"name: echo\nversion: v1.0\ntype: decoder\nentry: main.go\n",
		`package echo

func Decode(payload []byte, params map[string]any) (map[string]any, error) {
    return map[string]any{"raw": string(payload)}, nil
}
`)
	r := NewRegistry(root)
	if err := r.LoadAll(); err != nil {
		t.Fatalf("LoadAll error: %v", err)
	}
	p, ok := r.Get(TypeDecoder, "echo")
	if !ok {
		t.Fatalf("plugin echo not loaded; failed: %+v", r.ListFailed())
	}
	out, err := p.Decode([]byte("hi"), nil)
	if err != nil || out["raw"] != "hi" {
		t.Fatalf("decode wrong: %v %v", out, err)
	}
}

func TestLoader_TypeMismatch(t *testing.T) {
	root := t.TempDir()
	writePlugin(t, root, "decoder", "bad",
		"name: bad\ntype: listener\nentry: main.go\n",
		"package bad\n")
	r := NewRegistry(root)
	_ = r.LoadAll()
	if len(r.ListFailed()) == 0 {
		t.Fatalf("expect failed entry")
	}
}

func TestLoader_MissingEntry(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "decoders", "x")
	_ = os.MkdirAll(dir, 0755)
	_ = os.WriteFile(filepath.Join(dir, "plugin.yaml"),
		[]byte("name: x\ntype: decoder\n"), 0644)
	r := NewRegistry(root)
	_ = r.LoadAll()
	if len(r.ListFailed()) == 0 {
		t.Fatalf("expect failed when entry missing")
	}
}

// TestLoader_TimerPluginLoads 验证真实的 plugins/listeners/timer 能被加载
func TestLoader_TimerPluginLoads(t *testing.T) {
	r := NewRegistry("../../plugins")
	if err := r.LoadAll(); err != nil {
		t.Fatalf("LoadAll error: %v", err)
	}
	if failed := r.ListFailed(); len(failed) > 0 {
		t.Fatalf("expected no failures, got: %+v", failed)
	}
	p, ok := r.Get(TypeListener, "timer")
	if !ok {
		t.Fatalf("listener timer not loaded")
	}
	if p.Run == nil || p.Read == nil || p.Close == nil {
		t.Fatalf("timer: missing Run/Read/Close")
	}
}

// TestLoader_AllTypes 验证五种插件类型都能正确加载并绑定符号
func TestLoader_AllTypes(t *testing.T) {
	root := t.TempDir()

	// listener
	writePlugin(t, root, "listener", "tick",
		"name: tick\ntype: listener\nentry: main.go\n",
		`package tick

func Run() error {
	return nil
}

func Close() error {
	return nil
}

func Read() ([]byte, error) {
	return []byte("tick"), nil
}

func Write(p []byte) error {
	return nil
}
`)

	// decoder
	writePlugin(t, root, "decoder", "dec",
		"name: dec\ntype: decoder\nentry: main.go\n",
		`package dec

func Decode(payload []byte, params map[string]any) (map[string]any, error) {
	return map[string]any{"len": len(payload)}, nil
}
`)

	// processor
	writePlugin(t, root, "processor", "proc",
		"name: proc\ntype: processor\nentry: main.go\n",
		`package proc

func Process(payload []byte, topic string, metadata, params map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, nil, true, nil
}
`)

	// pusher
	writePlugin(t, root, "pusher", "psh",
		"name: psh\ntype: pusher\nentry: main.go\n",
		`package psh

import "context"

func Push(ctx context.Context, payload []byte, topic string, metadata, params map[string]any) error {
	return nil
}
`)

	// task
	writePlugin(t, root, "task", "tsk",
		"name: tsk\ntype: task\nentry: main.go\n",
		`package tsk

import "context"

func Run(ctx context.Context, params map[string]any) error {
	<-ctx.Done()
	return nil
}
`)

	r := NewRegistry(root)
	if err := r.LoadAll(); err != nil {
		t.Fatalf("LoadAll error: %v", err)
	}
	if failed := r.ListFailed(); len(failed) > 0 {
		t.Fatalf("expected no failures, got: %+v", failed)
	}

	for _, tc := range []struct {
		typ  string
		name string
	}{
		{TypeListener, "tick"},
		{TypeDecoder, "dec"},
		{TypeProcessor, "proc"},
		{TypePusher, "psh"},
		{TypeTask, "tsk"},
	} {
		p, ok := r.Get(tc.typ, tc.name)
		if !ok {
			t.Fatalf("plugin %s/%s not found", tc.typ, tc.name)
		}
		switch tc.typ {
		case TypeListener:
			if p.Run == nil || p.Close == nil || p.Read == nil || p.Write == nil {
				t.Fatalf("listener %s: script-style listener functions not bound", tc.name)
			}
		case TypeDecoder:
			if p.Decode == nil {
				t.Fatalf("decoder %s: Decode not bound", tc.name)
			}
		case TypeProcessor:
			if p.Process == nil {
				t.Fatalf("processor %s: Process not bound", tc.name)
			}
		case TypePusher:
			if p.Push == nil {
				t.Fatalf("pusher %s: Push not bound", tc.name)
			}
		case TypeTask:
			if p.RunTask == nil {
				t.Fatalf("task %s: RunTask not bound", tc.name)
			}
		}
	}
}
