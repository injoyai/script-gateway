# 订阅繁忙度指标设计

- 日期：2026-06-25
- 状态：已确认，待生成实施计划
- 范围：在所有订阅点引入带身份的队列，实现节点级繁忙度指标，用于定位数据流转瓶颈

## 1. 背景与目标

### 1.1 现状

`internal/queue/queue.go` 中 `Queue` 为每个订阅者分配带缓冲的 Go channel，但订阅者是**匿名的**：

- 没有 ID、没有归属标签、没有独立的统计
- `Publish` 在订阅者 channel 满时**静默丢弃**消息（`select { case ch <- msg: default: }`），没有任何计数
- `TopicsWithDepth` 只按 topic 聚合深度，**无法定位到是哪个订阅者**在堆积

代码中存在 6 处订阅点：viewer 流、listener 出站（3 处变体）、dispatcher、processor chain。当数据流转出现瓶颈时，当前系统无法回答"瓶颈在哪个节点"。

### 1.2 目标

让每个订阅点携带身份与队列统计，前端通过节点徽章直观显示繁忙度，**一眼定位瓶颈节点**。

### 1.3 非目标

- 不替换整个 Queue、不引入新 broker
- 不改持久化模型（纯内存滚动统计）
- 不实现阻塞背压
- 不纳入 mocker 发布计数（生产者，不是瓶颈信号）

## 2. 核心决策（来自 brainstorming）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 繁忙度定义 | 队列堆积 + 丢包 | 直接反映消费不动 |
| 队列满行为 | 继续丢弃 + 计数 | 不改变现有行为最安全，丢包本身就是瓶颈信号 |
| 展示位置 | 节点徽章 | 一眼可见，前端工作量可控 |
| 实现方式 | 方案 A：引入 Subscriber + 订阅注册表 | 能精确计数丢包、按订阅者归因 |

## 3. 架构概述

在 `internal/queue` 引入带身份的订阅者 `Subscriber`，每个订阅点注册时携带 `OwnerType + OwnerID + Name`。`Queue.Publish` 改为遍历注册表逐个投递，命中 `default`（队列满）时增加丢包计数而非静默丢弃。`Queue` 暴露 `Subscribers() []*Subscriber` 供 API 查询。前端按 `OwnerType+OwnerID` 把订阅统计映射到对应节点，画繁忙度徽章。

## 4. 后端核心组件

### 4.1 Subscriber 结构

新增文件 `internal/queue/subscriber.go`：

```go
type Subscriber struct {
    ID        string        // 唯一 ID
    Name      string        // 人类可读名，如 "listener-tcp-1"
    OwnerType string        // "listener" | "chain" | "dispatcher" | "viewer"
    OwnerID   int64         // 业务实体 ID
    Topics    []string      // 订阅 topic 列表
    Cap       int           // channel 缓冲容量
    ch        chan *types.Message

    enqueued   atomic.Int64
    dequeued   atomic.Int64
    dropped    atomic.Int64
    lastDropAt atomic.Int64  // unix nano，0=从未丢

    // 滑动窗口桶（10 × 1s），用于计算速率
    buckets    [10]windowBucket
    bucketIdx  atomic.Int64  // 当前桶序号（模 10）
    createdAt  time.Time
}

type windowBucket struct {
    enqueued int64
    dequeued int64
    mu       sync.Mutex
}
```

### 4.2 Queue 改造

`queue.go` 中 `Queue` 新增字段：

```go
type Queue struct {
    mu        sync.RWMutex
    channels  map[string][]chan *types.Message         // 保留旧字段，标记 deprecated
    snapshots map[string]*ringBuffer
    buffer    int
    snapSize  int

    subscribers  map[string]*Subscriber                  // id -> sub
    topicSubs    map[string]map[string]*Subscriber       // topic -> subID -> sub
}
```

新增命名订阅 API：

```go
// 新增命名订阅 API（迁移目标）
func (q *Queue) SubscribeNamed(topics []string, opts SubOpts) (*Subscriber, <-chan *types.Message)
func (q *Queue) UnsubscribeSub(sub *Subscriber)
func (q *Queue) Subscribers() []*Subscriber  // 快照拷贝
```

`Publish` 改造：遍历 `topicSubs[topic]`，每个 sub 投递时 `enqueued++`，命中 `default` 时 `dropped++`、`lastDropAt=now`，**不移除注册**（保持后续可投递）。旧 `channels` 路径保留兼容，所有迁移后的调用点不再使用。

旧 `Subscribe` / `Unsubscribe` 标记 deprecated，内部转调新 API（用空 OwnerType="legacy"）。

### 4.3 消费 helper

为迁移点提供 `Consume` helper，确保 `dequeued++` 并写入当前桶：

```go
func Consume(ch <-chan *types.Message, sub *Subscriber, handler func(*types.Message)) {
    for msg := range ch {
        sub.recordDequeued()
        handler(msg)
    }
}
```

### 4.4 速率桶维护

`Queue` 启动时 `go q.tickBuckets()`，每秒 `bucketIdx++`（模 10）。新桶清零。`Stats()` 读取最近 10 桶求和。统一 goroutine 维护，避免每个 sub 一个 goroutine。

## 5. 繁忙度公式

单个订阅者（10s 滑动窗口）：

```
fillRate   = len(ch) / cap                          // 0~1，瞬时堆积
dropInWin  = dropped_now - dropped_10s_前
enqueueWin = sum(buckets.enqueued)
dropRate   = dropInWin / (enqueueWin + 1)           // 0~1，丢包率
inRate     = sum(buckets.enqueued) / 10            // 条/秒
outRate    = sum(buckets.dequeued)  / 10
busyness   = clamp(fillRate*0.6 + dropRate*0.4, 0, 1) × 100
```

- 堆积权重 0.6（直接反映瓶颈）
- 丢包权重 0.4（已经发生丢失，是强信号）
- `inRate - outRate` 不进 busyness 分数，作为辅助信号在 tooltip 展示（避免和 fillRate 重复计权）

## 6. 订阅点迁移

| 位置 | 文件:行 | OwnerType | OwnerID | Name |
|------|---------|-----------|---------|------|
| listener 出站 | manager.go:453 | listener | cfg.ID | cfg.Name |
| mqtt parent 出站 | manager.go:539 | listener | mc.ID | mc.Name |
| 另一处出站 | manager.go:583 | listener | mc.ID | mc.Name |
| dispatcher | manager.go:682 | dispatcher | cfg.ID | cfg.Name |
| processor chain | manager.go:828 | chain | cfg.ID | cfg.Name |
| viewer WebSocket | viewer.go:134 | viewer | viewer.ID | viewer.Name + "#" + session短id |

迁移后 `for msg := range ch` 改为封装读取，确保 `dequeued++`：通过 `Consume(ch, sub, handler)` helper 实现。

## 7. API 接口

新增 `app/api/metrics.go`：

```
GET /api/metrics/busyness
  → [{ id, name, owner_type, owner_id, topics,
       depth, cap,
       enqueued_total, dequeued_total, dropped_total,
       last_drop_at,
       in_rate, out_rate,
       busyness }]

GET /api/metrics/busyness?owner_type=listener&owner_id=1
  → 单条或空
```

路由注册到 `app/route/`，复用现有鉴权中间件。

## 8. 前端节点徽章

### 8.1 数据流

`DataFlowCanvas` 每 2s 轮询 `/api/metrics/busyness`，按 `ownerType:ownerID` **聚合**（一个 owner 可能对应多个订阅者，如 listener 出站 + mqtt parent 出站，需取 max(busyness) 并累加 dropped/depth）建立 `Map<"ownerType:ownerID", Stats>`。所有节点通过 data 注入对应 stats（mocker 不在映射表里 → 不显示徽章）。

聚合规则：
- `busyness` = max(各订阅者 busyness)  // 取最忙的一个
- `depth` / `dropped` / `enqueued` / `dequeued` = sum
- `in_rate` / `out_rate` = sum
- `last_drop_at` = max

### 8.2 徽章组件

新增 `web/src/pages/data-flow/BusynessBadge.tsx`：

- 位置：节点卡片右上角绝对定位
- 内容：色块圆点 + 百分比数字（如 `● 42%`）
- 颜色阈值：
  - 0–60% 绿 `#52c41a`
  - 60–85% 黄 `#faad14`
  - 85–100% 红 `#ff4d4f`
- 鼠标悬停 Tooltip：
  - `depth / cap`
  - `入队 enqueued / 出队 dequeued / 丢弃 dropped`
  - `in: X/s  out: Y/s`
  - 若 `dropped > 0`：红色高亮 "已丢弃 N 条"

### 8.3 mocker 节点

不画徽章。本期不纳入 mocker 发布计数（留空位，后续可扩展）。

## 9. 并发与错误处理

- `Publish` 持读锁遍历 `topicSubs[topic]` 的快照；计数器全用 atomic，`Stats()` 不持锁
- `Unsubscribe`：从两张表移除，close(ch)，消费方 `for range` 自然退出
- 桶 goroutine：`Queue` 启动时 `go q.tickBuckets()`，每秒 `bucketIdx++`（模 10）
- 无 DB 写入；进程重启清零（符合"找瓶颈"瞬时性需求）

## 10. 测试策略

- `queue_test.go`：单订阅者 Publish→Consume 计数正确；channel 满时 dropped++；Unsubscribe 后不再投递
- 并发测试：100 goroutine 同时 Publish，计数器无 race（`go test -race`）
- 速率窗口测试：1s 内入 100 条，`in_rate` ≈ 10/s（10s 窗口）
- 集成：启动 mocker + viewer，trigger 后 busyness API 返回非零 depth

## 11. 文件清单

新增：
- `internal/queue/subscriber.go`
- `app/api/metrics.go`
- `web/src/pages/data-flow/BusynessBadge.tsx`

修改：
- `internal/queue/queue.go`（Queue 改造、Publish 改造、新增 SubscribeNamed/UnsubscribeSub/Subscribers、tickBuckets）
- `internal/pipeline/manager.go`（6 处订阅点迁移、消费 helper 调用）
- `app/api/viewer.go`（viewer.go:134 迁移）
- `app/route/`（注册 metrics 路由）
- `web/src/pages/data-flow/DataFlowCanvas.tsx`（轮询 + 注入 stats）
- `web/src/pages/data-flow/FlowNodes.tsx`（4 类节点挂载 BusynessBadge）
- `web/src/services/dataFlowApi.ts`（新增 fetchBusyness）
