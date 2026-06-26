package plugin

import "sync"

type Registry struct {
	dir        string
	listeners  map[string]*Plugin
	decoders   map[string]*Plugin
	processors map[string]*Plugin
	pushers    map[string]*Plugin
	tasks      map[string]*Plugin
	failed     map[string]*LoadError
	mu         sync.RWMutex
}

func NewRegistry(dir string) *Registry {
	return &Registry{
		dir:        dir,
		listeners:  map[string]*Plugin{},
		decoders:   map[string]*Plugin{},
		processors: map[string]*Plugin{},
		pushers:    map[string]*Plugin{},
		tasks:      map[string]*Plugin{},
		failed:     map[string]*LoadError{},
	}
}

func (r *Registry) Dir() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.dir
}

func (r *Registry) SetDir(dir string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.dir = dir
}

func (r *Registry) bucket(typ string) map[string]*Plugin {
	switch typ {
	case TypeListener:
		return r.listeners
	case TypeDecoder:
		return r.decoders
	case TypeProcessor:
		return r.processors
	case TypePusher:
		return r.pushers
	case TypeTask:
		return r.tasks
	}
	return nil
}

func (r *Registry) Get(typ, name string) (*Plugin, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	b := r.bucket(typ)
	if b == nil {
		return nil, false
	}
	p, ok := b[name]
	return p, ok
}

func (r *Registry) List(typ string) []*Plugin {
	r.mu.RLock()
	defer r.mu.RUnlock()
	b := r.bucket(typ)
	out := make([]*Plugin, 0, len(b))
	for _, p := range b {
		out = append(out, p)
	}
	return out
}

func (r *Registry) ListAll() map[string][]*Plugin {
	out := map[string][]*Plugin{}
	for _, t := range []string{TypeListener, TypeDecoder, TypeProcessor, TypePusher, TypeTask} {
		out[t] = r.List(t)
	}
	return out
}

func (r *Registry) ListFailed() []*LoadError {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*LoadError, 0, len(r.failed))
	for _, e := range r.failed {
		out = append(out, e)
	}
	return out
}

func (r *Registry) set(p *Plugin) {
	r.mu.Lock()
	defer r.mu.Unlock()
	b := r.bucket(p.Manifest.Type)
	if b == nil {
		return
	}
	if old, ok := b[p.Manifest.Name]; ok && old.Close != nil {
		_ = old.Close()
	}
	b[p.Manifest.Name] = p
}

func (r *Registry) markFailed(e *LoadError) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failed[e.Type+"/"+e.Name] = e
}

func (r *Registry) clearFailed() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failed = map[string]*LoadError{}
}

// Default 包级单例，dir 在 init 时为空，由 main 初始化
var Default = NewRegistry("plugins")
