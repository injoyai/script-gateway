package model

import "time"

// User 用户模型
type User struct {
	ID          int64     `json:"id" xorm:"'id' pk autoincr"`
	Username    string    `json:"username" xorm:"'username' unique notnull"`
	Password    string    `json:"-" xorm:"'password' varchar(255) notnull"`
	Role        string    `json:"role" xorm:"'role' varchar(50) default('viewer')"`
	LastLoginAt time.Time `json:"last_login_at" xorm:"'last_login_at'"`
	CreatedAt   time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt   time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (User) TableName() string {
	return "user"
}

// ListenerParent 监听父级资源（HTTP 服务端 / MQTT 客户端）
type ListenerParent struct {
	ID     int64  `json:"id" xorm:"'id' pk autoincr"`
	Name   string `json:"name" xorm:"'name' notnull"`
	Type   string `json:"type" xorm:"'type' notnull"` // http_server / mqtt_client
	Enable bool   `json:"enable" xorm:"'enable'"`

	// HTTP Server 配置
	Port int `json:"port" xorm:"'port' int"` // HTTP 监听端口

	// MQTT Client 配置
	Broker   string `json:"broker" xorm:"'broker' varchar(200)"`       // MQTT Broker 地址
	ClientID string `json:"client_id" xorm:"'client_id' varchar(100)"` // MQTT Client ID
	Username string `json:"username" xorm:"'username' varchar(100)"`   // MQTT 用户名
	Password string `json:"password" xorm:"'password' varchar(200)"`   // MQTT 密码

	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (ListenerParent) TableName() string {
	return "listener_parent"
}

// ListenerConn 统一监听子连接 / 路由 / 订阅
type ListenerConn struct {
	ID        int64  `json:"id" xorm:"'id' pk autoincr"`
	ParentID  int64  `json:"parent_id" xorm:"'parent_id' index"`
	Name      string `json:"name" xorm:"'name' notnull"`
	Type      string `json:"type" xorm:"'type' notnull"` // http_route / mqtt_subscription / tcp_conn / udp_conn / serial_conn / script_conn
	Enable    bool   `json:"enable" xorm:"'enable'"`
	Topic     string `json:"topic" xorm:"'topic'"`         // 入站 topic：连接收到的数据推送到此 topic
	OutTopic  string `json:"out_topic" xorm:"'out_topic'"` // 出站 topic：订阅此 topic 的消息推送到连接
	PreScript string `json:"pre_script" xorm:"'pre_script' text"`

	// TCP/UDP 连接配置
	Address string `json:"address" xorm:"'address' varchar(100)"` // TCP/UDP 监听地址，如 "0.0.0.0:9000"

	// 串口配置
	Port     string `json:"port" xorm:"'port' varchar(100)"`  // 串口设备路径，如 "COM3" 或 "/dev/ttyUSB0"
	BaudRate int    `json:"baud_rate" xorm:"'baud_rate' int"` // 波特率，如 9600, 115200

	// 脚本配置
	Content string `json:"content" xorm:"'content' text"` // 脚本内容（Go 代码）

	// HTTP 路由配置
	Path    string `json:"path" xorm:"'path' varchar(200)"`       // HTTP 路由路径，如 "/api/data"
	Methods string `json:"methods" xorm:"'methods' varchar(100)"` // 允许的 HTTP 方法，如 "POST,PUT"

	// MQTT 订阅配置
	SubTopic string `json:"sub_topic" xorm:"'sub_topic' varchar(200)"` // MQTT 订阅主题
	QoS      byte   `json:"qos" xorm:"'qos' tinyint"`                  // MQTT QoS 级别

	// 扩展配置（分帧规则等）
	Extra string `json:"extra" xorm:"'extra' text"` // JSON 格式的扩展配置，如 framing 规则

	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (ListenerConn) TableName() string {
	return "listener_conn"
}

// DispatcherConfig 统一分发器配置模型
type DispatcherConfig struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' notnull"`
	Type      string    `json:"type" xorm:"'type' notnull"`
	Enable    bool      `json:"enable" xorm:"'enable'"`
	Topics    string    `json:"topics" xorm:"'topics' text"`
	Config    string    `json:"config" xorm:"'config' text"`
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (DispatcherConfig) TableName() string {
	return "dispatcher_config"
}

// ProcessorChain 处理器链模型
type ProcessorChain struct {
	ID         int64     `json:"id" xorm:"'id' pk autoincr"`
	Name       string    `json:"name" xorm:"'name' notnull"`
	Topic      string    `json:"topic" xorm:"'topic'"`
	Processors string    `json:"processors" xorm:"'processors' text"`
	Enable     bool      `json:"enable" xorm:"'enable'"`
	CreatedAt  time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt  time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (ProcessorChain) TableName() string {
	return "processor_chain"
}

// OperationLog 操作日志模型
type OperationLog struct {
	ID         int64     `json:"id" xorm:"'id' pk autoincr"`
	UserID     int64     `json:"user_id" xorm:"'user_id'"`
	Username   string    `json:"username" xorm:"'username'"`
	Action     string    `json:"action" xorm:"'action'"`
	Resource   string    `json:"resource" xorm:"'resource'"`
	ResourceID int64     `json:"resource_id" xorm:"'resource_id'"`
	Detail     string    `json:"detail" xorm:"'detail' text"`
	IP         string    `json:"ip" xorm:"'ip'"`
	CreatedAt  time.Time `json:"created_at" xorm:"'created_at' created"`
}

func (OperationLog) TableName() string {
	return "operation_log"
}

// ConfigSnapshot 配置快照模型
type ConfigSnapshot struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name'"`
	Data      string    `json:"data" xorm:"'data' text"`
	CreatedBy string    `json:"created_by" xorm:"'created_by'"`
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
}

func (ConfigSnapshot) TableName() string {
	return "config_snapshot"
}

// Metric 指标数据模型
type Metric struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' index notnull"`
	Type      string    `json:"type" xorm:"'type' index notnull"`
	Value     float64   `json:"value" xorm:"'value'"`
	Labels    string    `json:"labels" xorm:"'labels' text"`
	Timestamp time.Time `json:"timestamp" xorm:"'timestamp' index"`
}

func (Metric) TableName() string {
	return "metric"
}

func AllTables() []any {
	return []any{
		new(User),
		new(ListenerParent),
		new(ListenerConn),
		new(DispatcherConfig),
		new(ProcessorChain),
		new(OperationLog),
		new(ConfigSnapshot),
		new(Metric),
		new(Script),
	}
}
