# 脚本监听器对象模型设计

> 状态：已批准（2026-06-26），修订（顶级函数+单例模式）
> 范围：仅 `script_conn` 监听器；内置监听器（http/tcp/mqtt/serial/udp）不受影响

## 1. 背景与问题

当前 `script_conn` 的用户脚本是**顶级函数模式**：定义 `Run()` / `OnMessage()` 顶级函数，后端 `ScriptListener_` 包装这些函数。

痛点：
- 用户脚本**无法持有跨调用的状态**。例如用户脚本想开启一个 HTTP 服务持续接收，那个 `http.Server` 实例没地方放——每次调用 `Run()` 都是无状态的。
- 生命周期不完整：禁用监听器时只 `cancel` context，没有调用用户脚本的资源释放钩子。
- 与内置监听器的"对象式"模型不一致（内置监听器实现 `Listener` 接口，状态存在对象字段里）。

## 2. 目标

让 `script_conn` 用户脚本能以**对象形式**定义：
- 定义 `struct` + `New()` 工厂函数 + `Run/Close/Read/Write` 方法
- 框架 `new` 一个实例并管理其生命周期（启用→读→写→禁用）
- 用户对象字段可跨调用持有状态（连接、server 实例等）

## 3. 架构与组件分层

### 3.1 改动范围

| 文件 | 改动 |
|------|------|
| `internal/listen/listen_script.go` | 重写 `ScriptListener_`，包装用户对象（`reflect.Value`）实现 `listen.Listener` |
| `internal/listen/listen_script_test.go` | 新增单元测试（6 个用例） |
| `web/src/pages/data-flow/fieldSchema.ts` | `DEFAULT_SCRIPT_CONTENT` 模板更新为对象式 |

**不改动：**
- `internal/listen/listen_interface.go`（`Listener` 接口不变）
- `internal/pipeline/manager.go`（数据流不变，仍调 `l.Start/ReadMessage/Close`）
- `internal/script/pre_processor.go`（`pre_script` 仍是顶级 `Process` 函数，所有 listener 共用）

### 3.2 组件关系

```
manager.go (不变)
  └─ listen.Listener 接口 (不变: Start/ReadMessage/Write/Close/Closed)
       └─ ScriptListener_ (重写：包装用户对象)
            ├─ Start        → Eval("New") 拿对象 → reflect 调 Run(ctx)
            ├─ ReadMessage  → reflect 调 Read(ctx)
            ├─ Write        → reflect 调 Write(p) [可选，缺失则静默丢弃]
            └─ Close        → cancel ctx → reflect 调 Close()
```

数据流不变：`runStandaloneConnLocked` 创建 listener → `Start(ctx)` → `ReadMessage` 循环 → `Close()`。仅 `ScriptListener_` 内部从"调用顶级函数"改为"reflect 调用用户对象方法"。

## 4. 用户脚本接口契约

用户脚本采用**顶级函数 + 包级变量单例**模式：定义 4 个顶级函数，通过包级变量持有跨调用状态。函数无 ctx 参数，靠 Close 使 Run 退出。

> 多实例隔离：每个 `script_conn` 实例对应独立 yaegi 解释器（`SafeInterpreter()` 每次新建），包级变量在该解释器实例内单例，跨实例互不影响。

用户脚本必须定义：

```go
package main

// 单例状态（包级变量，跨调用持有）
var server *tcp.Server

// 启用：初始化资源（建连接/开端口），阻塞直到 Close 使其返回
func Run() error {
    server = tcp.NewServer(":8080")
    return server.Run()
}

// 禁用：释放资源，使 Run 自然返回
func Close() error { return server.Close() }

// 读取：阻塞读取一条数据
func Read() ([]byte, error) { return server.Read() }

// 可选：写入数据到连接。不实现则忽略出站。
func Write(p []byte) error { _, e := server.Write(p); return e }
```

### 约定

- `Run` / `Close` / `Read` 必须，签名严格匹配（无 ctx 参数）。
- `Write` 可选。框架 `Eval("Write")` 失败则内置 `Write` 返回 `len(p), nil` 忽略出站。
- 状态通过包级变量持有，4 个函数共享访问。
- 关闭机制：框架调 `Close()` 释放资源，用户需保证 `Close` 能使 `Run` 自然返回（如关 chan、关 conn）。
- `pre_script` 不受影响（仍是顶级 `Process` 函数，所有 listener 共用的入站预处理）。

### 性能优势

框架在 `Start` 时 `Eval("Run")` 等取函数并**类型断言为具体 `func` 类型缓存**到 `ScriptListener_` 字段，之后调用路径为直接函数调用（~5ns），**零反射开销**。对比 reflect.Call（~200ns/次）提升约 40 倍，但实际瓶颈是 yaegi 解释执行用户函数体（μs-ms 级），反射占比本就 <2%，此优化主要提升代码清晰度。

## 5. 框架调用流程与错误处理

### 5.1 Start(ctx)

1. `SafeInterpreter()` 创建解释器（不带白名单，可用 lib）
2. `Eval(content)` 编译脚本，失败返回 `"脚本编译失败: %w"`
3. `Eval("Run")` 取函数，类型断言为 `func() error` 缓存到 `s.runFn`；失败返回 `"脚本必须定义 Run 函数"` 或签名错误
4. `Eval("Close")` 断言 `func() error` → `s.closeFn`；失败返回错误
5. `Eval("Read")` 断言 `func() ([]byte, error)` → `s.readFn`；失败返回错误
6. `Eval("Write")` 尝试断言 `func([]byte) error` → `s.writeFn`；失败（用户未实现）静默，`s.writeFn` 保持 nil
7. `go` 启动 goroutine 调用 `s.runFn()`（阻塞，Close 使其返回）
8. `go` 启动 Read goroutine 循环调用 `s.readFn()`，结果推入 `msgCh`

### 5.2 ReadMessage()

- goroutine 循环调用 `s.readFn()`，数据推入 `msgCh`
- `ReadMessage` 从 `msgCh` 读，阻塞直到有数据或 ctx 取消（返回 `nil, io.EOF`）
- Read panic 时 recover，跳过本次，不崩溃 pipeline

### 5.3 Write(p)

- `s.writeFn == nil` → 返回 `len(p), nil`（静默丢弃出站）
- 否则调用 `s.writeFn(p)`，panic 时 recover 返回错误

### 5.4 Close()

- `closed.Store(true)` + `cancel()`（让 ReadMessage 的 ctx 取消）
- 调用 `s.closeFn()`（释放资源使 Run 自然返回），panic recover

### 5.5 错误处理与降级

- 编译 / 函数缺失 / 签名不匹配：`Start` 返回明确错误，manager 设 `error_info`，节点显示红点。
- Read/Write panic：recover，跳过本次，继续运行（不崩溃整个 pipeline）。
- Run 阻塞：goroutine 跑，框架调 `Close` 使其返回；用户需保证 Close 能让 Run 退出（如关 chan、关 conn）。
- 旧脚本（`Run(ctx) ([]byte, error)` 签名）：Start 报 `"Run 签名应为 func() error"`，提示用户迁移。

### 5.6 技术风险（已验证）

yaegi 对顶级函数 `Eval("Run")` 返回 `reflect.Value` of func，类型断言为具体 `func` 类型可行（旧 `listen_script.go` 已证明此模式）。**无反射调用开销**，调用路径为直接函数调用。

## 6. 前端模板

`fieldSchema.ts` 的 `DEFAULT_SCRIPT_CONTENT`（顶级函数 + 包级变量，无 ctx）：

```go
package main

// 单例状态（包级变量，跨调用持有）
var server *exampleServer

type exampleServer struct {
    ch chan []byte
}

// 启用：初始化资源（建连接/开端口），阻塞直到 Close 使其返回
func Run() error {
    server = &exampleServer{ch: make(chan []byte, 10)}
    for range server.ch {
    }
    return nil
}

// 禁用：释放资源，使 Run 自然返回
func Close() error {
    if server != nil {
        close(server.ch)
    }
    return nil
}

// 读取：阻塞读取一条数据
func Read() ([]byte, error) {
    return []byte("hello"), nil
}

// 可选：写入数据到连接。不实现则忽略出站。
func Write(p []byte) error { return nil }
```

`script_conn` 的 `content` 字段 tooltip 注明"定义顶级 Run（启用）/Close（禁用使 Run 退出）/Read（入站）/Write（出站可选）函数 + 包级变量持有状态"。

## 7. 测试策略

`internal/listen/listen_script_test.go`：

1. 完整生命周期 → Start/Read/Write/Close 全流程（Close 使 Run 退出）
2. 缺少 Run 函数 → Start 返回明确错误
3. 缺少 Close 函数 → Start 返回明确错误
4. 缺少 Read 函数 → Start 返回明确错误
5. Write 函数缺失 → Write 静默丢弃，不报错
6. Write 函数存在 → 调用成功
7. 旧脚本（`Run(ctx) ([]byte, error)` 签名）→ Start 报签名不匹配
8. 包级变量状态共享 → Run 设置的 var 在 Close 可见（单例语义验证）

## 8. 不在本次范围

- `pre_script` 仍保持顶级 `Process` 函数（所有 listener 共用，无状态，不需要对象化）
- 内置监听器（http/tcp/mqtt/serial/udp）不改动
- 其他 listener 类型的对象化（如未来支持用户自定义 http listener）留待后续
