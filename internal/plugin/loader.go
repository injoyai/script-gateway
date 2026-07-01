package plugin

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/injoyai/script-gateway/lib"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
	"gopkg.in/yaml.v3"
)

var typeDirs = map[string]string{
	TypeListener:  "listeners",
	TypeDecoder:   "decoders",
	TypeProcessor: "processors",
	TypePusher:    "pushers",
	TypeTask:      "tasks",
}

// LoadAll 扫描整个插件根目录，重置 failed 列表，加载所有插件
func (r *Registry) LoadAll() error {
	r.clearFailed()
	for typ, sub := range typeDirs {
		r.loadType(typ, sub)
	}
	return nil
}

// ReloadAll 等价于 LoadAll
func (r *Registry) ReloadAll() error { return r.LoadAll() }

// ReloadType 重载某一类型下所有插件
func (r *Registry) ReloadType(typ string) error {
	sub, ok := typeDirs[typ]
	if !ok {
		return fmt.Errorf("unknown plugin type: %s", typ)
	}
	r.loadType(typ, sub)
	return nil
}

// ReloadOne 重载单个插件
func (r *Registry) ReloadOne(typ, name string) error {
	sub, ok := typeDirs[typ]
	if !ok {
		return fmt.Errorf("unknown plugin type: %s", typ)
	}
	dir := filepath.Join(r.Dir(), sub, name)
	if _, err := os.Stat(dir); err != nil {
		return fmt.Errorf("plugin dir not found: %s", dir)
	}
	if err := r.loadOne(typ, dir); err != nil {
		r.markFailed(&LoadError{Type: typ, Name: name, Dir: dir, Err: err})
		return err
	}
	return nil
}

func (r *Registry) loadType(typ, sub string) {
	root := filepath.Join(r.Dir(), sub)
	entries, err := os.ReadDir(root)
	if err != nil {
		return // 目录不存在视为该类型零插件
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(root, e.Name())
		if err := r.loadOne(typ, dir); err != nil {
			r.markFailed(&LoadError{Type: typ, Name: e.Name(), Dir: dir, Err: err})
		}
	}
}

func (r *Registry) loadOne(expectType, dir string) error {
	yamlPath := filepath.Join(dir, "plugin.yaml")
	raw, err := os.ReadFile(yamlPath)
	if err != nil {
		return fmt.Errorf("read plugin.yaml: %w", err)
	}
	var mf Manifest
	if err := yaml.Unmarshal(raw, &mf); err != nil {
		return fmt.Errorf("parse plugin.yaml: %w", err)
	}
	if mf.Name == "" {
		return fmt.Errorf("plugin.yaml: missing name")
	}
	if mf.Type != expectType {
		return fmt.Errorf("plugin.yaml type=%q but dir implies %q", mf.Type, expectType)
	}
	if mf.Entry == "" {
		mf.Entry = "main.go"
	}
	if strings.Contains(mf.Entry, "..") || filepath.IsAbs(mf.Entry) {
		return fmt.Errorf("entry must be relative path within plugin dir")
	}
	mf.Dir = dir

	goFiles, err := collectGoFiles(dir, mf.Entry)
	if err != nil {
		return err
	}

	itp := interp.New(interp.Options{})
	if err := itp.Use(stdlib.Symbols); err != nil {
		return fmt.Errorf("use stdlib: %w", err)
	}
	if err := itp.Use(lib.Symbols); err != nil {
		return fmt.Errorf("use lib: %w", err)
	}

	var combined strings.Builder
	for _, f := range goFiles {
		b, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("read %s: %w", f, err)
		}
		combined.Write(b)
		combined.WriteByte('\n')
	}
	src := combined.String()
	if _, err := itp.Eval(src); err != nil {
		return fmt.Errorf("eval source: %w", err)
	}

	pkgName := extractPackageName(src)
	if pkgName == "" {
		return fmt.Errorf("cannot extract package name from source")
	}

	p := &Plugin{Manifest: mf, Interp: itp}
	if err := bindSymbols(p, itp, pkgName); err != nil {
		return err
	}
	if p.Init != nil {
		if err := invokeSafely(func() error { return p.Init(defaultParams(mf.Params)) }); err != nil {
			return fmt.Errorf("Init: %w", err)
		}
	}
	r.set(p)
	return nil
}

func collectGoFiles(dir, entry string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var others []string
	var entryFile string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		full := filepath.Join(dir, e.Name())
		if e.Name() == entry {
			entryFile = full
		} else {
			others = append(others, full)
		}
	}
	if entryFile == "" {
		return nil, fmt.Errorf("entry file %q not found", entry)
	}
	sort.Strings(others)
	return append([]string{entryFile}, others...), nil
}

// defaultParams 提取 Manifest.Params 中的 default 值作为 Init 入参
func defaultParams(specs []ParamSpec) map[string]any {
	out := map[string]any{}
	for _, s := range specs {
		if s.Default != nil {
			out[s.Key] = s.Default
		}
	}
	return out
}

var pkgRegex = regexp.MustCompile(`(?m)^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)`)

// extractPackageName 从源码中提取 package 子句中的包名
func extractPackageName(src string) string {
	m := pkgRegex.FindStringSubmatch(src)
	if len(m) >= 2 {
		return m[1]
	}
	return ""
}

func bindSymbols(p *Plugin, itp *interp.Interpreter, pkg string) error {
	// 可选符号
	if v, err := itp.Eval(pkg + ".Init"); err == nil {
		if fn, ok := v.Interface().(func(map[string]any) error); ok {
			p.Init = fn
		}
	}
	if v, err := itp.Eval(pkg + ".Close"); err == nil {
		if fn, ok := v.Interface().(func() error); ok {
			p.Close = fn
		}
	}

	switch p.Manifest.Type {
	case TypeListener:
		v, err := itp.Eval(pkg + ".Run")
		if err != nil {
			return fmt.Errorf("listener plugin must define Run: %w", err)
		}
		runFn, ok := v.Interface().(func() error)
		if !ok {
			return fmt.Errorf("listener Run signature mismatch")
		}
		v, err = itp.Eval(pkg + ".Read")
		if err != nil {
			return fmt.Errorf("listener plugin must define Read: %w", err)
		}
		readFn, ok := v.Interface().(func() ([]byte, error))
		if !ok {
			return fmt.Errorf("listener Read signature mismatch")
		}
		p.Run = runFn
		p.Read = readFn
		if v, err := itp.Eval(pkg + ".Write"); err == nil {
			if fn, ok := v.Interface().(func([]byte) error); ok {
				p.Write = fn
			}
		}
	case TypeDecoder:
		v, err := itp.Eval(pkg + ".Decode")
		if err != nil {
			return fmt.Errorf("decoder plugin must define Decode: %w", err)
		}
		fn, ok := v.Interface().(func([]byte, map[string]any) (map[string]any, error))
		if !ok {
			return fmt.Errorf("decoder Decode signature mismatch")
		}
		p.Decode = fn
	case TypeProcessor:
		v, err := itp.Eval(pkg + ".Process")
		if err != nil {
			return fmt.Errorf("processor plugin must define Process: %w", err)
		}
		fn, ok := v.Interface().(func([]byte, string, map[string]any, map[string]any) ([]byte, string, map[string]any, bool, error))
		if !ok {
			return fmt.Errorf("processor Process signature mismatch")
		}
		p.Process = fn
	case TypePusher:
		v, err := itp.Eval(pkg + ".Push")
		if err != nil {
			return fmt.Errorf("pusher plugin must define Push: %w", err)
		}
		fn, ok := v.Interface().(func(context.Context, []byte, string, map[string]any, map[string]any) error)
		if !ok {
			return fmt.Errorf("pusher Push signature mismatch")
		}
		p.Push = fn
	case TypeTask:
		v, err := itp.Eval(pkg + ".Run")
		if err != nil {
			return fmt.Errorf("task plugin must define Run: %w", err)
		}
		fn, ok := v.Interface().(func(context.Context, map[string]any) error)
		if !ok {
			return fmt.Errorf("task Run signature mismatch")
		}
		p.RunTask = fn
	default:
		return fmt.Errorf("unknown plugin type: %s", p.Manifest.Type)
	}
	return nil
}
