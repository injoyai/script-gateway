package api

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/listen"
	"github.com/injoyai/script-gateway/internal/pipeline"

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

	if data.ID == 0 {
		c.Fail("ID cannot be empty")
		return
	}

	_, err := common.DB.ID(data.ID).Cols("Name", "Port", "Enable").Update(data)
	if err != nil {
		c.Fail(err)
		return
	}

	httpRunner.Stop(data.ID)

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
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())

	l := listen.NewHTTP(data.Port, fmt.Sprintf("http_%d", data.ID))

	// 使用统一管道管理器处理消息
	if err := l.Start(ctx); err != nil {
		return err
	}
	// 后台读循环
	go func() {
		for {
			_, err := l.ReadMessage()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				continue
			}
		}
	}()

	// 同时通过 pipeline 管理器启动（如果存在统一配置）
	_ = pipeline.Default

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
