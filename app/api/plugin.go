package api

import (
	"encoding/json"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
	"github.com/injoyai/script-gateway/internal/plugin"
)

// Plugin 插件管理 API
type Plugin struct{}

// pluginInfo 单个插件信息
type pluginInfo struct {
	Name        string             `json:"name"`
	Display     string             `json:"display"`
	Version     string             `json:"version"`
	Type        string             `json:"type"`
	Description string             `json:"description"`
	Dir         string             `json:"dir"`
	Params      []plugin.ParamSpec `json:"params"`
	Running     bool               `json:"running"`
	Error       string             `json:"error,omitempty"`
}

// pluginGroup 按类型分组的插件列表
type pluginGroup struct {
	Loaded []pluginInfo        `json:"loaded"`
	Failed []*plugin.LoadError `json:"failed"`
}

// List 列出所有插件（按类型分组）
func (*Plugin) List(c fbr.Ctx) {
	all := plugin.Default.ListAll()
	failed := plugin.Default.ListFailed()

	// 按 type/name 索引失败项
	failedIdx := map[string]*plugin.LoadError{}
	for _, f := range failed {
		failedIdx[f.Type+"/"+f.Name] = f
	}

	out := map[string]pluginGroup{}
	for typ, list := range all {
		g := pluginGroup{Failed: []*plugin.LoadError{}}
		for _, p := range list {
			info := pluginInfo{
				Name:        p.Manifest.Name,
				Display:     p.Manifest.Display,
				Version:     p.Manifest.Version,
				Type:        p.Manifest.Type,
				Description: p.Manifest.Description,
				Dir:         p.Manifest.Dir,
				Params:      p.Manifest.Params,
			}
			if typ == plugin.TypeTask {
				info.Running = pipeline.Default.IsTaskPluginRunning(p.Manifest.Name)
				if e := pipeline.Default.TaskPluginError(p.Manifest.Name); e != "" {
					info.Error = e
				}
			}
			g.Loaded = append(g.Loaded, info)
		}
		// 收集该类型下的失败项
		for _, f := range failed {
			if f.Type == typ {
				g.Failed = append(g.Failed, f)
			}
		}
		out[typ] = g
	}
	c.Succ(out)
}

// ListByType 列出某类型的插件
func (*Plugin) ListByType(c fbr.Ctx) {
	typ := c.GetString("type")
	if typ == "" {
		c.Fail("type 不能为空")
		return
	}
	list := plugin.Default.List(typ)
	out := make([]pluginInfo, 0, len(list))
	for _, p := range list {
		info := pluginInfo{
			Name:        p.Manifest.Name,
			Display:     p.Manifest.Display,
			Version:     p.Manifest.Version,
			Type:        p.Manifest.Type,
			Description: p.Manifest.Description,
			Dir:         p.Manifest.Dir,
			Params:      p.Manifest.Params,
		}
		if typ == plugin.TypeTask {
			info.Running = pipeline.Default.IsTaskPluginRunning(p.Manifest.Name)
			if e := pipeline.Default.TaskPluginError(p.Manifest.Name); e != "" {
				info.Error = e
			}
		}
		out = append(out, info)
	}
	c.Succ(out)
}

// ReloadAll 重新加载所有插件
func (*Plugin) ReloadAll(c fbr.Ctx) {
	// 先停止所有 task 插件
	for _, name := range pipeline.Default.RunningTaskPlugins() {
		pipeline.Default.StopTaskPlugin(name)
	}
	if err := plugin.Default.ReloadAll(); err != nil {
		c.Fail(err)
		return
	}
	// 重新启动 task 插件
	for _, p := range plugin.Default.List(plugin.TypeTask) {
		if err := pipeline.Default.StartTaskPlugin(p.Manifest.Name, nil); err != nil {
			// 启动失败不中断流程，仅记录
			_ = err
		}
	}
	c.Succ(true)
}

// ReloadType 重载某类型的所有插件
func (*Plugin) ReloadType(c fbr.Ctx) {
	typ := c.GetString("type")
	if typ == "" {
		c.Fail("type 不能为空")
		return
	}
	if typ == plugin.TypeTask {
		for _, name := range pipeline.Default.RunningTaskPlugins() {
			pipeline.Default.StopTaskPlugin(name)
		}
	}
	if err := plugin.Default.ReloadType(typ); err != nil {
		c.Fail(err)
		return
	}
	if typ == plugin.TypeTask {
		for _, p := range plugin.Default.List(plugin.TypeTask) {
			_ = pipeline.Default.StartTaskPlugin(p.Manifest.Name, nil)
		}
	}
	c.Succ(true)
}

// ReloadOne 重载单个插件
func (*Plugin) ReloadOne(c fbr.Ctx) {
	typ := c.GetString("type")
	name := c.GetString("name")
	if typ == "" || name == "" {
		c.Fail("type 和 name 不能为空")
		return
	}
	if typ == plugin.TypeTask {
		pipeline.Default.StopTaskPlugin(name)
	}
	if err := plugin.Default.ReloadOne(typ, name); err != nil {
		c.Fail(err)
		return
	}
	if typ == plugin.TypeTask {
		if err := pipeline.Default.StartTaskPlugin(name, nil); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(true)
}

// StartTask 启动 task 插件（使用数据库中保存的参数）
func (*Plugin) StartTask(c fbr.Ctx) {
	name := c.GetString("name")
	if name == "" {
		c.Fail("name 不能为空")
		return
	}
	// 从数据库读取参数
	var params map[string]any
	var cfg model.TaskPluginConfig
	if has, _ := common.DB.Where("name = ?", name).Get(&cfg); has && cfg.Params != "" {
		_ = json.Unmarshal([]byte(cfg.Params), &params)
	}
	if err := pipeline.Default.StartTaskPlugin(name, params); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

// StopTask 停止 task 插件
func (*Plugin) StopTask(c fbr.Ctx) {
	name := c.GetString("name")
	if name == "" {
		c.Fail("name 不能为空")
		return
	}
	pipeline.Default.StopTaskPlugin(name)
	c.Succ(true)
}

// SaveTaskConfig 保存 task 插件的参数配置
func (*Plugin) SaveTaskConfig(c fbr.Ctx) {
	var req struct {
		Name   string         `json:"name"`
		Params map[string]any `json:"params"`
		Enable bool           `json:"enable"`
	}
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		c.Fail(err)
		return
	}
	if req.Name == "" {
		c.Fail("name 不能为空")
		return
	}
	paramsJSON, _ := json.Marshal(req.Params)
	// 查找现有记录
	var existing model.TaskPluginConfig
	has, _ := common.DB.Where("name = ?", req.Name).Get(&existing)
	if has {
		existing.Params = string(paramsJSON)
		existing.Enable = req.Enable
		if _, err := common.DB.ID(existing.ID).Update(&existing); err != nil {
			c.Fail(err)
			return
		}
	} else {
		record := &model.TaskPluginConfig{
			Name:   req.Name,
			Params: string(paramsJSON),
			Enable: req.Enable,
		}
		if _, err := common.DB.InsertOne(record); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(true)
}

// GetTaskConfig 获取 task 插件的参数配置
func (*Plugin) GetTaskConfig(c fbr.Ctx) {
	name := c.GetString("name")
	if name == "" {
		c.Fail("name 不能为空")
		return
	}
	var cfg model.TaskPluginConfig
	if has, _ := common.DB.Where("name = ?", name).Get(&cfg); !has {
		c.Succ(map[string]any{"name": name, "params": map[string]any{}, "enable": false})
		return
	}
	var params map[string]any
	if cfg.Params != "" {
		_ = json.Unmarshal([]byte(cfg.Params), &params)
	}
	c.Succ(map[string]any{
		"name":   cfg.Name,
		"params": params,
		"enable": cfg.Enable,
	})
}

// ListTaskConfig 列出所有 task 插件配置
func (*Plugin) ListTaskConfig(c fbr.Ctx) {
	var list []*model.TaskPluginConfig
	_ = common.DB.Find(&list)
	out := make([]map[string]any, 0, len(list))
	for _, cfg := range list {
		var params map[string]any
		if cfg.Params != "" {
			_ = json.Unmarshal([]byte(cfg.Params), &params)
		}
		out = append(out, map[string]any{
			"name":   cfg.Name,
			"params": params,
			"enable": cfg.Enable,
		})
	}
	c.Succ(out)
}

// Types 返回所有插件类型
func (*Plugin) Types(c fbr.Ctx) {
	c.Succ([]string{
		plugin.TypeListener,
		plugin.TypeDecoder,
		plugin.TypeProcessor,
		plugin.TypePusher,
		plugin.TypeTask,
	})
}
