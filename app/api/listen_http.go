package api

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/listen"
	"github.com/injoyai/script-gateway/internal/push"

	"github.com/injoyai/conv"
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/logs"
)

func init() {
	// Sync the database table
	err := common.DB.Sync2(new(model.ListenHTTP))
	if err != nil {
		logs.Err(err)
	}

	// Restart enabled listeners on startup
	go func() {
		// Wait a bit for other initializations
		time.Sleep(time.Second)
		var list []*model.ListenHTTP
		if err := common.DB.Find(&list); err != nil {
			logs.Err(err)
			return
		}
		for _, v := range list {
			if v.Enable {
				if err := httpRunner.Run(v); err != nil {
					logs.Err(fmt.Sprintf("Failed to start HTTP listener %s: %v", v.Name, err))
				}
			}
		}
	}()
}

type ListenHTTP struct{}

func (this *ListenHTTP) List(c fbr.Ctx) {
	var list []*model.ListenHTTP
	err := common.DB.Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(list)
}

func (this *ListenHTTP) Create(c fbr.Ctx) {
	data := new(model.ListenHTTP)
	c.Parse(data)
	if data.Port == 0 {
		c.Fail("端口不能为空")
		return
	}
	_, err := common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if data.Enable {
		if err := httpRunner.Run(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data)
}

func (this *ListenHTTP) Update(c fbr.Ctx) {
	data := new(model.ListenHTTP)
	c.Parse(data)

	if id := c.GetInt64("id"); id > 0 {
		data.ID = id
	}

	// We need ID to update
	if data.ID == 0 {
		c.Fail("ID cannot be empty")
		return
	}

	_, err := common.DB.ID(data.ID).Cols("Name", "Port", "Enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}

	// Stop existing instance
	httpRunner.Stop(data.ID)

	// Start if enabled
	if data.Enable {
		if err := httpRunner.Run(data); err != nil {
			c.Fail(err)
			return
		}
	}
	c.Succ(data)
}

func (this *ListenHTTP) Enable(c fbr.Ctx) {
	id := c.GetInt64("id")
	data := new(model.ListenHTTP)
	has, err := common.DB.ID(id).Get(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("Data not found")
		return
	}

	data.Enable = true
	_, err = common.DB.ID(id).Cols("Enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	if err := httpRunner.Run(data); err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

func (this *ListenHTTP) Disable(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Cols("Enable").Update(&model.ListenHTTP{Enable: false})
	if err != nil {
		c.Fail(err)
		return
	}
	httpRunner.Stop(id)
	c.Succ(true)
}

func (this *ListenHTTP) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.ListenHTTP))
	if err != nil {
		c.Fail(err)
		return
	}
	httpRunner.Stop(id)
	c.Succ(true)
}

// -------------------------------------------------------

var httpRunner = &runner{
	running: make(map[int64]context.CancelFunc),
}

type runner struct {
	mu      sync.RWMutex
	running map[int64]context.CancelFunc
}

func (this *runner) Run(data *model.ListenHTTP) error {
	this.mu.Lock()
	defer this.mu.Unlock()

	if _, ok := this.running[data.ID]; ok {
		return nil // Already running
	}

	ctx, cancel := context.WithCancel(context.Background())
	queue := make(chan []byte, 100)

	// Consume queue
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case bs := <-queue:
				logs.Debug(fmt.Sprintf("[HTTP Listener %s] Received: %s", data.Name, string(bs)))
				this.dispatch(bs)
			}
		}
	}()

	l := listen.NewHTTP(data.Port)
	go func() {
		err := l.Run(ctx, conv.NewMap(data).Extend, &logs.Logger{}, queue)
		if err != nil {
			// If context is canceled, it's expected
			if ctx.Err() == nil {
				logs.Err(err)
			}
		}
	}()

	this.running[data.ID] = cancel
	return nil
}

func (this *runner) Stop(id int64) {
	this.mu.Lock()
	defer this.mu.Unlock()
	if cancel, ok := this.running[id]; ok {
		cancel()
		delete(this.running, id)
	}
}

func (this *runner) dispatch(msg []byte) {
	// 1. PushHTTP
	var httpList []*model.PushHTTP
	common.DB.Where("enable = ?", true).Find(&httpList)
	for _, v := range httpList {
		go func(v *model.PushHTTP) {
			p := push.NewHTTP(v.URL, v.Method)
			if len(v.Header) > 0 {
				var h map[string]string
				if err := json.Unmarshal([]byte(v.Header), &h); err == nil {
					p.SetHeader(h)
				}
			}
			if err := p.Push(msg); err != nil {
				logs.Err(fmt.Sprintf("PushHTTP %s fail: %v", v.Name, err))
			}
		}(v)
	}

	// 2. PushMQTT
	var mqttList []*model.PushMQTT
	common.DB.Where("enable = ?", true).Find(&mqttList)
	for _, v := range mqttList {
		go func(v *model.PushMQTT) {
			p, err := push.NewMQTT(v.Broker, v.ClientId, v.Username, v.Password, v.Topic)
			if err != nil {
				logs.Err(fmt.Sprintf("PushMQTT %s connect fail: %v", v.Name, err))
				return
			}
			defer p.Close()
			p.QoS = byte(v.QoS)
			if err := p.Push(msg); err != nil {
				logs.Err(fmt.Sprintf("PushMQTT %s push fail: %v", v.Name, err))
			}
		}(v)
	}

	// 3. PushScript
	var scriptList []*model.PushScript
	common.DB.Where("enable = ?", true).Find(&scriptList)
	for _, v := range scriptList {
		go func(v *model.PushScript) {
			p, err := push.NewScript(v.Content)
			if err != nil {
				logs.Err(fmt.Sprintf("PushScript %s compile fail: %v", v.Name, err))
				return
			}
			if err := p.Push(msg); err != nil {
				logs.Err(fmt.Sprintf("PushScript %s run fail: %v", v.Name, err))
			}
		}(v)
	}
}
