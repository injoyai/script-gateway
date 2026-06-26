package plugin

import (
	"sync"
	"testing"
)

func TestRegistry_GetAndList(t *testing.T) {
	r := NewRegistry("plugins")
	p := &Plugin{Manifest: Manifest{Name: "a", Type: TypeDecoder}}
	r.set(p)

	got, ok := r.Get(TypeDecoder, "a")
	if !ok || got != p {
		t.Fatalf("expect plugin a, got %v ok=%v", got, ok)
	}
	if len(r.List(TypeDecoder)) != 1 {
		t.Fatalf("list len mismatch")
	}
	if _, ok := r.Get(TypeDecoder, "missing"); ok {
		t.Fatalf("expect not found")
	}
}

func TestRegistry_ConcurrentGet(t *testing.T) {
	r := NewRegistry("plugins")
	r.set(&Plugin{Manifest: Manifest{Name: "x", Type: TypeProcessor}})
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.Get(TypeProcessor, "x")
		}()
	}
	wg.Wait()
}
