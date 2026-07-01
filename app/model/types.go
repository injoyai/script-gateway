package model

// ListenerParent 类型常量
const (
	ParentTypeHTTPServer = "http_server"
	ParentTypeMQTTClient = "mqtt_client"
)

// ListenerConn 类型常量
const (
	ConnTypeTCP       = "tcp_conn"
	ConnTypeUDP       = "udp_conn"
	ConnTypeSerial    = "serial_conn"
	ConnTypeScript    = "script_conn"
	ConnTypeHTTPRoute = "http_route"
	ConnTypeMQTTSub   = "mqtt_subscription"
	ConnTypePlugin    = "plugin"
)

// DispatcherConfig 类型常量
const (
	DispatcherTypeHTTP      = "http"
	DispatcherTypeMQTT      = "mqtt"
	DispatcherTypeScript    = "script"
	DispatcherTypeWebsocket = "websocket"
	DispatcherTypeRocketMQ  = "rocketmq"
	DispatcherTypePlugin    = "plugin"
)

// 所有合法的 ListenerParent 类型
var ValidParentTypes = []string{
	ParentTypeHTTPServer,
	ParentTypeMQTTClient,
}

// 所有合法的 ListenerConn 类型
var ValidConnTypes = []string{
	ConnTypeTCP,
	ConnTypeUDP,
	ConnTypeSerial,
	ConnTypeScript,
	ConnTypeHTTPRoute,
	ConnTypeMQTTSub,
	ConnTypePlugin,
}

// 所有合法的 Dispatcher 类型
var ValidDispatcherTypes = []string{
	DispatcherTypeHTTP,
	DispatcherTypeMQTT,
	DispatcherTypeScript,
	DispatcherTypeWebsocket,
	DispatcherTypeRocketMQ,
	DispatcherTypePlugin,
}
