package model

import "encoding/json"

// ==================== ListenerParent 平铺字段 <-> Config JSON ====================

// flatParentPayload 兼容旧版前端平铺字段的请求体
type flatParentPayload struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Enable bool   `json:"enable"`

	// HTTP Server
	Port int `json:"port"`

	// MQTT Client
	Broker   string `json:"broker"`
	ClientID string `json:"client_id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// NormalizeParent 从请求体解析 ListenerParent，同时支持新版 config JSON 和旧版平铺字段。
// 如果 config 为空，会从平铺字段构造 config。
func NormalizeParent(body []byte) (*ListenerParent, error) {
	// 先按平铺结构解析（兼容旧前端）
	var flat flatParentPayload
	_ = json.Unmarshal(body, &flat)

	p := &ListenerParent{
		ID:     flat.ID,
		Name:   flat.Name,
		Type:   flat.Type,
		Enable: flat.Enable,
	}

	// 也尝试解析顶层 config 字段（新前端）
	var withCfg struct {
		Config string `json:"config"`
	}
	_ = json.Unmarshal(body, &withCfg)
	p.Config = withCfg.Config

	// 若 config 为空，则从平铺字段构造
	if p.Config == "" {
		cfg, err := buildParentConfig(&flat)
		if err != nil {
			return nil, err
		}
		p.Config = cfg
	}
	return p, nil
}

// buildParentConfig 根据父级类型把平铺字段序列化为 config JSON
func buildParentConfig(flat *flatParentPayload) (string, error) {
	switch flat.Type {
	case ParentTypeHTTPServer:
		if flat.Port == 0 {
			return "", nil
		}
		b, _ := json.Marshal(ParentHTTPConfig{Port: flat.Port})
		return string(b), nil
	case ParentTypeMQTTClient:
		if flat.Broker == "" && flat.ClientID == "" && flat.Username == "" && flat.Password == "" {
			return "", nil
		}
		b, _ := json.Marshal(ParentMQTTConfig{
			Broker:   flat.Broker,
			ClientID: flat.ClientID,
			Username: flat.Username,
			Password: flat.Password,
		})
		return string(b), nil
	}
	return "", nil
}

// ParentFlatView 把 ListenerParent 展开，包含从 config JSON 解析出的平铺字段。
// 用于 List 接口返回，方便前端表格直接渲染。
type ParentFlatView struct {
	ListenerParent
	// HTTP Server
	Port int `json:"port"`
	// MQTT Client
	Broker   string `json:"broker"`
	ClientID string `json:"client_id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// FlatView 展开父级，兼容前端平铺字段渲染
func (p *ListenerParent) FlatView() ParentFlatView {
	out := ParentFlatView{ListenerParent: *p}
	switch p.Type {
	case ParentTypeHTTPServer:
		var c ParentHTTPConfig
		_ = json.Unmarshal([]byte(p.Config), &c)
		out.Port = c.Port
	case ParentTypeMQTTClient:
		var c ParentMQTTConfig
		_ = json.Unmarshal([]byte(p.Config), &c)
		out.Broker = c.Broker
		out.ClientID = c.ClientID
		out.Username = c.Username
		out.Password = c.Password
	}
	return out
}

// ==================== ListenerConn 平铺字段 <-> Config JSON ====================

// flatConnPayload 兼容旧版前端平铺字段的请求体
type flatConnPayload struct {
	ID       int64  `json:"id"`
	ParentID int64  `json:"parent_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Enable   bool   `json:"enable"`
	Topic    string `json:"topic"`
	OutTopic string `json:"out_topic"`

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

	// Plugin
	PluginName string         `json:"plugin_name"`
	Params     map[string]any `json:"params"`

	// Extra (framing rules etc.)
	Extra string `json:"extra"`
}

// NormalizeConn 从请求体解析 ListenerConn，同时支持新版 config JSON 和旧版平铺字段。
func NormalizeConn(body []byte) (*ListenerConn, error) {
	// 先按平铺结构解析
	var flat flatConnPayload
	if err := json.Unmarshal(body, &flat); err != nil {
		return nil, err
	}

	c := &ListenerConn{
		ID:       flat.ID,
		ParentID: flat.ParentID,
		Name:     flat.Name,
		Type:     flat.Type,
		Enable:   flat.Enable,
		Topic:    flat.Topic,
		OutTopic: flat.OutTopic,
		Extra:    flat.Extra,
	}

	// 也尝试解析顶层 config 字段（新前端）
	var withCfg struct {
		Config string `json:"config"`
	}
	_ = json.Unmarshal(body, &withCfg)
	c.Config = withCfg.Config

	// 若 config 为空，则从平铺字段构造
	if c.Config == "" {
		cfg, err := buildConnConfig(&flat)
		if err != nil {
			return nil, err
		}
		c.Config = cfg
	}
	return c, nil
}

// buildConnConfig 根据子连接类型把平铺字段序列化为 config JSON
func buildConnConfig(flat *flatConnPayload) (string, error) {
	switch flat.Type {
	case ConnTypeTCP, ConnTypeUDP:
		if flat.Address == "" {
			return "", nil
		}
		b, _ := json.Marshal(TCPConnConfig{Address: flat.Address})
		return string(b), nil
	case ConnTypeSerial:
		if flat.Port == "" && flat.BaudRate == 0 {
			return "", nil
		}
		b, _ := json.Marshal(SerialConnConfig{Port: flat.Port, BaudRate: flat.BaudRate})
		return string(b), nil
	case ConnTypeScript:
		if flat.Content == "" {
			return "", nil
		}
		b, _ := json.Marshal(ScriptConnConfig{Content: flat.Content})
		return string(b), nil
	case ConnTypeHTTPRoute:
		if flat.Path == "" && flat.Methods == "" {
			return "", nil
		}
		b, _ := json.Marshal(HTTPRouteConfig{Path: flat.Path, Methods: flat.Methods})
		return string(b), nil
	case ConnTypeMQTTSub:
		if flat.SubTopic == "" && flat.QoS == 0 {
			return "", nil
		}
		b, _ := json.Marshal(MQTTSubConfig{SubTopic: flat.SubTopic, QoS: flat.QoS})
		return string(b), nil
	case ConnTypePlugin:
		if flat.PluginName == "" && len(flat.Params) == 0 {
			return "", nil
		}
		b, _ := json.Marshal(map[string]any{
			"plugin_name": flat.PluginName,
			"params":      flat.Params,
		})
		return string(b), nil
	}
	return "", nil
}

// ConnFlatView 把 ListenerConn 展开，包含从 config JSON 解析出的平铺字段。
type ConnFlatView struct {
	ListenerConn
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
	// Plugin
	PluginName string         `json:"plugin_name"`
	Params     map[string]any `json:"params"`
}

// FlatView 展开子连接，兼容前端平铺字段渲染
func (c *ListenerConn) FlatView() ConnFlatView {
	out := ConnFlatView{ListenerConn: *c}
	switch c.Type {
	case ConnTypeTCP, ConnTypeUDP:
		var cfg TCPConnConfig
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.Address = cfg.Address
	case ConnTypeSerial:
		var cfg SerialConnConfig
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.Port = cfg.Port
		out.BaudRate = cfg.BaudRate
	case ConnTypeScript:
		var cfg ScriptConnConfig
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.Content = cfg.Content
	case ConnTypeHTTPRoute:
		var cfg HTTPRouteConfig
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.Path = cfg.Path
		out.Methods = cfg.Methods
	case ConnTypeMQTTSub:
		var cfg MQTTSubConfig
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.SubTopic = cfg.SubTopic
		out.QoS = cfg.QoS
	case ConnTypePlugin:
		var cfg struct {
			PluginName string         `json:"plugin_name"`
			Params     map[string]any `json:"params"`
		}
		_ = json.Unmarshal([]byte(c.Config), &cfg)
		out.PluginName = cfg.PluginName
		out.Params = cfg.Params
	}
	return out
}
