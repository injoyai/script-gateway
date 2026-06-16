package queue

import (
	"sync"

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
	channels  map[string][]chan *types.Message // topic -> subscriber channels
	snapshots map[string]*ringBuffer           // topic -> 最近消息快照
	buffer    int                              // channel buffer size
	snapSize  int                              // 每个topic快照保留的消息数
}

// New 创建新队列
func New(buffer int) *Queue {
	if buffer <= 0 {
		buffer = 1000
	}
	return &Queue{
		channels:  make(map[string][]chan *types.Message),
		snapshots: make(map[string]*ringBuffer),
		buffer:    buffer,
		snapSize:  100,
	}
}

// Subscribe 订阅 topic，返回消息 channel
func (q *Queue) Subscribe(topics []string) <-chan *types.Message {
	return q.SubscribeWithBuffer(topics, 0)
}

// SubscribeWithBuffer 订阅 topic，可指定该订阅 channel 的缓冲大小（<=0 时使用 Queue 默认值）
func (q *Queue) SubscribeWithBuffer(topics []string, buffer int) <-chan *types.Message {
	q.mu.Lock()
	defer q.mu.Unlock()

	if buffer <= 0 {
		buffer = q.buffer
	}
	ch := make(chan *types.Message, buffer)
	for _, topic := range topics {
		q.channels[topic] = append(q.channels[topic], ch)
		// 确保快照缓冲区存在
		if _, ok := q.snapshots[topic]; !ok {
			q.snapshots[topic] = newRingBuffer(q.snapSize)
		}
	}
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

	subs := q.channels[topic]
	q.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- msg:
		default:
			// 队列满则丢弃，避免阻塞
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

// Unsubscribe 取消订阅
func (q *Queue) Unsubscribe(topics []string, ch <-chan *types.Message) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for _, topic := range topics {
		subs := q.channels[topic]
		for i, s := range subs {
			if s == ch {
				q.channels[topic] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
	}
}

// Topics 返回所有活跃 topic
func (q *Queue) Topics() []string {
	q.mu.RLock()
	defer q.mu.RUnlock()

	topics := make([]string, 0, len(q.channels))
	for t := range q.channels {
		topics = append(topics, t)
	}
	return topics
}

// TopicsWithDepth 返回所有 topic 信息（名称、深度、订阅者数）
func (q *Queue) TopicsWithDepth() []TopicInfo {
	q.mu.RLock()
	defer q.mu.RUnlock()

	// 合并 channels 和 snapshots 中的 topic
	seen := make(map[string]bool)
	result := make([]TopicInfo, 0, len(q.channels)+len(q.snapshots))

	for topic, subs := range q.channels {
		depth := 0
		for _, ch := range subs {
			depth += len(ch)
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
	for _, ch := range q.channels[topic] {
		total += len(ch)
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
