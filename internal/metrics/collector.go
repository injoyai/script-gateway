package metrics

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

// Collector 指标采集器
type Collector struct {
	mu       sync.RWMutex
	counters map[string]*atomic.Int64
	gauges   map[string]*atomic.Int64
}

var Default = &Collector{
	counters: make(map[string]*atomic.Int64),
	gauges:   make(map[string]*atomic.Int64),
}

// IncrCounter 递增计数器
func (c *Collector) IncrCounter(name string, delta int64) {
	c.mu.RLock()
	v, ok := c.counters[name]
	c.mu.RUnlock()
	if !ok {
		c.mu.Lock()
		v, ok = c.counters[name]
		if !ok {
			v = new(atomic.Int64)
			c.counters[name] = v
		}
		c.mu.Unlock()
	}
	v.Add(delta)
}

// SetGauge 设置仪表值
func (c *Collector) SetGauge(name string, value int64) {
	c.mu.RLock()
	v, ok := c.gauges[name]
	c.mu.RUnlock()
	if !ok {
		c.mu.Lock()
		v, ok = c.gauges[name]
		if !ok {
			v = new(atomic.Int64)
			c.gauges[name] = v
		}
		c.mu.Unlock()
	}
	v.Store(value)
}

// GetCounter 获取计数器值
func (c *Collector) GetCounter(name string) int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if v, ok := c.counters[name]; ok {
		return v.Load()
	}
	return 0
}

// GetGauge 获取仪表值
func (c *Collector) GetGauge(name string) int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if v, ok := c.gauges[name]; ok {
		return v.Load()
	}
	return 0
}

// Snapshot 获取所有指标的快照
func (c *Collector) Snapshot() map[string]int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make(map[string]int64)
	for k, v := range c.counters {
		result["counter."+k] = v.Load()
	}
	for k, v := range c.gauges {
		result["gauge."+k] = v.Load()
	}
	return result
}

// Persist 持久化指标到数据库
func (c *Collector) Persist() error {
	snapshot := c.Snapshot()
	now := time.Now()

	for name, value := range snapshot {
		labels, _ := json.Marshal(map[string]string{"name": name})
		_, err := common.DB.InsertOne(&model.Metric{
			Name:      name,
			Type:      "counter",
			Value:     float64(value),
			Labels:    string(labels),
			Timestamp: now,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// 便捷方法

// IncrListenerMessages 递增监听器消息计数
func IncrListenerMessages(listenerID string) {
	Default.IncrCounter("listener."+listenerID+".messages", 1)
	Default.IncrCounter("system.total_messages", 1)
}

// IncrDispatcherPushes 递增分发器推送计数
func IncrDispatcherPushes(dispatcherID string) {
	Default.IncrCounter("dispatcher."+dispatcherID+".pushes", 1)
}

// IncrDispatcherErrors 递增分发器错误计数
func IncrDispatcherErrors(dispatcherID string) {
	Default.IncrCounter("dispatcher."+dispatcherID+".errors", 1)
}

// SetActiveListeners 设置活跃监听器数
func SetActiveListeners(count int64) {
	Default.SetGauge("system.active_listeners", count)
}

// SetActiveDispatchers 设置活跃分发器数
func SetActiveDispatchers(count int64) {
	Default.SetGauge("system.active_dispatchers", count)
}

// GetSnapshot 获取指标快照
func GetSnapshot() map[string]int64 {
	return Default.Snapshot()
}
