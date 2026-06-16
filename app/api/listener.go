package api

import (
	"encoding/json"

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
	// 附加运行时错误信息
	parentErrs := pipeline.Default.ParentErrors()
	running := pipeline.Default.RunningParents()
	type parentResp struct {
		model.ListenerParent
		ErrorInfo string `json:"error_info"`
		Running   bool   `json:"running"`
	}
	resp := make([]parentResp, len(list))
	for i, item := range list {
		resp[i] = parentResp{ListenerParent: *item, ErrorInfo: parentErrs[item.ID], Running: running[item.ID]}
	}
	c.Succ(resp)
}

func (*ListenerParent) Create(c fbr.Ctx) {
	data := new(model.ListenerParent)
	c.Parse(data)
	if data.Name == "" || data.Type == "" {
		c.Fail("名称和类型不能为空")
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
	c.Succ(data)
}

func (*ListenerParent) Update(c fbr.Ctx) {
	data := new(model.ListenerParent)
	c.Parse(data)
	if data.ID == 0 {
		c.Fail("ID不能为空")
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
	c.Succ(data)
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

// ListenerConn 监听子项 API
type ListenerConn struct{}

type listenerConnPayload struct {
	ID        int64  `json:"id"`
	ParentID  int64  `json:"parent_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Enable    bool   `json:"enable"`
	Topic     string `json:"topic"`
	OutTopic  string `json:"out_topic"`
	PreScript string `json:"pre_script"`

	// TCP/UDP
	Address string `json:"address"`

	// Serial
	Port     string `json:"port"`
	BaudRate int    `json:"baud_rate"`

	// Script
	Content string `json:"content"`

	// HTTP Route
	Path    string `json:"path"`
	Methods string `json:"methods"`

	// MQTT Subscription
	SubTopic string `json:"sub_topic"`
	QoS      byte   `json:"qos"`

	// Extra
	Extra string `json:"extra"`
}

func (p *listenerConnPayload) ToModel() *model.ListenerConn {
	return &model.ListenerConn{
		ID:        p.ID,
		ParentID:  p.ParentID,
		Name:      p.Name,
		Type:      p.Type,
		Enable:    p.Enable,
		Topic:     p.Topic,
		OutTopic:  p.OutTopic,
		PreScript: p.PreScript,
		Address:   p.Address,
		Port:      p.Port,
		BaudRate:  p.BaudRate,
		Content:   p.Content,
		Path:      p.Path,
		Methods:   p.Methods,
		SubTopic:  p.SubTopic,
		QoS:       p.QoS,
		Extra:     p.Extra,
	}
}

func parseListenerConnPayload(c fbr.Ctx) (*model.ListenerConn, error) {
	payload := new(listenerConnPayload)
	if err := json.Unmarshal(c.Body(), payload); err != nil {
		return nil, err
	}
	return payload.ToModel(), nil
}

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
	// 附加运行时错误信息
	connErrs := pipeline.Default.ConnErrors()
	running := pipeline.Default.RunningConns()
	type connResp struct {
		model.ListenerConn
		ErrorInfo string `json:"error_info"`
		Running   bool   `json:"running"`
	}
	resp := make([]connResp, len(list))
	for i, item := range list {
		resp[i] = connResp{ListenerConn: *item, ErrorInfo: connErrs[item.ID], Running: running[item.ID]}
	}
	c.Succ(resp)
}

func (*ListenerConn) Create(c fbr.Ctx) {
	data, err := parseListenerConnPayload(c)
	if err != nil {
		c.Fail(err)
		return
	}
	if data.Name == "" || data.Type == "" {
		c.Fail("名称和类型不能为空")
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
	c.Succ(data)
}

func (*ListenerConn) Update(c fbr.Ctx) {
	data, err := parseListenerConnPayload(c)
	if err != nil {
		c.Fail(err)
		return
	}
	if data.ID == 0 {
		c.Fail("ID不能为空")
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
	c.Succ(data)
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
