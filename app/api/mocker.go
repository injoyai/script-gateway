package api

import (
	"sync"
	"time"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/logs"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/pipeline"
	"github.com/injoyai/script-gateway/internal/types"
)

// Mocker 虚拟数据发送器 API
type Mocker struct{}

// mockerRunner 内部定时任务状态
type mockerRunner struct {
	stop chan struct{}
}

var (
	mockerMu      sync.Mutex
	mockerRunners = make(map[int64]*mockerRunner)
)

// publishMocker 立即向目标 topic 发布一次消息
func publishMocker(m *model.Mocker) {
	if m.Topic == "" {
		return
	}
	msg := types.NewMessage([]byte(m.Payload), m.Topic)
	msg.Metadata["source"] = "mocker"
	msg.Metadata["mocker_id"] = m.ID
	msg.Metadata["mocker_name"] = m.Name
	pipeline.Default.Queue().Publish(msg)
}

// startMockerRunner 启动指定 mocker 的定时任务
func startMockerRunner(m *model.Mocker) {
	mockerMu.Lock()
	defer mockerMu.Unlock()
	// 已存在则先停止
	if r, ok := mockerRunners[m.ID]; ok {
		close(r.stop)
		delete(mockerRunners, m.ID)
	}
	if m.Interval <= 0 {
		return
	}
	r := &mockerRunner{stop: make(chan struct{})}
	mockerRunners[m.ID] = r
	go func(id int64, stop chan struct{}, interval int) {
		ticker := time.NewTicker(time.Duration(interval) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				// 每次重新读取（允许在运行期间被更新）
				cur := new(model.Mocker)
				has, err := common.DB.ID(id).Get(cur)
				if err != nil || !has || !cur.Enable {
					return
				}
				publishMocker(cur)
			}
		}
	}(m.ID, r.stop, m.Interval)
}

// stopMockerRunner 停止指定 mocker 的定时任务
func stopMockerRunner(id int64) {
	mockerMu.Lock()
	defer mockerMu.Unlock()
	if r, ok := mockerRunners[id]; ok {
		close(r.stop)
		delete(mockerRunners, id)
	}
}

// LoadMockers 进程启动时加载所有 enable=true 的 mocker 并启动定时器
func LoadMockers() {
	var list []*model.Mocker
	if err := common.DB.Where("enable = ?", true).Find(&list); err != nil {
		logs.Errorf("加载 mocker 失败: %v", err)
		return
	}
	for _, m := range list {
		startMockerRunner(m)
	}
}

// List 列表
func (*Mocker) List(c fbr.Ctx) {
	var list []*model.Mocker
	if err := common.DB.Find(&list); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

// Create 创建
func (*Mocker) Create(c fbr.Ctx) {
	data := new(model.Mocker)
	c.Parse(data)
	if data.Name == "" {
		c.Fail("名称不能为空")
		return
	}
	if data.Topic == "" {
		c.Fail("topic 不能为空")
		return
	}
	if _, err := common.DB.InsertOne(data); err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		startMockerRunner(data)
	}
	c.Succ(data)
}

// Update 更新
func (*Mocker) Update(c fbr.Ctx) {
	data := new(model.Mocker)
	c.Parse(data)
	if data.ID == 0 {
		c.Fail("ID 不能为空")
		return
	}
	if _, err := common.DB.ID(data.ID).AllCols().Update(data); err != nil {
		c.Fail(err)
		return
	}
	// 重启定时器（确保使用最新配置）
	stopMockerRunner(data.ID)
	if data.Enable {
		startMockerRunner(data)
	}
	c.Succ(data)
}

// Delete 删除
func (*Mocker) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	if id == 0 {
		c.Fail("ID 不能为空")
		return
	}
	stopMockerRunner(id)
	if _, err := common.DB.ID(id).Delete(new(model.Mocker)); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(nil)
}

// Enable 启用
func (*Mocker) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.Mocker)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("记录不存在")
		return
	}
	data.Enable = true
	if _, err := common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	startMockerRunner(data)
	c.Succ(data)
}

// Disable 禁用
func (*Mocker) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.Mocker)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("记录不存在")
		return
	}
	data.Enable = false
	if _, err := common.DB.ID(id).Cols("enable").Update(data); err != nil {
		c.Fail(err)
		return
	}
	stopMockerRunner(id)
	c.Succ(data)
}

// Trigger 手动触发一次，立即向 topic 发布一条消息
func (*Mocker) Trigger(c fbr.Ctx) {
	id := c.GetInt64("id")
	if id == 0 {
		c.Fail("ID 不能为空")
		return
	}
	data := new(model.Mocker)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("记录不存在")
		return
	}
	publishMocker(data)
	c.Succ(map[string]any{
		"topic":   data.Topic,
		"payload": data.Payload,
	})
}
