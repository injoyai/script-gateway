package model

// ==================== ListenerParent Config ====================

// ParentHTTPConfig HTTP Server 配置
type ParentHTTPConfig struct {
	Port int `json:"port"` // HTTP 监听端口
}

// ParentMQTTConfig MQTT Client 配置
type ParentMQTTConfig struct {
	Broker   string `json:"broker"`    // MQTT Broker 地址
	ClientID string `json:"client_id"` // MQTT Client ID
	Username string `json:"username"`   // MQTT 用户名
	Password string `json:"password"`   // MQTT 密码
}

// ==================== ListenerConn Config ====================

// TCPConnConfig TCP/UDP 连接配置
type TCPConnConfig struct {
	Address string `json:"address"` // 监听地址，如 "0.0.0.0:9000"
}

// SerialConnConfig 串口配置
type SerialConnConfig struct {
	Port     string `json:"port"`      // 串口设备路径，如 "COM3" 或 "/dev/ttyUSB0"
	BaudRate int    `json:"baud_rate"` // 波特率，如 9600, 115200
}

// ScriptConnConfig 脚本配置
type ScriptConnConfig struct {
	Content string `json:"content"` // Go 脚本代码
}

// HTTPRouteConfig HTTP 路由配置
type HTTPRouteConfig struct {
	Path    string `json:"path"`    // HTTP 路由路径，如 "/api/data"
	Methods string `json:"methods"` // 允许的 HTTP 方法，如 "POST,PUT"
}

// MQTTSubConfig MQTT 订阅配置
type MQTTSubConfig struct {
	SubTopic string `json:"sub_topic"` // MQTT 订阅主题
	QoS      byte   `json:"qos"`       // MQTT QoS 级别 (0/1/2)
}
