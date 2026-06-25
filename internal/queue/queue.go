package queue

import (
	"crypto/rand"
	"strconv"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

// TopicInfo topic 信息
type TopicInfo struct {
	Name        string `json:"name"`
	Depth       int    `json:"depth"`       // 队列深度（待消费消息数）
	Subscribers int    `json:"subscribers"` // 订阅者数量
}

// ringBuffer 环形缓冲区，保存最近 N 条消息快照
type ringBuffer struct {
	mu    sync.RWMutex
	buf   []*types.Message
	size  int
	head  int // 下一个写入位置
	count int // 已写入数量
}

func newRingBuffer(size int) *ringBuffer {
	if size <= 0 {
		size = 100
	}
	return &ringBuffer{
		buf:  make([]*types.Message, size),
		size: size,
	}
}

func (r *ringBuffer) Push(msg *types.Message) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf[r.head] = msg
	r.head = (r.head + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

func (r *ringBuffer) Recent(n int) []*types.Message {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if n <= 0 || n > r.count {
		n = r.count
	}
	result := make([]*types.Message, 0, n)
	// 从最旧的消息开始读取
	start := (r.head - n + r.size) % r.size
	for i := 0; i < n; i++ {
		idx := (start + i) % r.size
		if r.buf[idx] != nil {
			result = append(result, r.buf[idx])
		}
	}
	return result
}

// Queue 是基于 topic 的消息队列
type Queue struct {
	mu        sync.RWMutex
	snapshots map[string]*ringBuffer // topic -> 最近消息快照
	buffer    int                    // channel buffer size
	snapSize  int                    // 每个topic快照保留的消息数

	subscribers map[string]*Subscriber            // id -> sub
	topicSubs   map[string]map[string]*Subscriber // topic -> subID -> sub
	stopTick    chan struct{}
}

// New 创建新队列
func New(buffer int) *Queue {
	if buffer <= 0 {
		buffer = 1000
	}
	q := &Queue{
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

// Subscribe deprecated: 请使用 SubscribeNamed
func (q *Queue) Subscribe(topics []string) <-chan *types.Message {
	_, ch := q.SubscribeNamed(topics, SubOpts{OwnerType: "legacy"})
	return ch
}

// SubscribeWithBuffer deprecated: 请使用 SubscribeNamed
func (q *Queue) SubscribeWithBuffer(topics []string, buffer int) <-chan *types.Message {
	_, ch := q.SubscribeNamed(topics, SubOpts{OwnerType: "legacy", Buffer: buffer})
	return ch
}

// Publish 发布消息到对应 topic
func (q *Queue) Publish(msg *types.Message) {
	q.mu.Lock()
	topic := msg.Topic

	// 确保快照缓冲区存在
	if _, ok := q.snapshots[topic]; !ok {
		q.snapshots[topic] = newRingBuffer(q.snapSize)
	}
	q.snapshots[topic].Push(msg)

	// 收集该 topic 的所有订阅者快照
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

// RegisterTopic 注册 topic 到快照列表，即使没有消息也能在列表中看到
func (q *Queue) RegisterTopic(topic string) {
	if topic == "" {
		return
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.snapshots[topic]; !ok {
		q.snapshots[topic] = newRingBuffer(q.snapSize)
	}
}

// Unsubscribe deprecated: 请使用 UnsubscribeSub
// 旧 API 无法精确反查 Subscriber，迁移后所有调用点都用 UnsubscribeSub，此处为空实现保留签名兼容
func (q *Queue) Unsubscribe(topics []string, ch <-chan *types.Message) {
	_ = topics
	_ = ch
}

// Topics 返回所有活跃 topic
func (q *Queue) Topics() []string {
	q.mu.RLock()
	defer q.mu.RUnlock()

	topics := make([]string, 0, len(q.topicSubs))
	for t := range q.topicSubs {
		topics = append(topics, t)
	}
	return topics
}

// TopicsWithDepth 返回所有 topic 信息（名称、深度、订阅者数）
func (q *Queue) TopicsWithDepth() []TopicInfo {
	q.mu.RLock()
	defer q.mu.RUnlock()

	seen := make(map[string]bool)
	result := make([]TopicInfo, 0, len(q.topicSubs)+len(q.snapshots))

	for topic, subs := range q.topicSubs {
		depth := 0
		for _, s := range subs {
			depth += len(s.ch)
		}
		result = append(result, TopicInfo{
			Name:        topic,
			Depth:       depth,
			Subscribers: len(subs),
		})
		seen[topic] = true
	}
	for topic := range q.snapshots {
		if !seen[topic] {
			result = append(result, TopicInfo{
				Name:        topic,
				Depth:       0,
				Subscribers: 0,
			})
		}
	}
	return result
}

// Depth 返回指定 topic 的队列深度（近似值）
func (q *Queue) Depth(topic string) int {
	q.mu.RLock()
	defer q.mu.RUnlock()

	total := 0
	for _, s := range q.topicSubs[topic] {
		total += len(s.ch)
	}
	return total
}

// RecentMessages 返回指定 topic 的最近 n 条消息快照
func (q *Queue) RecentMessages(topic string, n int) []*types.Message {
	q.mu.RLock()
	snap, ok := q.snapshots[topic]
	q.mu.RUnlock()

	if !ok {
		return nil
	}
	return snap.Recent(n)
}

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
	id := opts.Name + "-" + strconv.FormatInt(time.Now().UnixNano(), 36) + "-" + strconv.FormatUint(uint64(randUint32()), 36)
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
		if _, ok := q.snapshots[t]; !ok {
			q.snapshots[t] = newRingBuffer(q.snapSize)
		}
	}
	return sub, ch
}

// UnsubscribeSub 移除订阅者并关闭 channel
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

// Subscribers 返回所有订阅者的统计快照
func (q *Queue) Subscribers() []Stats {
	q.mu.RLock()
	defer q.mu.RUnlock()
	out := make([]Stats, 0, len(q.subscribers))
	for _, s := range q.subscribers {
		out = append(out, s.Stats())
	}
	return out
}

// randUint32 生成随机数用于订阅者 ID
func randUint32() uint32 {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return uint32(time.Now().UnixNano())
	}
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}
