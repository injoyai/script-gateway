# 订阅繁忙度指标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个订阅点引入带身份与队列统计的 `Subscriber`，前端节点画繁忙度徽章，用于定位数据流转瓶颈。

**Architecture:** 在 `internal/queue` 新增 `Subscriber` 结构与订阅注册表，`Queue.Publish` 改为遍历注册表逐个投递并计数丢包。新增 `/api/metrics/busyness` 接口暴露所有订阅者统计。前端每 2s 轮询，按 `ownerType:ownerID` 聚合后映射到节点徽章。

**Tech Stack:** Go (xorm/fiber)、React + TypeScript + React Flow + Ant Design

---

## 文件结构

**新增：**
- `internal/queue/subscriber.go` — `Subscriber` 结构、`SubOpts`、`Consume` helper、`Stats()`、`Busyness()`、滑动窗口桶
- `internal/queue/queue_test.go` — 单元测试（计数、并发、速率窗口）
- `app/api/metrics.go` — `/api/metrics/busyness` 接口
- `web/src/pages/data-flow/BusynessBadge.tsx` — 节点徽章组件
- `web/src/services/busynessApi.ts` — 前端 API 调用

**修改：**
- `internal/queue/queue.go` — `Queue` 新增 `subscribers`/`topicSubs` 字段、`SubscribeNamed`/`UnsubscribeSub`/`Subscribers`、`Publish` 改造、`tickBuckets` goroutine
- `internal/pipeline/manager.go` — 6 处订阅点迁移到 `SubscribeNamed`，消费端改用 `queue.Consume`
- `app/api/viewer.go` — viewer.go WebSocket 订阅点迁移
- `app/route/route.go` — 注册 `/metrics` 路由组
- `web/src/pages/data-flow/FlowNodes.tsx` — 4 类节点挂载 `BusynessBadge`、扩展 `FlowNodeData`
- `web/src/pages/data-flow/DataFlowCanvas.tsx` — 轮询 busyness、聚合、注入 stats

---

## Task 1: Subscriber 结构与统计方法

**Files:**
- Create: `internal/queue/subscriber.go`

- [ ] **Step 1: 创建 subscriber.go 文件**

```go
package queue

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

// 滑动窗口桶数（10 × 1s = 10s 窗口）
const windowBuckets = 10

// windowBucket 1 秒内的入队/出队/丢包计数
type windowBucket struct {
	enqueued int64
	dequeued int64
	dropped  int64
	mu       sync.Mutex
}

// Subscriber 带身份的订阅者，记录投递/消费/丢包计数与滑动窗口速率
type Subscriber struct {
	ID        string
	Name      string
	OwnerType string // "listener" | "chain" | "dispatcher" | "viewer"
	OwnerID   int64
	Topics    []string
	Cap       int
	Ch        <-chan *types.Message

	ch        chan *types.Message
	enqueued  atomic.Int64
	dequeued  atomic.Int64
	dropped   atomic.Int64
	lastDrop  atomic.Int64 // unix nano，0=从未丢

	buckets   [windowBuckets]windowBucket
	bucketIdx atomic.Int64 // 当前桶序号（模 windowBuckets）

	CreatedAt time.Time
}

// SubOpts 订阅选项
type SubOpts struct {
	Name      string
	OwnerType string
	OwnerID   int64
	Buffer    int // <=0 用 Queue 默认值
}

// recordEnqueue 投递成功时调用
func (s *Subscriber) recordEnqueue() {
	s.enqueued.Add(1)
	idx := int(s.bucketIdx.Load() % windowBuckets)
	b := &s.buckets[idx]
	b.mu.Lock()
	b.enqueued++
	b.mu.Unlock()
}

// recordDequeue 消费成功时调用
func (s *Subscriber) recordDequeue() {
	s.dequeued.Add(1)
	idx := int(s.bucketIdx.Load() % windowBuckets)
	b := &s.buckets[idx]
	b.mu.Lock()
	b.dequeued++
	b.mu.Unlock()
}

// recordDrop 投递失败（队列满）时调用
func (s *Subscriber) recordDrop() {
	s.dropped.Add(1)
	s.lastDrop.Store(time.Now().UnixNano())
	idx := int(s.bucketIdx.Load() % windowBuckets)
	b := &s.buckets[idx]
	b.mu.Lock()
	b.dropped++
	b.mu.Unlock()
}

// advanceBucket 每秒由 Queue.tickBuckets 调用推进桶
func (s *Subscriber) advanceBucket(newIdx int64) {
	idx := int(newIdx % windowBuckets)
	b := &s.buckets[idx]
	b.mu.Lock()
	b.enqueued = 0
	b.dequeued = 0
	b.mu.Unlock()
	s.bucketIdx.Store(newIdx)
}

// windowRates 返回最近 10s 窗口的入/出/丢包计数
func (s *Subscriber) windowRates() (enq int64, deq int64, drop int64) {
	cur := s.bucketIdx.Load()
	for i := 0; i < windowBuckets; i++ {
		if cur < int64(i) {
			continue // 窗口未填满，跳过早于启动的桶
		}
		idx := int((cur - int64(i) + windowBuckets) % windowBuckets)
		b := &s.buckets[idx]
		b.mu.Lock()
		enq += b.enqueued
		deq += b.dequeued
		drop += b.dropped
		b.mu.Unlock()
	}
	return
}

// Stats 返回当前订阅者的统计快照（线程安全）
type Stats struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	OwnerType     string   `json:"owner_type"`
	OwnerID       int64    `json:"owner_id"`
	Topics        []string `json:"topics"`
	Depth         int      `json:"depth"`
	Cap           int      `json:"cap"`
	EnqueuedTotal int64    `json:"enqueued_total"`
	DequeuedTotal int64    `json:"dequeued_total"`
	DroppedTotal  int64    `json:"dropped_total"`
	LastDropAt    int64    `json:"last_drop_at"` // unix nano，0=从未丢
	InRate        float64  `json:"in_rate"`      // 条/秒（10s 平均）
	OutRate       float64  `json:"out_rate"`     // 条/秒
	Busyness      float64  `json:"busyness"`     // 0~100
}

// Stats 返回统计快照
func (s *Subscriber) Stats() Stats {
	enqTotal := s.enqueued.Load()
	deqTotal := s.dequeued.Load()
	dropTotal := s.dropped.Load()
	lastDrop := s.lastDrop.Load()

	depth := len(s.ch)
	cap := s.Cap
	if cap <= 0 {
		cap = cap // 保留 0，避免除零在 Busyness 里处理
	}

	enqWin, deqWin, dropWin := s.windowRates()
	inRate := float64(enqWin) / float64(windowBuckets)
	outRate := float64(deqWin) / float64(windowBuckets)

	// 繁忙度公式：fillRate*0.6 + dropRate*0.4
	// dropRate 用窗口内丢包 / 窗口内入队（更精确反映近期瓶颈）
	busyness := 0.0
	if cap > 0 {
		fillRate := float64(depth) / float64(cap)
		var dropRate float64
		if enqWin > 0 {
			dropRate = float64(dropWin) / float64(enqWin)
		}
		busyness = fillRate*0.6 + dropRate*0.4
		if busyness > 1 {
			busyness = 1
		}
	}
	busyness *= 100

	topics := make([]string, len(s.Topics))
	copy(topics, s.Topics)

	return Stats{
		ID:            s.ID,
		Name:          s.Name,
		OwnerType:     s.OwnerType,
		OwnerID:       s.OwnerID,
		Topics:        topics,
		Depth:         depth,
		Cap:           cap,
		EnqueuedTotal: enqTotal,
		DequeuedTotal: deqTotal,
		DroppedTotal:  dropTotal,
		LastDropAt:    lastDrop,
		InRate:        inRate,
		OutRate:       outRate,
		Busyness:      busyness,
	}
}

// Consume 消费 helper：从订阅 channel 读取消息并累加 dequeued，调用 handler
// handler 返回 false 时停止消费（已迁移调用点均不使用此停止语义，保持 range 语义）
func Consume(ch <-chan *types.Message, sub *Subscriber, handler func(*types.Message)) {
	for msg := range ch {
		sub.recordDequeue()
		handler(msg)
	}
}
```

- [ ] **Step 2: 编译验证**

Run: `go build ./internal/queue/`
Expected: 成功，无错误

- [ ] **Step 3: Commit**

```bash
git add internal/queue/subscriber.go
git commit -F - <<'EOF'
feat(queue): 新增 Subscriber 结构与统计方法

带身份的订阅者，记录投递/消费/丢包计数与滑动窗口速率。
EOF
```

---

## Task 2: Queue 改造与 Publish 计数

**Files:**
- Modify: `internal/queue/queue.go`

- [ ] **Step 1: 在 Queue 结构新增字段**

在 `queue.go` 第 54-59 行的 `type Queue struct` 中新增 `subscribers` 和 `topicSubs` 字段：

```go
type Queue struct {
	mu        sync.RWMutex
	channels  map[string][]chan *types.Message
	snapshots map[string]*ringBuffer
	buffer    int
	snapSize  int

	subscribers map[string]*Subscriber            // id -> sub
	topicSubs   map[string]map[string]*Subscriber // topic -> subID -> sub
	stopTick    chan struct{}
}
```

- [ ] **Step 2: 修改 New() 初始化新字段并启动 tickBuckets**

替换 `New` 函数：

```go
func New(buffer int) *Queue {
	if buffer <= 0 {
		buffer = 1000
	}
	q := &Queue{
		channels:    make(map[string][]chan *types.Message),
		snapshots:   make(map[string]*ringBuffer),
		buffer:      buffer,
		snapSize:    100,
		subscribers: make(map[string]*Subscriber),
		topicSubs:   make(map[string]map[string]*Subscriber),
		stopTick:    make(chan struct{}),
	}
	go q.tickBuckets()
	return q
}
```

- [ ] **Step 3: 在文件末尾新增 tickBuckets、SubscribeNamed、UnsubscribeSub、Subscribers**

```go
// tickBuckets 每秒推进所有订阅者的滑动窗口桶
func (q *Queue) tickBuckets() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	var idx int64
	for {
		select {
		case <-q.stopTick:
			return
		case <-ticker.C:
			idx++
			q.mu.RLock()
			subs := make([]*Subscriber, 0, len(q.subscribers))
			for _, s := range q.subscribers {
				subs = append(subs, s)
			}
			q.mu.RUnlock()
			for _, s := range subs {
				s.advanceBucket(idx)
			}
		}
	}
}

// SubscribeNamed 带身份的订阅
func (q *Queue) SubscribeNamed(topics []string, opts SubOpts) (*Subscriber, <-chan *types.Message) {
	q.mu.Lock()
	defer q.mu.Unlock()

	buf := opts.Buffer
	if buf <= 0 {
		buf = q.buffer
	}
	ch := make(chan *types.Message, buf)
	id := opts.Name + "-" + strconv.FormatInt(time.Now().UnixNano(), 36) + "-" + strconv.Itoa(int(randUint32()))
	sub := &Subscriber{
		ID:        id,
		Name:      opts.Name,
		OwnerType: opts.OwnerType,
		OwnerID:   opts.OwnerID,
		Topics:    append([]string(nil), topics...),
		Cap:       buf,
		Ch:        ch,
		ch:        ch,
		CreatedAt: time.Now(),
	}
	q.subscribers[id] = sub
	for _, t := range topics {
		if q.topicSubs[t] == nil {
			q.topicSubs[t] = make(map[string]*Subscriber)
		}
		q.topicSubs[t][id] = sub
		// 确保快照缓冲区存在
		if _, ok := q.snapshots[t]; !ok {
			q.snapshots[t] = newRingBuffer(q.snapSize)
		}
	}
	return sub, ch
}

// UnsubscribeSub 移除订阅者
func (q *Queue) UnsubscribeSub(sub *Subscriber) {
	q.mu.Lock()
	defer q.mu.Unlock()
	delete(q.subscribers, sub.ID)
	for _, t := range sub.Topics {
		if subs, ok := q.topicSubs[t]; ok {
			delete(subs, sub.ID)
			if len(subs) == 0 {
				delete(q.topicSubs, t)
			}
		}
	}
	close(sub.ch)
}

// Subscribers 返回所有订阅者的快照拷贝
func (q *Queue) Subscribers() []Stats {
	q.mu.RLock()
	defer q.mu.RUnlock()
	out := make([]Stats, 0, len(q.subscribers))
	for _, s := range q.subscribers {
		out = append(out, s.Stats())
	}
	return out
}

// randUint32 生成简单随机数（避免引入 math/rand 全局锁）
func randUint32() uint32 {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return uint32(time.Now().UnixNano())
	}
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}
```

- [ ] **Step 4: 修改 Publish 改用 topicSubs 并计数**

替换 `Publish` 函数：

```go
// Publish 发布消息到对应 topic
func (q *Queue) Publish(msg *types.Message) {
	q.mu.Lock()
	topic := msg.Topic

	// 确保快照缓冲区存在
	if _, ok := q.snapshots[topic]; !ok {
		q.snapshots[topic] = newRingBuffer(q.snapSize)
	}
	q.snapshots[topic].Push(msg)

	subs := make([]*Subscriber, 0, len(q.topicSubs[topic]))
	for _, s := range q.topicSubs[topic] {
		subs = append(subs, s)
	}
	q.mu.Unlock()

	for _, s := range subs {
		select {
		case s.ch <- msg:
			s.recordEnqueue()
		default:
			s.recordDrop()
		}
	}
}
```

- [ ] **Step 5: 修改 import 添加 crypto/rand、strconv、time**

在 `queue.go` 顶部 import 块加入：

```go
import (
	"crypto/rand"
	"strconv"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)
```

- [ ] **Step 6: 旧 Subscribe/Unsubscribe 转调新 API（标记 deprecated）**

替换旧的 `Subscribe` 和 `SubscribeWithBuffer`：

```go
// Subscribe deprecated: 请使用 SubscribeNamed
func (q *Queue) Subscribe(topics []string) <-chan *types.Message {
	sub, ch := q.SubscribeNamed(topics, SubOpts{OwnerType: "legacy"})
	return ch
}

// SubscribeWithBuffer deprecated: 请使用 SubscribeNamed
func (q *Queue) SubscribeWithBuffer(topics []string, buffer int) <-chan *types.Message {
	sub, ch := q.SubscribeNamed(topics, SubOpts{OwnerType: "legacy", Buffer: buffer})
	_ = sub // 防止编译器告警
	return ch
}
```

替换旧 `Unsubscribe`：

```go
// Unsubscribe deprecated: 请使用 UnsubscribeSub
// 旧 API 无法精确反查 Subscriber，保留原有 channels 路径（仅用于 legacy）
func (q *Queue) Unsubscribe(topics []string, ch <-chan *types.Message) {
	// 旧调用方不持有 *Subscriber，无法精确移除
	// 由于迁移后所有调用点都用 UnsubscribeSub，此处为空实现（保留签名兼容）
	_ = topics
	_ = ch
}
```

- [ ] **Step 7: 编译验证**

Run: `go build ./internal/queue/`
Expected: 成功

- [ ] **Step 8: Commit**

```bash
git add internal/queue/queue.go
git commit -F - <<'EOF'
feat(queue): Queue 集成 Subscriber 注册表与 Publish 计数

新增 subscribers/topicSubs 注册表、tickBuckets goroutine、SubscribeNamed。
Publish 改为遍历注册表逐个投递，队列满时 dropped++ 而非静默丢弃。
EOF
```

---

## Task 3: Queue 单元测试

**Files:**
- Create: `internal/queue/queue_test.go`

- [ ] **Step 1: 创建测试文件**

```go
package queue

import (
	"sync"
	"testing"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

func TestSubscribeNamed_PublishConsume(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, ch := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "listener", OwnerID: 1, Buffer: 10,
	})

	q.Publish(types.NewMessage([]byte("a"), "t1"))

	select {
	case msg := <-ch:
		if string(msg.Payload) != "a" {
			t.Fatalf("payload = %s, want a", msg.Payload)
		}
		sub.recordDequeue()
	case <-time.After(time.Second):
		t.Fatal("recv timeout")
	}

	st := sub.Stats()
	if st.EnqueuedTotal != 1 {
		t.Errorf("enqueued = %d, want 1", st.EnqueuedTotal)
	}
	if st.DequeuedTotal != 1 {
		t.Errorf("dequeued = %d, want 1", st.DequeuedTotal)
	}
}

func TestPublish_DroppedCounter(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "viewer", OwnerID: 1, Buffer: 1,
	})

	// 投递 5 条，只消费 1 条，其余 4 条命中 buffer=1 的 default
	q.Publish(types.NewMessage([]byte("1"), "t1"))
	q.Publish(types.NewMessage([]byte("2"), "t1"))
	q.Publish(types.NewMessage([]byte("3"), "t1"))
	q.Publish(types.NewMessage([]byte("4"), "t1"))
	q.Publish(types.NewMessage([]byte("5"), "t1"))

	st := sub.Stats()
	// enqueued=1（第一条），dropped=4
	if st.EnqueuedTotal != 1 {
		t.Errorf("enqueued = %d, want 1", st.EnqueuedTotal)
	}
	if st.DroppedTotal != 4 {
		t.Errorf("dropped = %d, want 4", st.DroppedTotal)
	}
	if st.LastDropAt == 0 {
		t.Error("lastDropAt should be set")
	}
	_ = sub
}

func TestUnsubscribeSub_StopsDelivery(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "listener", OwnerID: 1, Buffer: 10,
	})
	q.UnsubscribeSub(sub)

	q.Publish(types.NewMessage([]byte("a"), "t1"))

	st := sub.Stats()
	if st.EnqueuedTotal != 0 {
		t.Errorf("after unsubscribe enqueued = %d, want 0", st.EnqueuedTotal)
	}
}

func TestPublish_ConcurrentNoRace(t *testing.T) {
	q := New(1000)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "chain", OwnerID: 1, Buffer: 1000,
	})

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				q.Publish(types.NewMessage([]byte("x"), "t1"))
			}
		}(i)
	}
	wg.Wait()

	st := sub.Stats()
	if st.EnqueuedTotal+st.DroppedTotal != 10000 {
		t.Errorf("enqueued+dropped = %d, want 10000", st.EnqueuedTotal+st.DroppedTotal)
	}
}

func TestSubscribers_ReturnsAll(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	q.SubscribeNamed([]string{"t1"}, SubOpts{Name: "a", OwnerType: "listener", OwnerID: 1, Buffer: 10})
	q.SubscribeNamed([]string{"t2"}, SubOpts{Name: "b", OwnerType: "viewer", OwnerID: 1, Buffer: 10})

	subs := q.Subscribers()
	if len(subs) != 2 {
		t.Fatalf("subs len = %d, want 2", len(subs))
	}
}
```

- [ ] **Step 2: 运行测试并验证通过**

Run: `go test -race ./internal/queue/`
Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add internal/queue/queue_test.go
git commit -F - <<'EOF'
test(queue): 新增 Subscriber 计数、并发、取消订阅测试

覆盖 Publish→Consume 计数、队列满丢包计数、并发无 race、取消订阅后不再投递。
EOF
```

---

## Task 4: 迁移 manager.go 6 处订阅点

**Files:**
- Modify: `internal/pipeline/manager.go:453,539,583,682,828`

- [ ] **Step 1: 迁移 listener 出站订阅（行 453）**

在 `manager.go` 中找到（约第 452-457 行）：

```go
	if cfg.OutTopic != "" {
		ch := m.queue.SubscribeWithBuffer([]string{cfg.OutTopic}, outboundBuffer)
		go m.writeToConn(cfg, ch, l, ctx)
	}
```

替换为：

```go
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
```

- [ ] **Step 2: 迁移 mqtt parent 出站订阅（行 539）**

找到（约第 538-541 行）：

```go
		if cfg.OutTopic != "" {
			outCh := m.queue.SubscribeWithBuffer([]string{cfg.OutTopic}, outboundBuffer)
			go func(client mqtt.Client, ch <-chan *types.Message, ctx context.Context) {
```

替换为：

```go
		if cfg.OutTopic != "" {
			outSub, outCh := m.queue.SubscribeNamed([]string{cfg.OutTopic}, queue.SubOpts{
				Name:      "listener#" + cfg.Name,
				OwnerType: "listener",
				OwnerID:   cfg.ID,
				Buffer:    outboundBuffer,
			})
			_ = outSub
			go func(client mqtt.Client, ch <-chan *types.Message, ctx context.Context) {
```

- [ ] **Step 3: 迁移另一处出站订阅（行 583）**

找到（约第 582-584 行）：

```go
		if cfg.OutTopic != "" {
			outCh := m.queue.SubscribeWithBuffer([]string{cfg.OutTopic}, outboundBuffer)
			go m.writeToConn(cfg, outCh, l, ctx)
		}
```

替换为：

```go
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
```

- [ ] **Step 4: 迁移 dispatcher 订阅（行 682）**

找到 `StartDispatcher`（约第 676-685 行）：

```go
	topics := d.Topics()
	if len(topics) > 0 {
		ch := m.queue.Subscribe(topics)
		go func(ch <-chan *types.Message, d push.Dispatcher) {
			for msg := range ch {
				if err := d.Push(msg); err != nil {
					logs.Err(fmt.Sprintf("Dispatcher push error: %v", err))
				}
			}
		}(ch, d)
	}
```

替换为：

```go
	topics := d.Topics()
	if len(topics) > 0 {
		sub, ch := m.queue.SubscribeNamed(topics, queue.SubOpts{
			Name:      "dispatcher#" + cfg.Name,
			OwnerType: "dispatcher",
			OwnerID:   cfg.ID,
			Buffer:     1000,
		})
		go func(sub *queue.Subscriber, ch <-chan *types.Message, d push.Dispatcher) {
			queue.Consume(ch, sub, func(msg *types.Message) {
				if err := d.Push(msg); err != nil {
					logs.Err(fmt.Sprintf("Dispatcher push error: %v", err))
				}
			})
		}(sub, ch, d)
	}
```

- [ ] **Step 5: 迁移 processor chain 订阅（行 828）**

找到 `StartPipeline`（约第 825-845 行）：

```go
	if cfg.Topic != "" {
		ch := m.queue.Subscribe([]string{cfg.Topic})
		go func(ch <-chan *types.Message, p *decode.Pipeline, q *queue.Queue, outTopic string) {
			for msg := range ch {
				result, err := p.Process(msg)
				if err != nil {
					logs.Err(fmt.Sprintf("Pipeline process error: %v", err))
					continue
				}
				if outTopic != "" && result.Topic == msg.Topic {
					result.Topic = outTopic
				}
				q.Publish(result)
			}
		}(ch, p, m.queue, cfg.OutTopic)
	}
```

替换为：

```go
	if cfg.Topic != "" {
		sub, ch := m.queue.SubscribeNamed([]string{cfg.Topic}, queue.SubOpts{
			Name:      "chain#" + cfg.Name,
			OwnerType: "chain",
			OwnerID:   cfg.ID,
			Buffer:    1000,
		})
		go func(sub *queue.Subscriber, ch <-chan *types.Message, p *decode.Pipeline, q *queue.Queue, outTopic string) {
			queue.Consume(ch, sub, func(msg *types.Message) {
				result, err := p.Process(msg)
				if err != nil {
					logs.Err(fmt.Sprintf("Pipeline process error: %v", err))
					return
				}
				if outTopic != "" && result.Topic == msg.Topic {
					result.Topic = outTopic
				}
				q.Publish(result)
			})
		}(sub, ch, p, m.queue, cfg.OutTopic)
	}
```

- [ ] **Step 6: 编译验证**

Run: `go build ./...`
Expected: 成功

- [ ] **Step 7: Commit**

```bash
git add internal/pipeline/manager.go
git commit -F - <<'EOF'
feat(pipeline): 迁移 5 处订阅点到 SubscribeNamed

listener 出站（3 处）、dispatcher、processor chain 改为带身份订阅，
dispatcher 和 chain 的消费改用 queue.Consume 确保 dequeued 计数。
EOF
```

---

## Task 5: 迁移 viewer.go WebSocket 订阅点

**Files:**
- Modify: `app/api/viewer.go:134`

- [ ] **Step 1: 修改 viewer.go 的 Stream 方法**

找到（约第 133-145 行）：

```go
		// 订阅消息队列
		ch := pipeline.Default.Queue().SubscribeWithBuffer(topics, 64)
		defer pipeline.Default.Queue().Unsubscribe(topics, ch)

		// 发送连接成功消息
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"connected","topics":`+encodeTopics(topics)+`}`))

		for msg := range ch {
			payload, err := json.Marshal(map[string]any{
				"type":      "message",
				"topic":     msg.Topic,
				"data":      string(msg.Payload),
				"source":    msg.Metadata["source"],
				"timestamp": msg.Metadata["timestamp"],
				"id":        msg.ID,
			})
			if err != nil {
				continue
			}
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		}
```

替换为：

```go
		// 订阅消息队列（带身份，便于繁忙度归因）
		viewerID := c.GetInt64("id")
		viewerName := c.GetString("name")
		if viewerName == "" {
			viewerName = "viewer"
		}
		subName := viewerName + "#" + strconv.FormatInt(time.Now().UnixNano()%0x1000000, 36)
		sub, ch := pipeline.Default.Queue().SubscribeNamed(topics, queue.SubOpts{
			Name:      subName,
			OwnerType: "viewer",
			OwnerID:   viewerID,
			Buffer:    64,
		})
		defer pipeline.Default.Queue().UnsubscribeSub(sub)

		// 发送连接成功消息
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"connected","topics":`+encodeTopics(topics)+`}`))

		queue.Consume(ch, sub, func(msg *types.Message) {
			payload, err := json.Marshal(map[string]any{
				"type":      "message",
				"topic":     msg.Topic,
				"data":      string(msg.Payload),
				"source":    msg.Metadata["source"],
				"timestamp": msg.Metadata["timestamp"],
				"id":        msg.ID,
			})
			if err != nil {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		})
		_ = ch // Consume 内部已 range，ch 仅用于关闭
```

注意：`queue.Consume` 在 `ch` 关闭时自然退出。`UnsubscribeSub` defer 已 close ch。但 `Consume` 不支持提前 return，当 WriteMessage 失败时需要主动关闭 ch 退出。由于 `UnsubscribeSub` 在 defer 中 close，而 Consume 在 close 后退出，WriteMessage 失败只能让 handler return，下一轮 range 仍会读。改为：handler 失败时调用 `pipeline.Default.Queue().UnsubscribeSub(sub)` 让 ch 关闭：

精确替换为：

```go
		// 订阅消息队列（带身份，便于繁忙度归因）
		viewerID := c.GetInt64("id")
		viewerName := c.GetString("name")
		if viewerName == "" {
			viewerName = "viewer"
		}
		subName := viewerName + "#" + strconv.FormatInt(time.Now().UnixNano()%0x1000000, 36)
		sub, ch := pipeline.Default.Queue().SubscribeNamed(topics, queue.SubOpts{
			Name:      subName,
			OwnerType: "viewer",
			OwnerID:   viewerID,
			Buffer:    64,
		})
		unsubscribed := false
		unsub := func() {
			if !unsubscribed {
				unsubscribed = true
				pipeline.Default.Queue().UnsubscribeSub(sub)
			}
		}
		defer unsub()

		// 发送连接成功消息
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"connected","topics":`+encodeTopics(topics)+`}`))

		queue.Consume(ch, sub, func(msg *types.Message) {
			payload, err := json.Marshal(map[string]any{
				"type":      "message",
				"topic":     msg.Topic,
				"data":      string(msg.Payload),
				"source":    msg.Metadata["source"],
				"timestamp": msg.Metadata["timestamp"],
				"id":        msg.ID,
			})
			if err != nil {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				unsub() // 关闭 ch，使 Consume 退出
			}
		})
```

- [ ] **Step 2: 更新 viewer.go import**

在 viewer.go 顶部 import 块新增 `strconv`、`time`、`queue`、`types`：

```go
import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
	"github.com/injoyai/script-gateway/internal/queue"
	"github.com/injoyai/script-gateway/internal/types"
)
```

- [ ] **Step 3: 编译验证**

Run: `go build ./app/api/`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add app/api/viewer.go
git commit -F - <<'EOF'
feat(viewer): WebSocket 订阅点迁移到 SubscribeNamed

viewer 流改用带身份订阅，消费改用 queue.Consume，Write 失败时主动取消订阅。
EOF
```

---

## Task 6: 后端 metrics API

**Files:**
- Create: `app/api/metrics.go`
- Modify: `app/route/route.go:26`

- [ ] **Step 1: 创建 metrics.go**

```go
package api

import (
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/internal/pipeline"
)

// Metrics 繁忙度指标 API
type Metrics struct{}

// Busyness 返回所有订阅者的繁忙度统计
func (*Metrics) Busyness(c fbr.Ctx) {
	stats := pipeline.Default.Queue().Subscribers()

	// 可选过滤
	ownerType := c.GetString("owner_type")
	ownerID := c.GetInt64("owner_id")
	if ownerType != "" || ownerID != 0 {
		filtered := make([]queue.Stats, 0, len(stats))
		for _, s := range stats {
			if ownerType != "" && s.OwnerType != ownerType {
				continue
			}
			if ownerID != 0 && s.OwnerID != ownerID {
				continue
			}
			filtered = append(filtered, s)
		}
		stats = filtered
	}

	c.Succ(stats)
}
```

- [ ] **Step 2: 在 route.go 注册路由**

在 `app/route/route.go` 第 26 行（`/mocker` 之后）新增一行：

```go
		g.Group("/mocker", fbr.WithStruct(&api.Mocker{}))
		g.Group("/metrics", fbr.WithStruct(&api.Metrics{}))
		g.Group("/flow-layout", fbr.WithStruct(&api.FlowLayout{}))
```

- [ ] **Step 3: 编译验证**

Run: `go build ./...`
Expected: 成功

- [ ] **Step 4: 启动后端，手动验证 API**

Run: 启动后端进程，然后执行

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8200/api/metrics/busyness" -UseBasicParsing
```

Expected: 返回 `{"code":200,"data":[],"msg":"成功"}` 或包含订阅者列表

- [ ] **Step 5: Commit**

```bash
git add app/api/metrics.go app/route/route.go
git commit -F - <<'EOF'
feat(api): 新增 /api/metrics/busyness 接口

返回所有订阅者的统计快照，支持 owner_type/owner_id 过滤。
EOF
```

---

## Task 7: 前端 busynessApi 服务

**Files:**
- Create: `web/src/services/busynessApi.ts`

- [ ] **Step 1: 创建 busynessApi.ts**

```typescript
// 繁忙度指标 API 服务

export interface BusynessStats {
  id: string;
  name: string;
  owner_type: string;
  owner_id: number;
  topics: string[];
  depth: number;
  cap: number;
  enqueued_total: number;
  dequeued_total: number;
  dropped_total: number;
  last_drop_at: number; // unix nano，0=从未丢
  in_rate: number;       // 条/秒
  out_rate: number;      // 条/秒
  busyness: number;      // 0~100
}

// 按 owner 聚合后的统计（一个 owner 可能对应多个订阅者）
export interface AggregatedStats {
  ownerType: string;
  ownerId: number;
  busyness: number;        // max
  depth: number;           // sum
  cap: number;             // sum
  enqueuedTotal: number;   // sum
  dequeuedTotal: number;   // sum
  droppedTotal: number;    // sum
  lastDropAt: number;      // max
  inRate: number;          // sum
  outRate: number;         // sum
  subCount: number;
}

export const fetchBusyness = async (): Promise<BusynessStats[]> => {
  const res = await fetch('/api/metrics/busyness');
  const data = await res.json();
  return (data.data || []) as BusynessStats[];
};

// 按节点聚合订阅者统计
export const aggregateByOwner = (list: BusynessStats[]): Map<string, AggregatedStats> => {
  const map = new Map<string, AggregatedStats>();
  for (const s of list) {
    if (s.owner_type === 'legacy' || s.owner_type === '') continue;
    const key = `${s.owner_type}:${s.owner_id}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        ownerType: s.owner_type,
        ownerId: s.owner_id,
        busyness: 0,
        depth: 0,
        cap: 0,
        enqueuedTotal: 0,
        dequeuedTotal: 0,
        droppedTotal: 0,
        lastDropAt: 0,
        inRate: 0,
        outRate: 0,
        subCount: 0,
      };
      map.set(key, agg);
    }
    agg.busyness = Math.max(agg.busyness, s.busyness);
    agg.depth += s.depth;
    agg.cap += s.cap;
    agg.enqueuedTotal += s.enqueued_total;
    agg.dequeuedTotal += s.dequeued_total;
    agg.droppedTotal += s.dropped_total;
    agg.lastDropAt = Math.max(agg.lastDropAt, s.last_drop_at);
    agg.inRate += s.in_rate;
    agg.outRate += s.out_rate;
    agg.subCount += 1;
  }
  return map;
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/services/busynessApi.ts
git commit -F - <<'EOF'
feat(web): 新增 busynessApi 服务与按 owner 聚合逻辑

提供 fetchBusyness 调用 /api/metrics/busyness，aggregateByOwner 按节点聚合多订阅者。
EOF
```

---

## Task 8: 前端 BusynessBadge 组件

**Files:**
- Create: `web/src/pages/data-flow/BusynessBadge.tsx`

- [ ] **Step 1: 创建 BusynessBadge.tsx**

```tsx
import React from 'react';
import { Tooltip } from 'antd';

export interface BusynessBadgeData {
  busyness: number;
  depth: number;
  cap: number;
  enqueuedTotal: number;
  dequeuedTotal: number;
  droppedTotal: number;
  lastDropAt: number;
  inRate: number;
  outRate: number;
  subCount: number;
}

const colorFor = (b: number): string => {
  if (b >= 85) return '#ff4d4f';
  if (b >= 60) return '#faad14';
  return '#52c41a';
};

const formatDropTime = (nano: number): string => {
  if (nano === 0) return '从未';
  const ms = Math.floor(nano / 1e6);
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  return new Date(ms).toLocaleTimeString();
};

const BusynessBadge: React.FC<{ data?: BusynessBadgeData }> = ({ data }) => {
  if (!data) return null;
  if (data.cap === 0 && data.droppedTotal === 0 && data.enqueuedTotal === 0) return null;

  const color = colorFor(data.busyness);
  const tooltipContent = (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div>队列深度：{data.depth} / {data.cap}</div>
      <div>入队：{data.enqueuedTotal}，出队：{data.dequeuedTotal}</div>
      <div style={{ color: data.droppedTotal > 0 ? '#ffccc7' : 'inherit' }}>
        丢弃：{data.droppedTotal}（{formatDropTime(data.lastDropAt)}）
      </div>
      <div>速率：in {data.inRate.toFixed(1)}/s，out {data.outRate.toFixed(1)}/s</div>
      <div>订阅数：{data.subCount}</div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottom">
      <div
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          background: '#fff',
          border: `1.5px solid ${color}`,
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 600,
          color,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          zIndex: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
          }}
        />
        {Math.round(data.busyness)}%
        {data.droppedTotal > 0 && (
          <span style={{ color: '#ff4d4f', marginLeft: 2 }}>丢{data.droppedTotal}</span>
        )}
      </div>
    </Tooltip>
  );
};

export default BusynessBadge;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/data-flow/BusynessBadge.tsx
git commit -F - <<'EOF'
feat(web): 新增 BusynessBadge 节点徽章组件

显示繁忙度百分比与丢包数，颜色阈值 60/85%，悬停展示队列深度/速率/丢包时间。
EOF
```

---

## Task 9: FlowNodeData 扩展与节点挂载徽章

**Files:**
- Modify: `web/src/pages/data-flow/FlowNodes.tsx:34,102,201,297`

**说明：** `NodeCard`（第 102 行）是 `ChainNode`（第 303 行）和 `DispatcherNode`（第 316 行）共用的根卡片组件，只需在 `NodeCard` 内挂载徽章即可覆盖两者。`ListenerNode`（第 201 行）和 `ViewerNode`（第 297 行）使用各自独立结构，需单独挂载。`MockerNode` 不挂载（spec §8.3）。

- [ ] **Step 1: 扩展 FlowNodeData 接口**

在 `FlowNodes.tsx` 第 34 行的 `FlowNodeData` 接口的 `[key: string]: unknown;` 之前新增字段：

```tsx
  onView?: (id: number) => void; // 查看器：点击查看实时数据
  onTrigger?: (id: number) => void; // mocker：手动触发一次
  busyness?: BusynessBadgeData; // 繁忙度徽章数据
  [key: string]: unknown;
```

并在文件顶部 import 块加入：

```tsx
import BusynessBadge, { BusynessBadgeData } from './BusynessBadge';
```

- [ ] **Step 2: 在 NodeCard 根 div 挂载徽章（覆盖 chain + dispatcher）**

找到 `NodeCard` 组件（第 102 行）返回的根 `<div>`，在 `style` 中加 `position: 'relative'`，并在根 div 内首位（`{/* 头部 */}` 注释前）插入 `<BusynessBadge data={data.busyness} />`：

```tsx
  return (
    <div
      style={{
        position: 'relative',  // 新增
        background: '#fff',
        border: `2px solid ${accent}`,
        borderRadius: 10,
        width: 240,
        boxSizing: 'border-box',
        boxShadow: data.running
          ? `0 4px 12px ${accent}33`
          : '0 2px 6px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.3s, transform 0.15s',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <BusynessBadge data={data.busyness} />
      {/* 头部 */}
      <div style={{
```

- [ ] **Step 3: 为 ListenerNode 挂载徽章**

在 `ListenerNode` 组件（第 201 行）返回的根 `<div>`（`<Handle>` 之后那个 div）的 style 中加 `position: 'relative'`，并在该 div 内首位（现有内容之前）插入 `<BusynessBadge data={d.busyness} />`：

```tsx
  return (
    <>
      <Handle type="source" position={Position.Right} style={{ background: meta.color, width: 10, height: 10 }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : meta.color}`,
          // ...其余 style 不变
        }}
      >
        <BusynessBadge data={d.busyness} />
        {/* 原有头部、主体、底部内容 */}
```

- [ ] **Step 4: 为 ViewerNode 挂载徽章**

在 `ViewerNode` 组件（第 297 行）返回的根 `<div>`（`<Handle>` 之后那个 div）的 style 中加 `position: 'relative'`，并在该 div 内首位插入 `<BusynessBadge data={d.busyness} />`：

```tsx
  return (
    <>
      <Handle type="source" position={Position.Right} style={{ background: accent, width: 10, height: 10 }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : accent}`,
          // ...其余 style 不变
        }}
      >
        <BusynessBadge data={d.busyness} />
        {/* 原有头部、主体、底部内容 */}
```

- [ ] **Step 5: 编译验证**

Run: 在 web 目录执行 `npx tsc --noEmit`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/data-flow/FlowNodes.tsx
git commit -F - <<'EOF'
feat(web): 节点挂载 BusynessBadge 徽章

NodeCard（chain/dispatcher 共用）、ListenerNode、ViewerNode 挂载徽章。
扩展 FlowNodeData 增加 busyness 字段。
EOF
```

---

## Task 10: DataFlowCanvas 轮询与注入 stats

**Files:**
- Modify: `web/src/pages/data-flow/DataFlowCanvas.tsx`

- [ ] **Step 1: 在 DataFlowCanvas 顶部 import**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { fetchBusyness, aggregateByOwner, AggregatedStats } from '../../services/busynessApi';
```

- [ ] **Step 2: 新增 busyness 状态与轮询 effect**

在组件函数体顶部新增：

```tsx
const [busynessMap, setBusynessMap] = useState<Map<string, AggregatedStats>>(new Map());

useEffect(() => {
  let cancelled = false;
  const poll = async () => {
    try {
      const list = await fetchBusyness();
      if (!cancelled) {
        setBusynessMap(aggregateByOwner(list));
      }
    } catch {
      // 忽略
    }
  };
  poll();
  const timer = setInterval(poll, 2000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}, []);
```

- [ ] **Step 3: 在 buildGraph 中注入 busyness 数据**

在 `buildGraph` 函数中，每个节点 data 对象创建后，在 `push` 之前注入 busyness：

对于 listener 节点（独立监听器与父容器内子项都映射到 listener），在节点创建处加：

```tsx
const busynessKey = `listener:${conn.id}`;
const agg = busynessMap.get(busynessKey);
const busyness = agg ? {
  busyness: agg.busyness,
  depth: agg.depth,
  cap: agg.cap,
  enqueuedTotal: agg.enqueuedTotal,
  dequeuedTotal: agg.dequeuedTotal,
  droppedTotal: agg.droppedTotal,
  lastDropAt: agg.lastDropAt,
  inRate: agg.inRate,
  outRate: agg.outRate,
  subCount: agg.subCount,
} : undefined;
```

在节点 data 对象中添加 `busyness` 字段。同样的模式应用到 dispatcher、chain、viewer 节点（key 分别为 `dispatcher:${id}`、`chain:${id}`、`viewer:${id}`）。

注意：由于 `buildGraph` 可能在 `useCallback` 中以 `busynessMap` 为依赖，需要把 `busynessMap` 加入 deps，或改用 ref 避免 stale closure。建议用 ref：

```tsx
const busynessMapRef = useRef(busynessMap);
busynessMapRef.current = busynessMap;
```

在 `buildGraph` 内读取 `busynessMapRef.current`。

- [ ] **Step 4: 提取徽章数据注入为 helper**

在 `DataFlowCanvas.tsx` 顶部（组件外）新增 helper：

```tsx
const buildBusynessData = (
  map: Map<string, AggregatedStats>,
  ownerType: string,
  ownerId: number,
): BusynessBadgeData | undefined => {
  const agg = map.get(`${ownerType}:${ownerId}`);
  if (!agg) return undefined;
  return {
    busyness: agg.busyness,
    depth: agg.depth,
    cap: agg.cap,
    enqueuedTotal: agg.enqueuedTotal,
    dequeuedTotal: agg.dequeuedTotal,
    droppedTotal: agg.droppedTotal,
    lastDropAt: agg.lastDropAt,
    inRate: agg.inRate,
    outRate: agg.outRate,
    subCount: agg.subCount,
  };
};
```

import 中添加 `BusynessBadgeData`：

```tsx
import BusynessBadge, { BusynessBadgeData } from './BusynessBadge';
```

- [ ] **Step 5: 在每个节点 data 中调用 helper**

对每类节点，在 data 对象中加 `busyness: buildBusynessData(busynessMapRef.current, 'listener', conn.id)`（替换 ownerType/ownerId）。

- [ ] **Step 6: 编译验证**

Run: `cd web && npm run build` 或 `tsc --noEmit`
Expected: 成功

- [ ] **Step 7: 手动验证**

启动前后端，在浏览器打开数据流页面，触发 mocker，观察节点徽章显示繁忙度百分比与丢包数。

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/data-flow/DataFlowCanvas.tsx
git commit -F - <<'EOF'
feat(web): DataFlowCanvas 轮询 busyness 并注入节点 data

每 2s 轮询 /api/metrics/busyness，按 owner 聚合后注入对应节点，
通过 ref 避免重建 buildGraph 导致 stale closure。
EOF
```

---

## Task 11: 端到端集成验证

**Files:** 无新文件

- [ ] **Step 1: 启动后端**

Run: 在项目根目录执行 `go build -o script-gateway.exe . && .\script-gateway.exe`

- [ ] **Step 2: 启动前端**

Run: 在 web 目录执行 `npm start`

- [ ] **Step 3: 验证 API**

Run: `Invoke-WebRequest -Uri "http://127.0.0.1:8200/api/metrics/busyness" -UseBasicParsing`

Expected: 返回订阅者列表（至少包含已启用的 listener/chain/dispatcher）

- [ ] **Step 4: 触发 mocker 验证徽章**

在浏览器中：打开数据流页面 → 点击 mocker 节点的触发按钮 → 观察 viewer 节点徽章显示非零百分比

- [ ] **Step 5: 验证队列满丢包**

如果暂无天然瓶颈，可在前端确认徽章 tooltip 显示 `depth / cap`、`in/out 速率`，无报错。

- [ ] **Step 6: 验证完毕，无需 commit**

（本任务为验证步骤）

---

## 完成标准

- 后端：`go test -race ./internal/queue/` 全部通过
- 后端：`go build ./...` 无错误
- 前端：`tsc --noEmit` 无错误
- 端到端：触发 mocker 后，viewer 节点徽章显示非零繁忙度
- API：`/api/metrics/busyness` 返回带 owner_type/owner_id 的订阅者列表
