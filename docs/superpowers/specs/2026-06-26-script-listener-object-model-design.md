# 脚本监听器对象模型设计

> 状态：已批准（2026-06-26）
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

> 技术实现说明：yaegi 将用户脚本类型重写为匿名 struct，**方法集在 reflect 层面不可见**（`MethodByName` 失败）。因此采用**函数字段**形式：用户在 struct 上定义函数类型字段，在 `New()` 中赋值。语义上仍是"对象持有状态 + 生命周期方法"，仅承载方式从方法定义改为函数字段赋值。

用户脚本必须定义：

```go
package main

import "context"

// New 工厂函数：框架 Eval("New") 调用，返回对象实例
func New() *myListener { return &myListener{} }

type myListener struct {
    // 用户状态字段，跨调用持有（如 *tcp.Server、连接池等）
    srv *tcp.Server

    // 生命周期方法（函数字段形式，在 New 中赋值）
    Run   func(context.Context) error
    Close func() error
    Read  func(context.Context) ([]byte, error)
    Write func([]byte) error  // 可选
}

// Run 启用：初始化资源（建连接/开端口）。ctx 取消时必须返回。
// Close 禁用：释放资源。Run 后调用。
// Read 入站：阻塞读取一条数据。ctx 取消时返回 (nil, ctx.Err())。
// Write 出站：写入数据到连接。可选，不实现则 Write 静默丢弃。
```

`New` 推荐写法（用闭包共享状态）：

```go
func New() *myListener {
    s := &myListener{}
    s.Run = func(ctx context.Context) error {
        s.srv = tcp.NewServer(":8080")
        go s.srv.Run()
        <-ctx.Done()
        return nil
    }
    s.Close = func() error { if s.srv != nil { return s.srv.Close() }; return nil }
    s.Read = func(ctx context.Context) ([]byte, error) { return s.srv.Read() }
    s.Write = func(p []byte) error { _, err := s.srv.Write(p); return err }
    return s
}
```

### 约定

- `New` 必须，返回任意类型指针。框架用 reflect `Call` 调用。
- `Run` / `Close` / `Read` 字段必须存在，签名严格匹配。
- `Write` 可选。鸭子检测：reflect `FieldByName("Write")` 为 nil 或 invalid 时，框架内置 `Write` 返回 `len(p), nil` 忽略出站。
- `pre_script` 不受影响（仍是顶级 `Process` 函数，所有 listener 共用的入站预处理）。

## 5. 框架调用流程与错误处理

### 5.1 Start(ctx)

1. `SafeInterpreter()` 创建解释器（不带白名单，可用 lib）
2. `Eval(content)` 编译脚本，失败返回 `"脚本编译失败: %w"`
3. `Eval("New")` 取工厂函数，缺失返回 `"脚本必须定义 New 函数"`
4. `reflect` 调用 `New()` 拿对象 `reflect.Value`，存 `s.obj`（指针类型）
5. `reflect` 取 `obj.Elem().FieldByName("Run")`，缺失/invalid 返回 `"对象必须定义 Run func(context.Context) error 字段"`
6. `go` 启动 goroutine 调用 `Run(ctx)`（阻塞，ctx 取消返回）

### 5.2 ReadMessage()

- goroutine 循环 `reflect` 调用 `obj.Elem().FieldByName("Read").Call(ctx)`，结果推入 `msgCh`
- 阻塞直到返回数据或 ctx 取消（ctx 取消返回 `nil, io.EOF`）
- Read panic 时 recover，跳过本次，不崩溃 pipeline

### 5.3 Write(p)

- `reflect` 检测 `obj.Elem().FieldByName("Write")`
- invalid/nil → 返回 `len(p), nil`（静默丢弃出站）
- 有效 → 调用 `Write(p)`，返回结果

### 5.4 Close()

- `closed.Store(true)` + `cancel()`（让 Run 的 ctx 取消）
- `reflect` 调用 `obj.Elem().FieldByName("Close")`（存在则调，让用户释放资源）

### 5.5 错误处理与降级

- 编译 / New / 字段缺失：`Start` 返回明确错误，manager 设 `error_info`，节点显示红点。
- Read/Write panic：recover，日志记录，继续运行（不崩溃整个 pipeline）。
- Run 阻塞：goroutine 跑，ctx 取消时 Run 应自行返回；框架不强制超时（Run 可能是长生命周期，如开 HTTP 服务）。
- 旧脚本（顶级 Run/OnMessage）：Start 报 `"脚本必须定义 New 函数"`，提示用户迁移。

### 5.6 技术风险（已验证）

经 spike 验证：yaegi 将用户脚本类型重写为匿名 struct（如 `*struct { Xstarted bool }`），**方法集 reflect 不可见**（`MethodByName` 返回 invalid）。但**函数字段 reflect 可见**（`FieldByName` 成功取到 func 类型值并可 Call）。因此采用函数字段承载方式，风险已消除。

## 6. 前端模板

`fieldSchema.ts` 的 `DEFAULT_SCRIPT_CONTENT` 更新为对象式：

```go
package main

import (
    "context"
    "time"
)

type myListener struct {
    // 用户状态字段，跨调用持有（如连接、server 实例）

    // 生命周期方法（函数字段，在 New 中赋值）
    Run   func(context.Context) error
    Close func() error
    Read  func(context.Context) ([]byte, error)
    Write func([]byte) error  // 可选
}

// New 工厂函数：框架调用此函数创建监听器对象实例
func New() *myListener {
    s := &myListener{}

    // Run 启用：初始化资源（建连接/开端口等）。ctx 取消时必须返回。
    s.Run = func(ctx context.Context) error {
        // 示例：在此开启你的服务，数据通过 Read 读取
        <-ctx.Done()
        return nil
    }

    // Close 禁用：释放资源。Run 后调用。
    s.Close = func() error { return nil }

    // Read 入站：阻塞读取一条数据。ctx 取消时返回 (nil, ctx.Err())。
    s.Read = func(ctx context.Context) ([]byte, error) {
        select {
        case <-ctx.Done():
            return nil, ctx.Err()
        case <-time.After(time.Second):
        }
        return []byte("hello"), nil
    }

    // Write 出站：写入数据到连接。可选，不实现则忽略出站。
    s.Write = func(p []byte) error { return nil }

    return s
}
```

`script_conn` 的 `content` 字段 tooltip 注明"定义 New + Run/Close/Read/Write 函数字段的对象"。

## 7. 测试策略

`internal/listen/listen_script_test.go`：

1. 完整对象脚本 → Start/Read/Write/Close 全流程，验证 reflect 调用正确
2. 缺少 New 函数 → Start 返回明确错误
3. 缺少 Read 方法 → Start 或 ReadMessage 返回错误
4. Write 方法缺失 → Write 静默丢弃，不报错
5. Read panic → recover，不崩溃
6. 旧脚本（顶级 Run/OnMessage）→ Start 报 "必须定义 New 函数"

## 8. 不在本次范围

- `pre_script` 仍保持顶级 `Process` 函数（所有 listener 共用，无状态，不需要对象化）
- 内置监听器（http/tcp/mqtt/serial/udp）不改动
- 其他 listener 类型的对象化（如未来支持用户自定义 http listener）留待后续
