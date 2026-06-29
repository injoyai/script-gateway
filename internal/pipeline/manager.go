package pipeline

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/injoyai/logs"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/auth"
	"github.com/injoyai/script-gateway/internal/decode"
	"github.com/injoyai/script-gateway/internal/listen"
	"github.com/injoyai/script-gateway/internal/plugin"
	"github.com/injoyai/script-gateway/internal/push"
	"github.com/injoyai/script-gateway/internal/queue"
	"github.com/injoyai/script-gateway/internal/types"
)

type httpRouteRuntime struct {
	cfg *model.ListenerConn
}

// outboundBuffer 出站订阅 channel 的缓冲大小
// 较大缓冲可避免目标连接写入速度较慢时拖累主消息队列
const outboundBuffer = 1000

type parentRuntime struct {
	parent     *model.ListenerParent
	httpServer *http.Server
	httpRoutes map[int64]*httpRouteRuntime
	mqttClient mqtt.Client
	mqttTopics map[int64]string
	cancel     context.CancelFunc
}

type framingState struct {
	mu     sync.Mutex
	buffer map[string][]byte
}

type lengthFieldConfig struct {
	Offset        int
	Size          int
	Endian        string
	IncludeHeader bool
}

// Manager 管道管理器，统一管理监听父级、连接、处理器链和分发器
type Manager struct {
	mu           sync.RWMutex
	queue        *queue.Queue
	parents      map[int64]*parentRuntime
	listeners    map[int64]listen.Listener
	dispatchers  map[int64]push.Dispatcher
	pipelines    map[int64]*decode.Pipeline
	cancels      map[int64]context.CancelFunc
	framing      map[int64]*framingState
	parentErrors map[int64]string
	connErrors   map[int64]string
	taskCancels  map[string]context.CancelFunc
	taskErrors   map[string]string
}

var Default = &Manager{
	queue:        queue.New(100),
	parents:      make(map[int64]*parentRuntime),
	listeners:    make(map[int64]listen.Listener),
	dispatchers:  make(map[int64]push.Dispatcher),
	pipelines:    make(map[int64]*decode.Pipeline),
	cancels:      make(map[int64]context.CancelFunc),
	framing:      make(map[int64]*framingState),
	parentErrors: make(map[int64]string),
	connErrors:   make(map[int64]string),
	taskCancels:  make(map[string]context.CancelFunc),
	taskErrors:   make(map[string]string),
}

// Queue 返回内部消息队列实例
func (m *Manager) Queue() *queue.Queue {
	return m.queue
}

// ParentError 返回指定父级监听器的最近错误
func (m *Manager) ParentError(id int64) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.parentErrors[id]
}

// ConnError 返回指定子连接的最近错误
func (m *Manager) ConnError(id int64) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.connErrors[id]
}

// ParentErrors 返回所有父级错误（id -> error）
func (m *Manager) ParentErrors() map[int64]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[int64]string, len(m.parentErrors))
	for k, v := range m.parentErrors {
		out[k] = v
	}
	return out
}

// ConnErrors 返回所有子连接错误（id -> error）
func (m *Manager) ConnErrors() map[int64]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[int64]string, len(m.connErrors))
	for k, v := range m.connErrors {
		out[k] = v
	}
	return out
}

// IsParentRunning 父级监听器是否处于运行中
func (m *Manager) IsParentRunning(id int64) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.parents[id]
	return ok
}

// IsConnRunning 子连接是否处于运行中
func (m *Manager) IsConnRunning(id int64) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if _, ok := m.listeners[id]; ok {
		return true
	}
	if _, ok := m.cancels[id]; ok {
		return true
	}
	return false
}

// RunningParents 所有处于运行中的父级 ID 集合
func (m *Manager) RunningParents() map[int64]bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[int64]bool, len(m.parents))
	for id := range m.parents {
		out[id] = true
	}
	return out
}

// RunningConns 所有处于运行中的子连接 ID 集合
func (m *Manager) RunningConns() map[int64]bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[int64]bool)
	for id := range m.listeners {
		out[id] = true
	}
	for id := range m.cancels {
		out[id] = true
	}
	return out
}

// setParentError 记录父级错误（内部使用，需自行处理锁）
func (m *Manager) setParentError(id int64, err error) {
	if err == nil {
		delete(m.parentErrors, id)
		return
	}
	m.parentErrors[id] = err.Error()
}

// setConnError 记录子连接错误（内部使用，需自行处理锁）
func (m *Manager) setConnError(id int64, err error) {
	if err == nil {
		delete(m.connErrors, id)
		return
	}
	m.connErrors[id] = err.Error()
}

func (m *Manager) Start() error {
	for _, table := range model.AllTables() {
		if err := common.DB.Sync2(table); err != nil {
			logs.Err(fmt.Sprintf("Sync table error: %v", err))
		}
	}
	m.ensureDefaultAdmin()
	m.startDispatchers()
	m.startPipelines()
	m.startParents()
	m.startConns()
	m.startTaskPlugins()
	return nil
}

func (m *Manager) ensureDefaultAdmin() {
	count, err := common.DB.Count(new(model.User))
	if err != nil {
		logs.Errf("Check user count error: %v", err)
		return
	}
	if count > 0 {
		return
	}
	hash, err := auth.HashPassword("admin")
	if err != nil {
		logs.Errf("Hash password error: %v", err)
		return
	}
	_, err = common.DB.InsertOne(&model.User{Username: "admin", Password: hash, Role: "admin"})
	if err != nil {
		logs.Errf("Create default admin error: %v", err)
		return
	}
	logs.Infof("已创建默认管理员账号: admin/admin\n")
}

func (m *Manager) startParents() {
	var list []*model.ListenerParent
	if err := common.DB.Where("enable = ?", true).Find(&list); err != nil {
		logs.Err(fmt.Sprintf("Find listener parents error: %v", err))
		return
	}
	for _, cfg := range list {
		if err := m.StartParent(cfg); err != nil {
			logs.Err(fmt.Sprintf("Start listener parent %s error: %v", cfg.Name, err))
		}
	}
}

func (m *Manager) startConns() {
	var list []*model.ListenerConn
	if err := common.DB.Where("enable = ?", true).Find(&list); err != nil {
		logs.Err(fmt.Sprintf("Find listener conns error: %v", err))
		return
	}
	for _, cfg := range list {
		if err := m.StartConn(cfg); err != nil {
			logs.Err(fmt.Sprintf("Start listener conn %s error: %v", cfg.Name, err))
		}
	}
}

func (m *Manager) StartParent(cfg *model.ListenerParent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.parents[cfg.ID]; ok {
		return nil
	}
	// 清除上次错误
	m.setParentError(cfg.ID, nil)
	ctx, cancel := context.WithCancel(context.Background())
	rt := &parentRuntime{parent: cfg, cancel: cancel, httpRoutes: make(map[int64]*httpRouteRuntime), mqttTopics: make(map[int64]string)}
	// 解析 Config JSON
	switch cfg.Type {
	case model.ParentTypeHTTPServer:
		var pc model.ParentHTTPConfig
		_ = json.Unmarshal([]byte(cfg.Config), &pc)
		addr := fmt.Sprintf(":%d", pc.Port)
		// 先同步绑定端口，捕获端口占用等错误
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			cancel()
			m.setParentError(cfg.ID, fmt.Errorf("监听端口 %d 失败: %v", pc.Port, err))
			logs.Errf("HTTP parent %s listen %s failed: %v", cfg.Name, addr, err)
			return err
		}
		server := &http.Server{Addr: addr}
		server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			m.mu.RLock()
			route := m.matchHTTPRouteLocked(rt, r)
			m.mu.RUnlock()
			if route == nil {
				http.NotFound(w, r)
				return
			}
			body, _ := io.ReadAll(r.Body)
			_ = r.Body.Close()
			msg := types.NewMessage(body, route.cfg.Topic)
			if msg.Topic == "" {
				msg.Topic = fmt.Sprintf("http.%s.%d", route.cfg.Name, route.cfg.ID)
			}
			msg.Metadata["source"] = "http"
			msg.Metadata["path"] = r.URL.Path
			msg.Metadata["method"] = r.Method
			msg.Metadata["remote_addr"] = r.RemoteAddr
			m.forwardSingleMessage(route.cfg, msg)
			w.WriteHeader(http.StatusOK)
		})
		rt.httpServer = server
		go func() {
			if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
				logs.Errf("HTTP parent %s error: %v", cfg.Name, err)
				m.mu.Lock()
				m.setParentError(cfg.ID, err)
				m.mu.Unlock()
			}
		}()
		go func() { <-ctx.Done(); _ = server.Shutdown(context.Background()) }()
	case model.ParentTypeMQTTClient:
		var mc model.ParentMQTTConfig
		_ = json.Unmarshal([]byte(cfg.Config), &mc)
		opts := mqtt.NewClientOptions().AddBroker(mc.Broker).SetClientID(mc.ClientID).SetUsername(mc.Username).SetPassword(mc.Password).SetAutoReconnect(true)
		client := mqtt.NewClient(opts)
		if token := client.Connect(); token.Wait() && token.Error() != nil {
			cancel()
			m.setParentError(cfg.ID, fmt.Errorf("MQTT 连接失败: %v", token.Error()))
			return token.Error()
		}
		rt.mqttClient = client
		go func() { <-ctx.Done(); client.Disconnect(250) }()
	default:
		cancel()
		err := fmt.Errorf("unsupported parent type: %s", cfg.Type)
		m.setParentError(cfg.ID, err)
		return err
	}
	m.parents[cfg.ID] = rt
	return nil
}

func (m *Manager) matchHTTPRouteLocked(rt *parentRuntime, r *http.Request) *httpRouteRuntime {
	var fallback *httpRouteRuntime
	for _, route := range rt.httpRoutes {
		var rc model.HTTPRouteConfig
		_ = json.Unmarshal([]byte(route.cfg.Config), &rc)
		if rc.Path == r.URL.Path && (rc.Methods == "" || strings.Contains(strings.ToUpper(rc.Methods), r.Method)) {
			// 优先匹配有 topic 的路由
			if route.cfg.Topic != "" {
				return route
			}
			if fallback == nil {
				fallback = route
			}
		}
	}
	return fallback
}

func (m *Manager) StopParent(id int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.setParentError(id, nil)
	if rt, ok := m.parents[id]; ok {
		for connID, topic := range rt.mqttTopics {
			if rt.mqttClient != nil {
				token := rt.mqttClient.Unsubscribe(topic)
				if token.Wait() && token.Error() != nil {
					logs.Errf("unsubscribe mqtt topic error: %v", token.Error())
				}
			}
			delete(rt.mqttTopics, connID)
		}
		if rt.cancel != nil {
			rt.cancel()
		}
		delete(m.parents, id)
	}
	var conns []*model.ListenerConn
	_ = common.DB.Where("parent_id = ?", id).Find(&conns)
	for _, conn := range conns {
		if cancel, ok := m.cancels[conn.ID]; ok {
			cancel()
			delete(m.cancels, conn.ID)
		}
		if l, ok := m.listeners[conn.ID]; ok {
			_ = l.Close()
			delete(m.listeners, conn.ID)
		}
		delete(m.framing, conn.ID)
	}
}

func (m *Manager) StartConn(cfg *model.ListenerConn) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.listeners[cfg.ID]; ok {
		return nil
	}
	if _, ok := m.cancels[cfg.ID]; ok && cfg.ParentID > 0 {
		return nil
	}
	// 清除上次错误
	m.setConnError(cfg.ID, nil)
	// 预注册入站/出站 topic，让消息队列列表能立即显示
	m.queue.RegisterTopic(cfg.Topic)
	m.queue.RegisterTopic(cfg.OutTopic)
	m.framing[cfg.ID] = &framingState{buffer: make(map[string][]byte)}
	if cfg.ParentID > 0 {
		parent, ok := m.parents[cfg.ParentID]
		if !ok {
			err := fmt.Errorf("parent %d not started", cfg.ParentID)
			m.setConnError(cfg.ID, err)
			return err
		}
		return m.startConnWithParentLocked(parent, cfg)
	}
	l, err := createConnListener(cfg)
	if err != nil {
		m.setConnError(cfg.ID, err)
		return err
	}
	return m.runStandaloneConnLocked(cfg, l)
}

func (m *Manager) runStandaloneConnLocked(cfg *model.ListenerConn, l listen.Listener) error {
	ctx, cancel := context.WithCancel(context.Background())

	// Start：初始化监听器（建立连接、绑定端口等）
	if err := l.Start(ctx); err != nil {
		cancel()
		m.setConnError(cfg.ID, err)
		return err
	}

	// 统一读循环：循环调用 ReadMessage，经预处理后发布到消息总线
	go func() {
		for {
			data, err := l.ReadMessage()
			if err != nil {
				if ctx.Err() != nil {
					return // context 取消，正常退出
				}
				logs.Errf("Listener conn %s read error: %v", cfg.Name, err)
				continue
			}
			if data == nil {
				continue // 无数据，继续循环
			}
			msg := types.NewMessage(data, cfg.Topic)
			msg.Metadata["source"] = strings.TrimSuffix(cfg.Type, "_conn")
			m.processAndPublish(cfg, msg)
		}
	}()

	// 订阅出站 topic，将消息写入连接（带独立缓冲队列，避免连接慢拖累主队列）
	if cfg.OutTopic != "" {
		sub, ch := m.queue.SubscribeNamed([]string{cfg.OutTopic}, queue.SubOpts{
			Name:      "listener#" + cfg.Name,
			OwnerType: "listener",
			OwnerID:   cfg.ID,
			Buffer:    outboundBuffer,
		})
		_ = sub
		go m.writeToConn(cfg, ch, l, ctx)
	}
	m.listeners[cfg.ID] = l
	m.cancels[cfg.ID] = cancel
	return nil
}

// writeToConn 将队列消息写入连接（出站）
func (m *Manager) writeToConn(cfg *model.ListenerConn, ch <-chan *types.Message, l listen.Listener, ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := l.Write(msg.Payload); err != nil {
				logs.Errf("Write to conn %s error: %v", cfg.Name, err)
			}
		}
	}
}

// processAndPublish 处理单条消息：分帧 → 发布到消息总线
func (m *Manager) processAndPublish(cfg *model.ListenerConn, msg *types.Message) {
	framing := parseFraming(cfg.Extra)
	frames := m.applyFraming(cfg.ID, msg, framing)
	for _, frame := range frames {
		msg2 := &types.Message{ID: msg.ID, Payload: frame, Topic: msg.Topic, Metadata: copyMetadata(msg.Metadata)}
		if msg2.Topic == "" {
			msg2.Topic = fmt.Sprintf("%s.%s.%d", strings.TrimSuffix(cfg.Type, "_conn"), cfg.Name, cfg.ID)
		}
		msg2.Metadata["conn_id"] = cfg.ID
		msg2.Metadata["conn_type"] = cfg.Type
		msg2.Metadata["parent_id"] = cfg.ParentID
		m.queue.Publish(msg2)
	}
}

func (m *Manager) startConnWithParentLocked(parent *parentRuntime, cfg *model.ListenerConn) error {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancels[cfg.ID] = cancel
	switch cfg.Type {
	case model.ConnTypeHTTPRoute:
		if parent.httpServer == nil {
			delete(m.cancels, cfg.ID)
			return fmt.Errorf("http parent not ready")
		}
		parent.httpRoutes[cfg.ID] = &httpRouteRuntime{cfg: cfg}
	case model.ConnTypeMQTTSub:
		var mc model.MQTTSubConfig
		_ = json.Unmarshal([]byte(cfg.Config), &mc)
		if parent.mqttClient == nil {
			delete(m.cancels, cfg.ID)
			return fmt.Errorf("mqtt parent not ready")
		}
		token := parent.mqttClient.Subscribe(mc.SubTopic, mc.QoS, func(_ mqtt.Client, msg mqtt.Message) {
			m2 := types.NewMessage(msg.Payload(), cfg.Topic)
			if m2.Topic == "" {
				m2.Topic = fmt.Sprintf("mqtt.%s.%d", cfg.Name, cfg.ID)
			}
			m2.Metadata["source"] = "mqtt"
			m2.Metadata["mqtt_topic"] = msg.Topic()
			m.forwardSingleMessage(cfg, m2)
		})
		if token.Wait() && token.Error() != nil {
			delete(m.cancels, cfg.ID)
			return token.Error()
		}
		parent.mqttTopics[cfg.ID] = mc.SubTopic
		// 订阅出站 topic，通过 MQTT 客户端发布
		if cfg.OutTopic != "" {
			outSub, outCh := m.queue.SubscribeNamed([]string{cfg.OutTopic}, queue.SubOpts{
				Name:      "listener#" + cfg.Name,
				OwnerType: "listener",
				OwnerID:   cfg.ID,
				Buffer:    outboundBuffer,
			})
			_ = outSub
			go func(client mqtt.Client, ch <-chan *types.Message, ctx context.Context) {
				for {
					select {
					case <-ctx.Done():
						return
					case msg, ok := <-ch:
						if !ok {
							return
						}
						token := client.Publish(mc.SubTopic, mc.QoS, false, msg.Payload)
						token.Wait()
					}
				}
			}(parent.mqttClient, outCh, ctx)
		}
	case model.ConnTypeScript:
		l, err := createConnListener(cfg)
		if err != nil {
			delete(m.cancels, cfg.ID)
			return err
		}
		if err := l.Start(ctx); err != nil {
			delete(m.cancels, cfg.ID)
			return err
		}
		go func() {
			for {
				data, err := l.ReadMessage()
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					continue
				}
				if data == nil {
					continue
				}
				msg := types.NewMessage(data, cfg.Topic)
				msg.Metadata["source"] = "script"
				m.processAndPublish(cfg, msg)
			}
		}()
		if cfg.OutTopic != "" {
			outSub, outCh := m.queue.SubscribeNamed([]string{cfg.OutTopic}, queue.SubOpts{
				Name:      "listener#" + cfg.Name,
				OwnerType: "listener",
				OwnerID:   cfg.ID,
				Buffer:    outboundBuffer,
			})
			_ = outSub
			go m.writeToConn(cfg, outCh, l, ctx)
		}
		m.listeners[cfg.ID] = l
	default:
		delete(m.cancels, cfg.ID)
		return fmt.Errorf("unsupported parent child type: %s", cfg.Type)
	}
	return nil
}

func (m *Manager) forwardSingleMessage(cfg *model.ListenerConn, msg *types.Message) {
	msg.Metadata["conn_id"] = cfg.ID
	msg.Metadata["conn_type"] = cfg.Type
	msg.Metadata["parent_id"] = cfg.ParentID
	m.queue.Publish(msg)
}

func (m *Manager) StopConn(id int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.setConnError(id, nil)
	data := new(model.ListenerConn)
	_, _ = common.DB.ID(id).Get(data)
	if data.ParentID > 0 {
		if parent, ok := m.parents[data.ParentID]; ok {
			delete(parent.httpRoutes, id)
			if topic, ok := parent.mqttTopics[id]; ok {
				if parent.mqttClient != nil {
					token := parent.mqttClient.Unsubscribe(topic)
					if token.Wait() && token.Error() != nil {
						logs.Errf("unsubscribe mqtt topic error: %v", token.Error())
					}
				}
				delete(parent.mqttTopics, id)
			}
		}
	}
	if cancel, ok := m.cancels[id]; ok {
		cancel()
		delete(m.cancels, id)
	}
	if l, ok := m.listeners[id]; ok {
		_ = l.Close()
		delete(m.listeners, id)
	}
	delete(m.framing, id)
}

func (m *Manager) startDispatchers() {
	var list []*model.DispatcherConfig
	if err := common.DB.Where("enable = ?", true).Find(&list); err != nil {
		logs.Err(fmt.Sprintf("Find dispatchers error: %v", err))
		return
	}
	for _, cfg := range list {
		if err := m.StartDispatcher(cfg); err != nil {
			logs.Err(fmt.Sprintf("Start dispatcher %s error: %v", cfg.Name, err))
		}
	}
}

func (m *Manager) startPipelines() {
	var list []*model.ProcessorChain
	if err := common.DB.Where("enable = ?", true).Find(&list); err != nil {
		logs.Err(fmt.Sprintf("Find pipelines error: %v", err))
		return
	}
	for _, cfg := range list {
		if err := m.StartPipeline(cfg); err != nil {
			logs.Err(fmt.Sprintf("Start pipeline %s error: %v", cfg.Name, err))
		}
	}
}

func (m *Manager) StartDispatcher(cfg *model.DispatcherConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.dispatchers[cfg.ID]; ok {
		return nil
	}
	d, err := createDispatcher(cfg)
	if err != nil {
		return err
	}
	topics := d.Topics()
	if len(topics) > 0 {
		_, ch := m.queue.SubscribeNamed(topics, queue.SubOpts{
			Name:      "dispatcher#" + cfg.Name,
			OwnerType: "dispatcher",
			OwnerID:   cfg.ID,
		})
		go func(ch <-chan *types.Message, d push.Dispatcher) {
			for msg := range ch {
				if err := d.Push(msg); err != nil {
					logs.Err(fmt.Sprintf("Dispatcher push error: %v", err))
				}
			}
		}(ch, d)
	}
	m.dispatchers[cfg.ID] = d
	return nil
}

func (m *Manager) StopDispatcher(id int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if d, ok := m.dispatchers[id]; ok {
		d.Close()
		delete(m.dispatchers, id)
	}
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, l := range m.listeners {
		l.Close()
		delete(m.listeners, id)
	}
	for id, d := range m.dispatchers {
		d.Close()
		delete(m.dispatchers, id)
	}
	for id, cancel := range m.cancels {
		cancel()
		delete(m.cancels, id)
	}
	for id, rt := range m.parents {
		if rt.cancel != nil {
			rt.cancel()
		}
		delete(m.parents, id)
	}
	for name, cancel := range m.taskCancels {
		cancel()
		delete(m.taskCancels, name)
	}
	m.pipelines = make(map[int64]*decode.Pipeline)
	m.framing = make(map[int64]*framingState)
	m.taskErrors = make(map[string]string)
}

// startTaskPlugins 启动所有已加载的 task 类型插件
func (m *Manager) startTaskPlugins() {
	var configs []*model.TaskPluginConfig
	_ = common.DB.Where("enable = ?", true).Find(&configs)
	configMap := map[string]*model.TaskPluginConfig{}
	for _, c := range configs {
		configMap[c.Name] = c
	}
	for _, p := range plugin.Default.List(plugin.TypeTask) {
		var params map[string]any
		if cfg, ok := configMap[p.Manifest.Name]; ok && cfg.Params != "" {
			_ = json.Unmarshal([]byte(cfg.Params), &params)
		}
		if err := m.StartTaskPlugin(p.Manifest.Name, params); err != nil {
			logs.Err(fmt.Sprintf("Start task plugin %s error: %v", p.Manifest.Name, err))
		}
	}
}

// StartTaskPlugin 启动单个 task 插件
func (m *Manager) StartTaskPlugin(name string, params map[string]any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.taskCancels[name]; ok {
		return fmt.Errorf("task plugin %s already running", name)
	}
	p, ok := plugin.Default.Get(plugin.TypeTask, name)
	if !ok {
		return fmt.Errorf("task plugin %q not found", name)
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.taskCancels[name] = cancel
	delete(m.taskErrors, name)
	go func() {
		err := plugin.RunTask(ctx, p, params)
		m.mu.Lock()
		if err != nil && ctx.Err() == nil {
			m.taskErrors[name] = err.Error()
			logs.Err(fmt.Sprintf("Task plugin %s exited with error: %v", name, err))
		}
		delete(m.taskCancels, name)
		m.mu.Unlock()
	}()
	return nil
}

// StopTaskPlugin 停止单个 task 插件
func (m *Manager) StopTaskPlugin(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cancel, ok := m.taskCancels[name]; ok {
		cancel()
		delete(m.taskCancels, name)
	}
	delete(m.taskErrors, name)
}

// TaskPluginError 返回指定 task 插件的最近错误
func (m *Manager) TaskPluginError(name string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.taskErrors[name]
}

// IsTaskPluginRunning task 插件是否运行中
func (m *Manager) IsTaskPluginRunning(name string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.taskCancels[name]
	return ok
}

// RunningTaskPlugins 所有运行中的 task 插件名
func (m *Manager) RunningTaskPlugins() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]string, 0, len(m.taskCancels))
	for name := range m.taskCancels {
		out = append(out, name)
	}
	return out
}

func (m *Manager) StartPipeline(cfg *model.ProcessorChain) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.pipelines[cfg.ID]; ok {
		return nil
	}
	p, err := createPipeline(cfg)
	if err != nil {
		return err
	}
	if cfg.Topic != "" {
		_, ch := m.queue.SubscribeNamed([]string{cfg.Topic}, queue.SubOpts{
			Name:      "chain#" + cfg.Name,
			OwnerType: "chain",
			OwnerID:   cfg.ID,
		})
		go func(ch <-chan *types.Message, p *decode.Pipeline, q *queue.Queue, outTopic string) {
			for msg := range ch {
				results, err := p.Process(msg)
				if err != nil {
					logs.Err(fmt.Sprintf("Pipeline process error: %v", err))
					continue
				}
				for _, result := range results {
					if result == nil {
						continue
					}
					if outTopic != "" && result.Topic == msg.Topic {
						result.Topic = outTopic
					}
					q.Publish(result)
				}
			}
		}(ch, p, m.queue, cfg.OutTopic)
	}
	m.pipelines[cfg.ID] = p
	return nil
}

func (m *Manager) StopPipeline(id int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.pipelines, id)
}

func createConnListener(cfg *model.ListenerConn) (listen.Listener, error) {
	switch cfg.Type {
	case model.ConnTypeTCP:
		var c model.TCPConnConfig
		_ = json.Unmarshal([]byte(cfg.Config), &c)
		return listen.NewTCP(c.Address, cfg.Topic), nil
	case model.ConnTypeUDP:
		var c model.TCPConnConfig
		_ = json.Unmarshal([]byte(cfg.Config), &c)
		return listen.NewUDP(c.Address, cfg.Topic), nil
	case model.ConnTypeSerial:
		var c model.SerialConnConfig
		_ = json.Unmarshal([]byte(cfg.Config), &c)
		return listen.NewSerial(c.Port, c.BaudRate, cfg.Topic), nil
	case model.ConnTypeScript:
		var c model.ScriptConnConfig
		_ = json.Unmarshal([]byte(cfg.Config), &c)
		return listen.NewScriptListener(c.Content, cfg.Topic), nil
	default:
		return nil, fmt.Errorf("unsupported conn type: %s", cfg.Type)
	}
}

func createDispatcher(cfg *model.DispatcherConfig) (push.Dispatcher, error) {
	var topics []string
	json.Unmarshal([]byte(cfg.Topics), &topics)
	switch cfg.Type {
	case model.DispatcherTypeHTTP:
		var c struct {
			URL    string            `json:"url"`
			Method string            `json:"method"`
			Header map[string]string `json:"header"`
		}
		json.Unmarshal([]byte(cfg.Config), &c)
		d := push.NewHTTPDispatcher(c.URL, c.Method, topics)
		d.Header = c.Header
		return d, nil
	case model.DispatcherTypeMQTT:
		var c struct {
			Broker   string `json:"broker"`
			ClientID string `json:"client_id"`
			Username string `json:"username"`
			Password string `json:"password"`
			PubTopic string `json:"pub_topic"`
			QoS      byte   `json:"qos"`
		}
		json.Unmarshal([]byte(cfg.Config), &c)
		return push.NewMQTTDispatcher(c.Broker, c.ClientID, c.Username, c.Password, c.PubTopic, c.QoS, topics)
	case model.DispatcherTypeScript:
		return push.NewScriptDispatcher(cfg.Config, topics)
	case model.DispatcherTypeWebsocket:
		var c struct {
			Address string `json:"address"`
		}
		json.Unmarshal([]byte(cfg.Config), &c)
		return push.NewWebsocketDispatcher(c.Address, topics), nil
	case model.DispatcherTypeRocketMQ:
		return push.NewRocketMQDispatcher(topics), nil
	case model.DispatcherTypePlugin:
		var c struct {
			PluginName string         `json:"plugin_name"`
			Params     map[string]any `json:"params"`
		}
		json.Unmarshal([]byte(cfg.Config), &c)
		if c.PluginName == "" {
			return nil, fmt.Errorf("plugin_name 不能为空")
		}
		return push.NewPluginPusher(c.PluginName, c.Params, topics), nil
	default:
		return nil, fmt.Errorf("unsupported dispatcher type: %s", cfg.Type)
	}
}

func createPipeline(cfg *model.ProcessorChain) (*decode.Pipeline, error) {
	var procs []struct {
		Key    string `json:"key"`
		Config string `json:"config"`
	}
	if err := json.Unmarshal([]byte(cfg.Processors), &procs); err != nil {
		return nil, err
	}
	var processors []decode.Processor
	for _, p := range procs {
		switch p.Key {
		case "json_format":
			var c struct {
				Pretty bool   `json:"pretty"`
				Topic  string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewJSONFormatProcessor(c.Pretty, c.Topic))
		case "json_extract":
			var c struct {
				Path  string `json:"path"`
				Topic string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewJSONExtractProcessor(c.Path, c.Topic))
		case "json_filter":
			var c struct {
				Path   string `json:"path"`
				Equals string `json:"equals"`
				Topic  string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewJSONFilterProcessor(c.Path, c.Equals, c.Topic))
		case "text_replace":
			var c struct {
				From  string `json:"from"`
				To    string `json:"to"`
				Topic string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewTextReplaceProcessor(c.From, c.To, c.Topic))
		case "text_regex_filter":
			var c struct {
				Pattern string `json:"pattern"`
				Topic   string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewTextRegexFilterProcessor(c.Pattern, c.Topic))
		case "field_map":
			var c struct {
				Mapping map[string]string `json:"mapping"`
				Topic   string            `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewFieldMapProcessor(c.Mapping, c.Topic))
		case "pass":
			processors = append(processors, new(decode.Nothing))
		case "dlt645":
			processors = append(processors, new(decode.DLT645))
		case "modbus_rtu":
			processors = append(processors, new(decode.ModbusRTU))
		case "script":
			var c struct {
				Script string `json:"script"`
				Topic  string `json:"topic"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			processors = append(processors, decode.NewScriptProcessor(c.Script, c.Topic))
		case "plugin":
			var c struct {
				PluginName string         `json:"plugin_name"`
				Params     map[string]any `json:"params"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			if c.PluginName != "" {
				processors = append(processors, decode.NewPluginProcessor(c.PluginName, c.Params))
			}
		case "plugin_decoder":
			var c struct {
				PluginName string         `json:"plugin_name"`
				Params     map[string]any `json:"params"`
			}
			_ = json.Unmarshal([]byte(p.Config), &c)
			if c.PluginName != "" {
				processors = append(processors, decode.NewPluginDecoder(c.PluginName, c.Params))
			}
		default:
			logs.Warn(fmt.Sprintf("Unknown processor key: %s", p.Key))
		}
	}
	return decode.NewPipeline(processors...), nil
}

func parseFraming(raw string) map[string]any {
	var cfg struct {
		Framing map[string]any `json:"framing"`
	}
	_ = json.Unmarshal([]byte(raw), &cfg)
	return cfg.Framing
}

func (m *Manager) applyFraming(connID int64, msg *types.Message, framing map[string]any) [][]byte {
	mode, _ := framing["mode"].(string)
	state := m.framing[connID]
	key := framingBufferKey(msg)
	streamMode := msg.Metadata["source"] == "tcp" || msg.Metadata["source"] == "serial"
	if !streamMode {
		return splitChunk(msg.Payload, framing)
	}
	if state == nil {
		return splitChunk(msg.Payload, framing)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	buf := append(state.buffer[key], msg.Payload...)
	frames, remain := splitStream(buf, framing)
	state.buffer[key] = remain
	if mode == "raw" {
		delete(state.buffer, key)
	}
	return frames
}

func splitChunk(data []byte, framing map[string]any) [][]byte {
	mode, _ := framing["mode"].(string)
	switch mode {
	case "delimiter":
		sep := parseDelimiter(framing["delimiter"])
		if len(sep) == 0 {
			return [][]byte{data}
		}
		parts := bytes.Split(data, sep)
		out := make([][]byte, 0, len(parts))
		for _, p := range parts {
			if len(p) > 0 {
				out = append(out, append([]byte(nil), p...))
			}
		}
		if len(out) == 0 {
			return [][]byte{data}
		}
		return out
	case "fixed_length":
		return splitFixedLength(data, getInt(framing["length"]))
	case "length_field":
		frames, _ := splitByLengthField(data, parseLengthFieldConfig(framing), false)
		if len(frames) == 0 {
			return [][]byte{data}
		}
		return frames
	default:
		return [][]byte{data}
	}
}

func splitStream(data []byte, framing map[string]any) ([][]byte, []byte) {
	mode, _ := framing["mode"].(string)
	switch mode {
	case "delimiter":
		return splitByDelimiterStream(data, parseDelimiter(framing["delimiter"]))
	case "fixed_length":
		return splitByFixedLengthStream(data, getInt(framing["length"]))
	case "length_field":
		return splitByLengthField(data, parseLengthFieldConfig(framing), true)
	default:
		if len(data) == 0 {
			return nil, nil
		}
		return [][]byte{append([]byte(nil), data...)}, nil
	}
}

func splitByDelimiterStream(data []byte, sep []byte) ([][]byte, []byte) {
	if len(sep) == 0 {
		if len(data) == 0 {
			return nil, nil
		}
		return [][]byte{append([]byte(nil), data...)}, nil
	}
	var out [][]byte
	for {
		idx := bytes.Index(data, sep)
		if idx < 0 {
			break
		}
		if idx > 0 {
			out = append(out, append([]byte(nil), data[:idx]...))
		}
		data = data[idx+len(sep):]
	}
	return out, append([]byte(nil), data...)
}

func splitByFixedLengthStream(data []byte, n int) ([][]byte, []byte) {
	if n <= 0 {
		if len(data) == 0 {
			return nil, nil
		}
		return [][]byte{append([]byte(nil), data...)}, nil
	}
	var out [][]byte
	for len(data) >= n {
		out = append(out, append([]byte(nil), data[:n]...))
		data = data[n:]
	}
	return out, append([]byte(nil), data...)
}

func splitFixedLength(data []byte, n int) [][]byte {
	out, remain := splitByFixedLengthStream(data, n)
	if len(remain) > 0 {
		out = append(out, remain)
	}
	if len(out) == 0 {
		return [][]byte{data}
	}
	return out
}

func splitByLengthField(data []byte, cfg lengthFieldConfig, keepRemain bool) ([][]byte, []byte) {
	var out [][]byte
	headerLen := cfg.Offset + cfg.Size
	for len(data) >= headerLen && cfg.Size > 0 {
		bodyLen, ok := readLengthValue(data[cfg.Offset:headerLen], cfg)
		if !ok || bodyLen < 0 {
			break
		}
		totalLen := bodyLen
		if cfg.IncludeHeader {
			totalLen += headerLen
		}
		if len(data) < headerLen+bodyLen {
			break
		}
		if cfg.IncludeHeader {
			out = append(out, append([]byte(nil), data[:headerLen+bodyLen]...))
		} else {
			out = append(out, append([]byte(nil), data[headerLen:headerLen+bodyLen]...))
		}
		if totalLen <= 0 || totalLen > len(data) {
			data = data[headerLen+bodyLen:]
		} else {
			data = data[totalLen:]
		}
	}
	if keepRemain {
		return out, append([]byte(nil), data...)
	}
	return out, nil
}

func parseDelimiter(v any) []byte {
	s, _ := v.(string)
	if s == "" {
		return nil
	}
	r := strings.NewReplacer(`\r`, "\r", `\n`, "\n", `\t`, "\t", `\\`, `\`)
	return []byte(r.Replace(s))
}

func parseLengthFieldConfig(framing map[string]any) lengthFieldConfig {
	cfg := lengthFieldConfig{Offset: 0, Size: 2, Endian: "big", IncludeHeader: false}
	cfg.Offset = getIntDefault(framing["offset"], 0)
	cfg.Size = getIntDefault(framing["size"], 2)
	if endian, ok := framing["endian"].(string); ok && endian != "" {
		cfg.Endian = strings.ToLower(endian)
	}
	if includeHeader, ok := framing["include_header"].(bool); ok {
		cfg.IncludeHeader = includeHeader
	}
	return cfg
}

func readLengthValue(data []byte, cfg lengthFieldConfig) (int, bool) {
	if len(data) < cfg.Size || cfg.Size <= 0 || cfg.Size > 4 {
		return 0, false
	}
	switch cfg.Size {
	case 1:
		return int(data[0]), true
	case 2:
		if cfg.Endian == "little" {
			return int(binary.LittleEndian.Uint16(data)), true
		}
		return int(binary.BigEndian.Uint16(data)), true
	case 4:
		if cfg.Endian == "little" {
			return int(binary.LittleEndian.Uint32(data)), true
		}
		return int(binary.BigEndian.Uint32(data)), true
	default:
		return 0, false
	}
}

func framingBufferKey(msg *types.Message) string {
	if remote, ok := msg.Metadata["remote_addr"].(string); ok && remote != "" {
		return remote
	}
	if port, ok := msg.Metadata["port"].(string); ok && port != "" {
		return port
	}
	return "default"
}

func copyMetadata(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+4)
	for k, v := range in {
		out[k] = v
	}
	return out
}

func getInt(v any) int {
	return getIntDefault(v, 0)
}

func getIntDefault(v any, fallback int) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case float32:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(x))
		if err == nil {
			return n
		}
	}
	return fallback
}
