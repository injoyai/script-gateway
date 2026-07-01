package plugin

import (
	"context"
	"sync"

	"github.com/traefik/yaegi/interp"
)

const (
	TypeListener  = "listener"
	TypeDecoder   = "decoder"
	TypeProcessor = "processor"
	TypePusher    = "pusher"
	TypeTask      = "task"
)

// ParamSpec 单个参数定义
type ParamSpec struct {
	Key         string   `yaml:"key" json:"key"`
	Label       string   `yaml:"label,omitempty" json:"label,omitempty"`
	Type        string   `yaml:"type" json:"type"`
	Default     any      `yaml:"default,omitempty" json:"default,omitempty"`
	Required    bool     `yaml:"required,omitempty" json:"required,omitempty"`
	Description string   `yaml:"description,omitempty" json:"description,omitempty"`
	Options     []string `yaml:"options,omitempty" json:"options,omitempty"`
	Min         *float64 `yaml:"min,omitempty" json:"min,omitempty"`
	Max         *float64 `yaml:"max,omitempty" json:"max,omitempty"`
}

// Manifest 插件元数据（plugin.yaml）
type Manifest struct {
	Name        string      `yaml:"name" json:"name"`
	Display     string      `yaml:"display,omitempty" json:"display,omitempty"`
	Version     string      `yaml:"version,omitempty" json:"version,omitempty"`
	Type        string      `yaml:"type" json:"type"`
	Entry       string      `yaml:"entry,omitempty" json:"entry,omitempty"`
	Description string      `yaml:"description,omitempty" json:"description,omitempty"`
	Params      []ParamSpec `yaml:"params,omitempty" json:"params,omitempty"`
	Dir         string      `yaml:"-" json:"dir"`
}

// Plugin 已加载的插件实例
type Plugin struct {
	Manifest Manifest
	Interp   *interp.Interpreter
	Init     func(map[string]any) error
	Close    func() error

	// 各类型入口（按 Manifest.Type 仅对应类型被填充）
	Run     func() error
	Read    func() ([]byte, error)
	Write   func([]byte) error
	Decode  func([]byte, map[string]any) (map[string]any, error)
	Process func([]byte, string, map[string]any, map[string]any) ([]byte, string, map[string]any, bool, error)
	Push    func(context.Context, []byte, string, map[string]any, map[string]any) error
	RunTask func(context.Context, map[string]any) error

	Mu sync.Mutex
}
