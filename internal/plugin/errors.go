package plugin

import "fmt"

// LoadError 描述单个插件加载失败的原因
type LoadError struct {
	Type string // listener|decoder|processor|pusher|task
	Name string
	Dir  string
	Err  error
}

func (e *LoadError) Error() string {
	return fmt.Sprintf("plugin %s/%s in %s: %v", e.Type, e.Name, e.Dir, e.Err)
}

func (e *LoadError) Unwrap() error { return e.Err }
