# PROJECT_CONTEXT — script-gateway

> 本文件供 AI IDE / 新会话快速理解项目全貌。自包含，无需额外上下文即可开始工作。
> 硬性协作规则见同目录 `AGENTS.md`，本文件为架构理解文档，不替代 AGENTS.md 的约束力。

---

## 1. 项目定位

**脚本驱动的通用网关系统**。核心环节——监听接入、处理转换、分发输出——均可通过 Go 脚本（yaegi 解释器）深度定制。最终形态为单二进制后端 + 前端静态文件一体化部署。

yaegi 脚本定位：中等及以下复杂度的定制逻辑（格式转换、简单路由、字段映射等）。高吞吐场景应优先使用内置处理器。脚本性能约为基础 Go 代码的 5~10 倍降幅，单节点仍可支撑 10k msg/s（前提是脚本内无重计算）。

---

## 2. 技术栈

**后端**：Go 1.25 + gofiber/fiber v3 + xorm（ORM）+ yaegi（脚本解释器）

注意：需求文档写的是 Gin + Gorm，实际代码使用 fiber + xorm，一切以代码为准。底层 IO 框架依赖 `github.com/injoyai/ios` 系列（连接管理、分帧、协议模块），配置读取使用 `github.com/injoyai/conv`，Web 框架封装使用 `github.com/injoyai/frame`。

**前端**：CRA（Create React App）+ Ant Design + @xyflow/react（React Flow 数据流画布）+ Monaco Editor

**数据库**：MySQL 生产 / SQLite 开发，通过 xorm Sync2 自动建表

**配置**：`config/config.yaml`，默认端口 8200，通过 `github.com/injoyai/conv/cfg` 读取

**认证**：JWT（golang-jwt/jwt v5），密码 bcrypt 哈希，默认管理员 admin/admin

---

## 3. 核心架构：三段式数据流

```
监听器(Listener) → 消息队列(Queue) → 处理器链(ProcessorChain) → 消息队列 → 分发器(Dispatcher)
```

消息在内部以 `internal/types.Message` 统一流转：

```go
type Message struct {
    ID       string         `json:"id"`       // 唯一ID（crypto/rand 生成 32 位 hex）
    Payload  []byte         `json:"payload"`  // 原始数据
    Topic    string         `json:"topic"`    // topic（来自监听器配置或处理器动态指定）
    Metadata map[string]any `json:"metadata"` // 来源信息：timestamp, source, conn_id, conn_type, parent_id, remote_addr 等
}
```

### 3.1 消息队列（internal/queue）

基于 Go channel + topic 路由的内存消息队列。核心特性：

- **topic 路由**：Publish 时按 `msg.Topic` 分发到所有订阅了该 topic 的 Subscriber
- **环形缓冲快照**：每个 topic 维护一个 ringBuffer（默认 100 条），保存最近消息，供前端实时查看
- **带身份的命名订阅**：`SubscribeNamed(topics, SubOpts)` 返回 `*Subscriber`，携带 OwnerType（listener/chain/dispatcher/legacy）和 OwnerID，用于统计与诊断
- **非阻塞投递**：channel 满时直接丢弃（`default` 分支），记录 drop 计数，不阻塞发布者
- **每秒 tick**：推进所有 Subscriber 的滑动窗口桶，用于速率统计

### 3.2 Pipeline Manager（internal/pipeline/manager.go）

整个后端的中枢，单例 `Default`，在 `main.go` 中 `pipeline.Default.Start()` 启动。管理以下资源的完整生命周期：

| 资源类型 | 存储字段 | 启动顺序 |
|---|---|---|
| 监听器父级 (ListenerParent) | `parents map[int64]*parentRuntime` | startParents() |
| 监听器子连接 (ListenerConn) | `listeners map[int64]listen.Listener` + `cancels map[int64]context.CancelFunc` | startConns() |
| 处理器链 (ProcessorChain) | `pipelines map[int64]*decode.Pipeline` | startPipelines() |
| 分发器 (DispatcherConfig) | `dispatchers map[int64]push.Dispatcher` + `dispatcherSubs map[int64]*queue.Subscriber` | startDispatchers() |
| 任务插件 (TaskPlugin) | `taskCancels map[string]context.CancelFunc` | startTaskPlugins() |

启动流程：`Sync2(建表) → ensureDefaultAdmin → startDispatchers → startPipelines → startParents → startConns → startTaskPlugins`。

Manager 还维护错误状态（`parentErrors` / `connErrors` / `taskErrors`），供前端查询节点运行状态和错误信息。

---

## 4. 监听器模块（两级结构）

监听器采用父子两级设计，模型定义在 `app/model/models.go`。

### 4.1 ListenerParent（父级，管理共享资源）

| 类型常量 | 值 | 说明 | 配置结构 |
|---|---|---|---|
| ParentTypeHTTPServer | `http_server` | HTTP 服务端，绑定端口接收请求 | `ParentHTTPConfig{Port int}` |
| ParentTypeMQTTClient | `mqtt_client` | MQTT 客户端，连接 broker | `ParentMQTTConfig{Broker, ClientID, Username, Password}` |

父级管理底层连接资源（http.Server / mqtt.Client），子连接共享这些资源。父级删除时级联停止所有子连接。

### 4.2 ListenerConn（子连接 / 独立监听器）

| 类型常量 | 值 | 挂载方式 | 配置结构 |
|---|---|---|---|
| ConnTypeTCP | `tcp_conn` | 独立 | `TCPConnConfig{Address}` |
| ConnTypeUDP | `udp_conn` | 独立 | `TCPConnConfig{Address}` |
| ConnTypeSerial | `serial_conn` | 独立 | `SerialConnConfig{Port, BaudRate}` |
| ConnTypeScript | `script_conn` | 独立或挂父级 | `ScriptConnConfig{Content}` (Go 脚本) |
| ConnTypeHTTPRoute | `http_route` | 挂 http_server 父级 | `HTTPRouteConfig{Path, Methods}` |
| ConnTypeMQTTSub | `mqtt_subscription` | 挂 mqtt_client 父级 | `MQTTSubConfig{SubTopic, QoS}` |
| ConnTypePlugin | `plugin` | 独立 | `{PluginName, Params}` |

ListenerConn 模型字段说明：
- `Topic`：入站 topic，连接收到的数据推送到此 topic
- `OutTopic`：出站 topic，订阅此 topic 的消息会写入连接（双向通信）
- `Config`：JSON 配置，按 Type 区分结构（见上表）
- `Extra`：JSON 扩展配置，目前用于分帧规则（framing）

### 4.3 统一监听器接口（internal/listen/listen_interface.go）

```go
type Listener interface {
    Start(ctx context.Context) error      // 启动监听（建立连接、绑定端口等）
    ReadMessage() ([]byte, error)         // 读取一条消息（阻塞直到有数据或关闭）
    io.Writer                              // 写入数据到连接（出站）
    io.Closer                              // 关闭监听器
    Closed() bool                          // 获取监听状态
}
```

生命周期：`Start → 循环 ReadMessage → Close`。Pipeline Manager 统一管理读循环，监听器只负责"怎么读/写一条消息"。

已实现：TCP、UDP、Serial（go.bug.st/serial）、Script（yaegi）、Plugin、HTTP（内嵌在 parentRuntime 中）、MQTT（内嵌在 parentRuntime 中）。

### 4.4 分帧机制（Framing）

用于解决 TCP/Serial 等流式协议的粘包问题。配置存储在 `ListenerConn.Extra` JSON 的 `framing` 字段中。支持三种模式：

- **delimiter**：分隔符分帧。`delimiter` 字段支持 `\r`、`\n`、`\t`、`\\` 转义
- **fixed_length**：定长分帧。`length` 字段指定每帧长度
- **length_field**：长度字段分帧。字段包括 `offset`（偏移量，默认0）、`size`（长度，1/2/4 字节，默认2）、`endian`（big/little，默认big）、`include_header`（长度是否包含头部，默认false）

分帧逻辑区分流模式（TCP/Serial，有状态缓冲）和报文模式（UDP/HTTP/MQTT，无状态直接切分）。流模式按 `remote_addr` 或 `port` 维护独立缓冲区，支持多客户端。

---

## 5. 处理器链模块（ProcessorChain）

### 5.1 数据模型

```go
type ProcessorChain struct {
    ID         int64
    Name       string
    Topic      string    // 订阅 topic
    OutTopic   string    // 发布 topic（若处理器未动态指定 topic，则覆盖为 OutTopic）
    Processors string    // JSON 数组：[{key, config}, ...]
    Enable     bool
}
```

### 5.2 Processor 接口（internal/decode/decode_interface.go）

```go
type Processor interface {
    Process(msg *types.Message) ([]*types.Message, error)
    Key() string
    Name() string
}
```

Pipeline 采用 fan-out 模式：上游产出的每条消息独立流过下游处理器。`Process` 返回 `[]*Message`，长度 0 表示丢弃，长度 >1 表示一进多出（分流）。错误中断整个链路。

### 5.3 内置处理器

| Key | 名称 | 说明 |
|---|---|---|
| `json_format` | JSON 格式化 | 格式化 JSON，可选 pretty |
| `json_extract` | JSON 提取 | 按 path 提取 JSON 字段 |
| `json_filter` | JSON 过滤 | 按 path + equals 条件过滤 |
| `text_replace` | 文本替换 | 简单字符串替换 |
| `text_regex_filter` | 正则过滤 | 正则匹配过滤 |
| `field_map` | 字段映射 | 按映射表重命名字段 |
| `dlt645` | DLT645 协议 | 电力 DLT645 协议解析 |
| `modbus_rtu` | Modbus RTU | Modbus RTU 协议解析 |
| `pass` | 忽略 | 直接透传 |
| `script` | 自定义脚本 | yaegi 脚本处理器 |
| `plugin` | 插件处理器 | 加载 plugin 类型插件 |
| `plugin_decoder` | 插件解码器 | 加载 decoder 类型插件 |

处理器在 `pipeline/manager.go` 的 `createPipeline()` 函数中通过 switch-case 工厂模式创建。

---

## 6. 分发器模块（Dispatcher）

### 6.1 数据模型

```go
type DispatcherConfig struct {
    ID      int64
    Name    string
    Type    string    // 见下表
    Enable  bool
    Topics  string    // JSON 数组：["topic1", "topic2"]
    Config  string    // JSON 配置，按 Type 区分
}
```

### 6.2 Dispatcher 接口（internal/push/push_interface.go）

```go
type Dispatcher interface {
    Push(msg *types.Message) error
    Close() error
    Topics() []string
}
```

### 6.3 分发器类型

| 类型常量 | 值 | 说明 | 配置字段 |
|---|---|---|---|
| DispatcherTypeHTTP | `http` | HTTP 回调 | `url, method, header` |
| DispatcherTypeMQTT | `mqtt` | MQTT 发布 | `broker, client_id, username, password, pub_topic, qos` |
| DispatcherTypeScript | `script` | 脚本分发器 | `script` (Go 脚本代码) |
| DispatcherTypeWebsocket | `websocket` | WebSocket 推送 | `address` |
| DispatcherTypeRocketMQ | `rocketmq` | RocketMQ | (内置默认配置) |
| DispatcherTypePlugin | `plugin` | 插件推送 | `plugin_name, params` |
| DispatcherTypeStdout | `stdout` | 终端打印 | 无（调试用） |

此外还有 **Viewer（查看分发器）**：订阅 topic，前端实时查看数据流，本质也是一种分发器。模型独立（`Viewer` 表），但功能上归类为分发器。

分发器在 `pipeline/manager.go` 的 `createDispatcher()` 函数中创建。启动时订阅 topic，循环消费 channel 消息并调用 `Push`。

---

## 7. 脚本引擎（yaegi）

### 7.1 安全沙盒（internal/script/sandbox.go）

- **解释器创建**：`SafeInterpreter()` 使用 stdlib + 自定义 lib（`lib/` 目录下的 injoyai 包符号）
- **白名单模式**：`SafeInterpreterWithWhitelist()` 仅注册安全包：fmt, strings, strconv, encoding/json, encoding/hex, encoding/base64, math, time, regexp, bytes, crypto/md5, crypto/sha1, crypto/sha256, crypto/hmac
- **超时控制**：`RunWithTimeout(fn, timeout)`，默认 50ms，超时中断
- **panic 恢复**：脚本 panic 被 recover，记录错误继续处理下一条消息

### 7.2 脚本接口约定（AGENTS.md 硬性规则）

三种脚本类型有固定函数签名，前后端默认模板必须一致：

**脚本处理器**（processor_chain 中的 `script` 节点）：
```go
package main

func Deal(payload []byte) (map[string]any, error) {
    return map[string]any{
        "": payload,
    }, nil
}
```

返回值约定：
- `map 不为空, nil`：通过。key 为目标 topic（`""` 表示沿用入站 topic），value 为消息内容。value 为 `[]byte` 时直接透传，其他类型框架自动 JSON 序列化
- `nil / 空 map, nil`：丢弃该消息
- `_, err`：报错，框架降级使用原消息

**脚本监听器**（script_conn）：
```go
package main

func Run() error { return nil }
func Close() error { return nil }
func Read() ([]byte, error) { return nil, nil }
func Write(p []byte) error { return nil }
```

`Run()` 启用时调用（阻塞直到 Close 使其返回），`Close()` 禁用时调用，`Read()` 为入站数据来源，`Write()` 可选（出站）。

**脚本分发器**（dispatcher 中的 `script` 类型）：
```go
package main

func Forward(payload any) error {
    return nil
}
```

### 7.3 已废弃（禁止再加回）

- `pre_script` / `PreScript` / `NewPreProcessor`：入站预处理已统一由处理器链取代
- `internal/script/pre_processor.go`：已删除
- `listener_conn.pre_script`：前后端均已移除
- `script` 处理器函数名 `Process`：必须使用 `Deal`
- `script` 处理器返回 `[]byte`：必须使用 `map[string]any` 以支持多 topic 输出
- `script` 处理器节点上的 `topic / out_topic` 字段：已废弃

### 7.4 自定义库（lib/）

`lib/` 目录包含 `github.com/injoyai` 系列包的 yaegi 符号导出，供脚本中使用。涵盖：IO 客户端、连接管理、分帧、编解码、加密、MQTT/TCP/Serial/WebSocket 模块等。入口文件 `lib/lib.go` 通过 `lib.Symbols` 统一导出。

---

## 8. 插件系统（internal/plugin）

基于 yaegi 加载 Go 源码插件，支持五种类型：

| 类型常量 | 值 | 入口函数 | 用途 |
|---|---|---|---|
| TypeListener | `listener` | Run/Close/Read/Write | 自定义监听器 |
| TypeDecoder | `decoder` | Decode | 自定义解码器 |
| TypeProcessor | `processor` | Process | 自定义处理器 |
| TypePusher | `pusher` | Push | 自定义推送器 |
| TypeTask | `task` | RunTask | 后台任务（定时心跳等） |

插件结构：`plugins/<category>/<name>/` 下包含 `plugin.yaml`（清单 + 参数定义）和 `main.go`（实现）。

Manifest 结构包含：Name, Display, Version, Type, Entry, Description, Params（ParamSpec 数组，定义参数 key/label/type/default/required/options/min/max）。

加载流程：`plugin.Default.SetDir(dir) → LoadAll() → List/ListFailed/Get`。任务插件由 Pipeline Manager 管理（`StartTaskPlugin` / `StopTaskPlugin`）。

现有示例插件：
- `plugins/decoders/json_decoder` — JSON 解码器
- `plugins/listeners/timer` — 定时监听器
- `plugins/processors/add_timestamp` — 添加时间戳处理器
- `plugins/pushers/stdout` — 标准输出推送器
- `plugins/tasks/heartbeat` — 心跳任务

---

## 9. API 路由

路由定义在 `app/route/route.go`，使用 gofiber + `github.com/injoyai/frame/fbr` 封装。所有 API 在 `/api` 下分组，通过 `fbr.WithStruct` 将结构体方法自动绑定为路由处理器。

| 分组 | 路径前缀 | 结构体 | 功能 |
|---|---|---|---|
| 认证 | `/api/auth` | `Auth` | 登录/登出 |
| 用户 | `/api/user` | `User` | 修改密码 |
| 监听器父级 | `/api/listener-parent` | `ListenerParent` | CRUD + 启停 |
| 监听器子连接 | `/api/listener-conn` | `ListenerConn` | CRUD + 启停 |
| 处理器链 | `/api/processor_chain` | `ProcessorChain` | CRUD + 启停 |
| 分发器 | `/api/dispatcher` | `Dispatcher` | CRUD + 启停 |
| 查看分发器 | `/api/viewer` | `Viewer` | CRUD + 启停 |
| 模拟器 | `/api/mocker` | `Mocker` | CRUD + 触发 |
| 数据流布局 | `/api/flow-layout` | `FlowLayout` | 画布位置保存/加载 |
| 解码 | `/api/decode` | `Decode` | 解码脚本管理 |
| 操作日志 | `/api/audit` | `OperationLog` | 审计日志查询 |
| 监控 | `/api/monitor` | `Monitor` | 实时监控数据 |
| 队列 | `/api/queue` | `Queue` | 队列深度/订阅者/消息快照 |
| 指标 | `/api/metrics` | `Metrics` | 性能指标 |
| 配置快照 | `/api/snapshot` | `ConfigSnapshot` | 快照创建/回滚 |
| 脚本热加载 | `/api/hotreload` | `ScriptHotReload` | 脚本热更新 |
| 插件 | `/api/plugin` | `Plugin` | 插件加载/列表/启停 |
| SSH | `/api/ssh` | `Ssh` | 本地终端 WebSocket |

非 `/api` 路径回退到 `./web/build/index.html`（SPA 路由）。

API 层代码在 `app/api/` 目录，每个文件对应一个资源类型。通用工具在 `app/common/common.go`（数据库连接等）。数据模型在 `app/model/` 目录。

---

## 10. 数据模型总览

所有模型定义在 `app/model/` 目录，通过 `model.AllTables()` 返回所有表供 xorm Sync2 自动建表。

| 模型 | 表名 | 说明 |
|---|---|---|
| User | user | 用户（admin/admin 默认） |
| ListenerParent | listener_parent | 监听器父级 |
| ListenerConn | listener_conn | 监听器子连接 |
| DispatcherConfig | dispatcher_config | 分发器配置 |
| ProcessorChain | processor_chain | 处理器链 |
| Viewer | viewer | 查看分发器 |
| Mocker | mocker | 模拟数据发送器 |
| OperationLog | operation_log | 操作审计日志 |
| ConfigSnapshot | config_snapshot | 配置快照 |
| Metric | metric | 指标数据 |
| Script | script | 脚本文件 |
| DecodeScript | decode_script | 解码脚本 |
| PushScript | push_script | 推送脚本 |
| TaskPluginConfig | task_plugin_config | 任务插件配置 |
| FlowLayout | flow_layout | 数据流画布布局 |

---

## 11. 指标与可观测性

### 11.1 指标采集（internal/metrics/collector.go）

`metrics.Default` 单例采集器，维护 counters（递增计数器）和 gauges（仪表值），使用 atomic.Int64 保证并发安全。记录入站/出站/处理/分发各环节的消息计数和错误计数。

### 11.2 队列监控

Queue 提供 `TopicsWithDepth()`（所有 topic 的深度和订阅者数）、`RecentMessages(topic, n)`（最近 N 条消息快照）、`Subscribers()`（所有订阅者统计）等接口，供前端实时展示。

### 11.3 Mocker（模拟器）

向指定 topic 注入模拟数据，支持手动触发和定时发送（Interval 毫秒，0=不定时）。用于测试和调试。

---

## 12. 前端架构

### 12.1 整体结构

- **框架**：React + React Router（BrowserRouter）
- **UI 库**：Ant Design
- **画布**：@xyflow/react（React Flow）
- **代码编辑器**：Monaco Editor（@monaco-editor/react）
- **状态管理**：Zustand（store/ 目录）
- **HTTP 代理**：setupProxy.js，开发模式前端 3000 端口代理到后端 8200

### 12.2 路由结构（App.tsx）

认证后所有页面在 `MainLayout` 下（侧边栏 + 顶栏 + 内容区）：

- `/dashboard` — 总览
- `/unified/data-flow` — 数据流可视化（核心配置入口）
- `/data/monitor` — 实时监控
- `/data/queue` — 消息队列
- `/data-listener/*` — 数据监听（HTTP/MQTT/TCP/UDP/串口/脚本/插件/解析，独立管理页，将逐步移除）
- `/unified/processor-chains` — 数据处理（独立管理页，将逐步移除）
- `/unified/dispatchers` — 数据转发（独立管理页，将逐步移除）
- `/scripts/*` — 脚本管理
- `/system/*` — SSH 客户端 / 插件管理 / 全局配置

### 12.3 数据流可视化画布（核心）

`web/src/pages/data-flow/DataFlowCanvas.tsx` 是整个项目的配置核心。按照 AGENTS.md 约定，这是监听/处理/转发三段的**唯一配置入口**。

关键组件与文件：

- `DataFlowCanvas.tsx` — 画布主组件，渲染所有节点和连线，管理节点位置（通过 FlowLayout API 持久化）
- `FlowNodes.tsx` — 节点渲染组件（ListenerParentNode / ListenerConnNode / ProcessorChainNode / DispatcherNode / ViewerNode / MockerNode）
- `NodeEditModal.tsx` — 新建/编辑弹窗（居中 Modal，schema 驱动）
- `InlineEditPanel.tsx` — 内联编辑面板（点击节点后侧边展示）
- `fieldSchema.ts` — 字段 schema 定义（每种节点类型的字段规格、类型、选项、验证规则）
- `processorSchema.ts` — 处理器配置 schema（共享模块）
- `FieldRenderer.tsx` — 按 schema 渲染表单控件（支持 text/number/select/textarea/framing 等字段类型）
- `ViewerStreamModal.tsx` — 查看分发器实时数据流弹窗

### 12.4 脚本编辑器

`ScriptEditorDrawer.tsx` — 全局脚本编辑器抽屉，所有脚本类型节点的新建/编辑弹窗都通过「编辑脚本」按钮调用此组件。通过 Zustand store（`useScriptEditorStore`）管理打开状态、内容、保存回调。禁止内嵌脚本编辑器，禁止"新建即写脚本"的非标流程。

### 12.5 主题设计

`theme.css` 定义「松烟纸笺」设计系统：
- 色彩：paper（纸底）/ ink（墨字）/ pine（松青）/ ochre（赭石）/ success（成功绿）/ rouge（胭脂红）/ indigo（靛蓝）
- 圆角：`--r-sm` / `--r-md` / `--r-lg`
- 阴影：`--shadow-1` / `--shadow-2`（柔和）
- 边线：`--line` / `--line-strong` / `--line-dash`
- 字体：`--font-han`（中文）/ `--font-num`（数字）/ `--font-mono`（等宽）
- 画布节点严格遵循此主题，禁用硬编码饱和色

---

## 13. 目录结构

```
script-gateway/
├── main.go                    # 入口：加载插件 → 启动 pipeline → 加载 mocker → 启动 HTTP
├── config/config.yaml         # 配置（端口、数据库 DSN、插件目录）
├── go.mod / go.sum            # Go 依赖
├── AGENTS.md                  # AI 协作硬性规则（禁止私自修改）
├── PROJECT_CONTEXT.md         # 本文件
├── 需求文档.md                 # 原始需求（注意：技术栈描述与实际代码不符）
│
├── app/                       # 应用层
│   ├── api/                   # HTTP API 处理器（每文件一个资源类型）
│   ├── common/common.go       # 数据库连接等通用工具
│   ├── model/                 # 数据模型 + 类型常量 + 配置结构
│   ├── route/route.go         # 路由注册
│   └── server/                # 服务端逻辑（解码等）
│
├── internal/                  # 内部包（不对外暴露）
│   ├── audit/                 # 操作日志记录
│   ├── auth/                  # JWT + bcrypt
│   ├── decode/                # 处理器实现（Processor 接口 + Pipeline + 各内置处理器）
│   ├── listen/                # 监听器实现（Listener 接口 + TCP/UDP/Serial/Script/Plugin）
│   ├── metrics/               # 指标采集
│   ├── pipeline/manager.go    # ★ Pipeline Manager（核心中枢）
│   ├── plugin/                # 插件系统（yaegi 加载 + 工厂 + 注册表）
│   ├── push/                  # 分发器实现（Dispatcher 接口 + HTTP/MQTT/WS/RocketMQ/Script/Plugin/Stdout）
│   ├── queue/                 # 消息队列（topic 路由 + ringBuffer + Subscriber）
│   ├── register/              # 注册器
│   ├── script/sandbox.go      # yaegi 安全沙盒（白名单 + 超时 + panic 恢复）
│   └── types/                 # Message 等公共类型
│
├── lib/                       # yaegi 符号导出（injoyai 系列包）
│
├── plugins/                   # 插件目录（yaml + go）
│   ├── decoders/
│   ├── listeners/
│   ├── processors/
│   ├── pushers/
│   └── tasks/
│
├── data/                      # 运行时数据
│   ├── database/sqlite.db     # SQLite 开发数据库
│   └── script/                # 脚本文件存储
│
├── docs/superpowers/          # 设计文档与计划
│   ├── plans/
│   └── specs/
│
└── web/                       # 前端工程
    ├── package.json
    ├── config-overrides.js
    └── src/
        ├── App.tsx            # 路由
        ├── index.tsx          # 入口
        ├── theme.css          # 「松烟纸笺」设计系统
        ├── components/        # 通用组件（CodeEditor, ScriptEditorDrawer, TopicMonitorDrawer 等）
        ├── layouts/MainLayout.tsx  # 侧边栏 + 顶栏布局
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Login.tsx
        │   ├── data-flow/     # ★ 数据流可视化画布（核心）
        │   ├── data-listener/ # 数据监听独立页（将逐步移除）
        │   ├── data-monitor/  # 实时监控 + 消息队列
        │   ├── data-forwarding/ # 数据转发
        │   ├── unified/       # 统一管理（处理器链/分发器，将逐步移除）
        │   ├── scripts/       # 脚本管理
        │   ├── system/        # SSH/插件/配置
        │   └── data-collection/  # 数据采集（占位，将清理）
        ├── services/          # API 调用封装
        ├── store/             # Zustand 状态管理
        └── types/             # TypeScript 类型声明
```

---

## 14. 开发流程

### 14.1 一键启动

`start-dev.bat` 开发模式一键启动前后端：
- 后端：`go run main.go`（端口 8200）
- 前端：`web/` 下 `npm start`（端口 3000，proxy 指向 8200）
- 两个服务各在独立 cmd 窗口运行，含环境检查与依赖自动安装

### 14.2 构建部署

- 后端：`go build ./...` 编译
- 前端：`web/` 下 `npm run build`，产物在 `web/build/`，后端通过 `s.Static("/", "./web/build/")` 静态托管
- 单二进制 + 前端静态文件一体化部署

### 14.3 后端验证

- `go build ./...` 必须通过
- `go test ./internal/...` 必须通过
- **后端改动后必须重启生效**：改 Go 代码后必须重新编译并重启后端服务

### 14.4 前端验证

- `npx tsc --noEmit` 零错误
- `setupProxy.js` 改动需重启前端 dev server（CRA 不热重载它）
- WebSocket 代理需 `ws: true`（已配置）

---

## 15. 工程约定（AGENTS.md 核心规则摘要）

以下为 AGENTS.md 硬性规则的摘要，详细内容以 AGENTS.md 为准：

1. **全局视角审查（强制）**：任何改动在落地前必须从全局审视合理性——是否与现有架构/数据流/既定约定一致，是否波及其他模块或节点类型，是否引入已废弃机制。单点"能跑"不等于合理。影响面不明时先列范围再动手。

2. **数据流可视化为唯一配置入口**：监听/处理/转发三段的配置全部在 DataFlowCanvas 完成。数据管理独立页（data-listener / unified 等）将逐步移除。共享 schema 抽到 fieldSchema.ts / processorSchema.ts。

3. **节点新建/编辑统一交互**：新建/编辑一律使用居中 Modal（禁止 Drawer）。脚本类节点必须提供「编辑脚本」按钮，通过 ScriptEditorDrawer 修改脚本。禁止内嵌脚本编辑器。

4. **删除交互**：所有可删除节点必须二次确认（window.confirm）。父容器删除时级联清理子项。

5. **改动范围**：仅做用户明确要求的事，不要顺手"重构""清理""加错误处理""加注释"。

6. **变更流程**：如对 AGENTS.md 标准有调整意图——先列变更点与用户对齐 → 用户确认后同步更新 AGENTS.md → 再改代码。禁止先改代码再口头通知。禁止私自修改 AGENTS.md。

7. **Git 约定**：禁止 `git add -A`、禁止 `git push --force`、禁止未授权的破坏性 git 操作。

8. **脚本模板**：三种脚本类型的默认模板必须保持最简骨架，不允许塞示例 import、示例业务逻辑、多余注释。前后端模板必须一致。

---

## 16. 注意事项与已知差异

- 需求文档写 Gin + Gorm，实际代码是 fiber + xorm，一切以代码为准
- config.yaml 默认配置 MySQL，开发环境如需 SQLite 需修改 DSN
- 前端侧边栏中「数据采集」「数据服务」为占位功能（mock），不在画布实现，后续直接清理菜单与路由
- SSH 客户端实为本地终端（xterm + WebSocket → 后端 powershell/bash），非远程 SSH
- run-web.bat 中注释写的 proxy 8080 已过时，实际 proxy 是 8200
- .bat 脚本需使用 CRLF 行尾（LF 行尾在 Windows cmd 多行 if 块/标签解析会出错）
