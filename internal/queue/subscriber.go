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

	ch       chan *types.Message
	enqueued atomic.Int64
	dequeued atomic.Int64
	dropped  atomic.Int64
	lastDrop atomic.Int64 // unix nano，0=从未丢

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

// RecordDequeue 消费成功时调用
func (s *Subscriber) RecordDequeue() {
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
	b.dropped = 0
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
func Consume(ch <-chan *types.Message, sub *Subscriber, handler func(*types.Message)) {
	for msg := range ch {
		sub.RecordDequeue()
		handler(msg)
	}
}
