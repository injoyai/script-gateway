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
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' notnull"`
	Type      string    `json:"type" xorm:"'type' notnull"` // http_server / mqtt_client
	Enable    bool      `json:"enable" xorm:"'enable'"`
	Config    string    `json:"config" xorm:"'config' text"` // JSON 配置，按 Type 区分结构
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (ListenerParent) TableName() string {
	return "listener_parent"
}

// ListenerConn 统一监听子连接 / 路由 / 订阅
type ListenerConn struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	ParentID  int64     `json:"parent_id" xorm:"'parent_id' index"`
	Name      string    `json:"name" xorm:"'name' notnull"`
	Type      string    `json:"type" xorm:"'type' notnull"` // tcp_conn / udp_conn / serial_conn / script_conn / http_route / mqtt_subscription
	Enable    bool      `json:"enable" xorm:"'enable'"`
	Topic     string    `json:"topic" xorm:"'topic'"`         // 入站 topic：连接收到的数据推送到此 topic
	OutTopic  string    `json:"out_topic" xorm:"'out_topic'"` // 出站 topic：订阅此 topic 的消息推送到连接
	Config    string    `json:"config" xorm:"'config' text"`  // JSON 配置，按 Type 区分结构
	Extra     string    `json:"extra" xorm:"'extra' text"`    // JSON 扩展配置（分帧规则等）
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
	Topic      string    `json:"topic" xorm:"'topic'"`         // 订阅 topic
	OutTopic   string    `json:"out_topic" xorm:"'out_topic'"` // 发布 topic
	Processors string    `json:"processors" xorm:"'processors' text"`
	Enable     bool      `json:"enable" xorm:"'enable'"`
	CreatedAt  time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt  time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (ProcessorChain) TableName() string {
	return "processor_chain"
}

// Viewer 订阅查看器模型（订阅 topic，点击查看实时数据）
type Viewer struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' notnull"`
	Topics    string    `json:"topics" xorm:"'topics' text"` // JSON 数组，订阅的 topic 列表
	Enable    bool      `json:"enable" xorm:"'enable'"`
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (Viewer) TableName() string {
	return "viewer"
}

// Mocker 虚拟数据发送器（向指定 topic 注入数据，支持手动触发与定时）
type Mocker struct {
	ID        int64     `json:"id" xorm:"'id' pk autoincr"`
	Name      string    `json:"name" xorm:"'name' notnull"`
	Topic     string    `json:"topic" xorm:"'topic'"`          // 目标 topic
	Payload   string    `json:"payload" xorm:"'payload' text"` // 数据内容（原样发送）
	Interval  int       `json:"interval" xorm:"'interval'"`    // 定时间隔（毫秒，0=不定时）
	Enable    bool      `json:"enable" xorm:"'enable'"`
	CreatedAt time.Time `json:"created_at" xorm:"'created_at' created"`
	UpdatedAt time.Time `json:"updated_at" xorm:"'updated_at' updated"`
}

func (Mocker) TableName() string {
	return "mocker"
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
		new(Viewer),
		new(Mocker),
		new(OperationLog),
		new(ConfigSnapshot),
		new(Metric),
		new(Script),
		new(DecodeScript),
		new(PushScript),
		new(TaskPluginConfig),
		new(FlowLayout),
	}
}
