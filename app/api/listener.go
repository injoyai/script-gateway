package api

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// ListenerParent 监听父级 API
type ListenerParent struct{}

func (*ListenerParent) List(c fbr.Ctx) {
	var list []*model.ListenerParent
	if err := common.DB.Find(&list); err != nil {
		c.Fail(err)
		return
	}
	// 附加运行时错误信息 + 展开平铺字段（兼容前端）
	parentErrs := pipeline.Default.ParentErrors()
	running := pipeline.Default.RunningParents()
	type parentResp struct {
		model.ParentFlatView
		ErrorInfo string `json:"error_info"`
		Running   bool   `json:"running"`
	}
	resp := make([]parentResp, len(list))
	for i, item := range list {
		resp[i] = parentResp{ParentFlatView: item.FlatView(), ErrorInfo: parentErrs[item.ID], Running: running[item.ID]}
	}
	c.Succ(resp)
}

func (*ListenerParent) Create(c fbr.Ctx) {
	data, err := model.NormalizeParent(c.Body())
	if err != nil {
		c.Fail(err)
		return
	}
	if err := validateParent(data); err != nil {
		c.Fail(err.Error())
		return
	}
	if _, err := common.DB.InsertOne(data); err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		if err := pipeline.Default.StartParent(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data.FlatView())
}

func (*ListenerParent) Update(c fbr.Ctx) {
	data, err := model.NormalizeParent(c.Body())
	if err != nil {
		c.Fail(err)
		return
	}
	if data.ID == 0 {
		c.Fail("ID不能为空")
		return
	}
	if err := validateParent(data); err != nil {
		c.Fail(err.Error())
		return
	}
	if _, err := common.DB.ID(data.ID).AllCols().Update(data); err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopParent(data.ID)
	if data.Enable {
		if err := pipeline.Default.StartParent(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data.FlatView())
}

func (*ListenerParent) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.ListenerParent)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("数据不存在")
		return
	}
	data.Enable = true
	if _, err = common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	if err = pipeline.Default.StartParent(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*ListenerParent) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	if _, err := common.DB.ID(id).Cols("enable").Update(&model.ListenerParent{Enable: false}); err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopParent(id)
	c.Succ(true)
}

func (*ListenerParent) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	pipeline.Default.StopParent(id)
	_, _ = common.DB.Where("parent_id = ?", id).Delete(new(model.ListenerConn))
	if _, err := common.DB.ID(id).Delete(new(model.ListenerParent)); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

// validateParent 校验父级监听器参数
func validateParent(data *model.ListenerParent) error {
	if data.Name == "" {
		return fmt.Errorf("名称不能为空")
	}
	if data.Type == "" {
		return fmt.Errorf("类型不能为空")
	}
	if !slices.Contains(model.ValidParentTypes, data.Type) {
		return fmt.Errorf("不支持的父级类型: %s，可选: %v", data.Type, model.ValidParentTypes)
	}
	if data.Config == "" {
		return fmt.Errorf("配置(config)不能为空")
	}
	// 按类型校验 Config
	switch data.Type {
	case model.ParentTypeHTTPServer:
		var cfg model.ParentHTTPConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Port <= 0 || cfg.Port > 65535 {
			return fmt.Errorf("端口必须在 1-65535 之间")
		}
	case model.ParentTypeMQTTClient:
		var cfg model.ParentMQTTConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Broker == "" {
			return fmt.Errorf("broker 地址不能为空")
		}
		if cfg.ClientID == "" {
			return fmt.Errorf("client_id 不能为空")
		}
	}
	return nil
}

// ListenerConn 监听子项 API
type ListenerConn struct{}

func (*ListenerConn) List(c fbr.Ctx) {
	var list []*model.ListenerConn
	session := common.DB.Table(new(model.ListenerConn))
	if t := c.GetString("type"); t != "" {
		session = session.Where("type = ?", t)
	}
	if pid := c.GetInt64("parent_id"); pid > 0 {
		session = session.Where("parent_id = ?", pid)
	}
	if err := session.Find(&list); err != nil {
		c.Fail(err)
		return
	}
	// 附加运行时错误信息 + 展开平铺字段（兼容前端）
	connErrs := pipeline.Default.ConnErrors()
	running := pipeline.Default.RunningConns()
	type connResp struct {
		model.ConnFlatView
		ErrorInfo string `json:"error_info"`
		Running   bool   `json:"running"`
	}
	resp := make([]connResp, len(list))
	for i, item := range list {
		resp[i] = connResp{ConnFlatView: item.FlatView(), ErrorInfo: connErrs[item.ID], Running: running[item.ID]}
	}
	c.Succ(resp)
}

func (*ListenerConn) Create(c fbr.Ctx) {
	data, err := model.NormalizeConn(c.Body())
	if err != nil {
		c.Fail(err)
		return
	}
	if err := validateConn(data); err != nil {
		c.Fail(err.Error())
		return
	}
	if _, err := common.DB.InsertOne(data); err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		if err := pipeline.Default.StartConn(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data.FlatView())
}

func (*ListenerConn) Update(c fbr.Ctx) {
	data, err := model.NormalizeConn(c.Body())
	if err != nil {
		c.Fail(err)
		return
	}
	if data.ID == 0 {
		c.Fail("ID不能为空")
		return
	}
	if err := validateConn(data); err != nil {
		c.Fail(err.Error())
		return
	}
	if _, err := common.DB.ID(data.ID).AllCols().Update(data); err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopConn(data.ID)
	if data.Enable {
		if err := pipeline.Default.StartConn(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data.FlatView())
}

func (*ListenerConn) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.ListenerConn)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("数据不存在")
		return
	}
	data.Enable = true
	if _, err = common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	if err = pipeline.Default.StartConn(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (*ListenerConn) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	if _, err := common.DB.ID(id).Cols("enable").Update(&model.ListenerConn{Enable: false}); err != nil {
		c.Fail(err)
		return
	}
	pipeline.Default.StopConn(id)
	c.Succ(true)
}

func (*ListenerConn) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	pipeline.Default.StopConn(id)
	if _, err := common.DB.ID(id).Delete(new(model.ListenerConn)); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

// validateConn 校验子连接参数
func validateConn(data *model.ListenerConn) error {
	if data.Name == "" {
		return fmt.Errorf("名称不能为空")
	}
	if data.Type == "" {
		return fmt.Errorf("类型不能为空")
	}
	if !slices.Contains(model.ValidConnTypes, data.Type) {
		return fmt.Errorf("不支持的连接类型: %s，可选: %v", data.Type, model.ValidConnTypes)
	}
	if data.Config == "" {
		return fmt.Errorf("配置(config)不能为空")
	}
	// 按类型校验 Config
	switch data.Type {
	case model.ConnTypeTCP, model.ConnTypeUDP:
		var cfg model.TCPConnConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Address == "" {
			return fmt.Errorf("监听地址(address)不能为空")
		}
	case model.ConnTypeSerial:
		var cfg model.SerialConnConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Port == "" {
			return fmt.Errorf("串口端口(port)不能为空")
		}
		if cfg.BaudRate <= 0 {
			return fmt.Errorf("波特率(baud_rate)必须大于0")
		}
	case model.ConnTypeScript:
		var cfg model.ScriptConnConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Content == "" {
			return fmt.Errorf("脚本内容(content)不能为空")
		}
	case model.ConnTypeHTTPRoute:
		var cfg model.HTTPRouteConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.Path == "" {
			return fmt.Errorf("路由路径(path)不能为空")
		}
	case model.ConnTypeMQTTSub:
		var cfg model.MQTTSubConfig
		if err := json.Unmarshal([]byte(data.Config), &cfg); err != nil {
			return fmt.Errorf("配置格式错误: %w", err)
		}
		if cfg.SubTopic == "" {
			return fmt.Errorf("订阅主题(sub_topic)不能为空")
		}
		if cfg.QoS > 2 {
			return fmt.Errorf("QoS 必须 0/1/2")
		}
	}
	return nil
}
