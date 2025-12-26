package listen

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/injoyai/conv"
	"github.com/injoyai/logs"
)

var _ Listener = (*HTTP)(nil)

func NewHTTP(port int) *HTTP {
	return &HTTP{Server: &http.Server{Addr: fmt.Sprintf(":%d", port)}}
}

type HTTP struct {
	port int
	*http.Server
}

func (this *HTTP) Run(ctx context.Context, cfg conv.Extend, log *logs.Logger, queue chan []byte) error {
	this.Server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		bs, err := io.ReadAll(r.Body)
		if err != nil {
			log.Error(err)
			return
		}
		// 考虑使用 select 避免永久阻塞 Handler
		select {
		case queue <- bs:
			w.WriteHeader(http.StatusOK)
		case <-r.Context().Done(): // 客户端取消了请求
			return
		case <-time.After(5 * time.Second): // 容错：下游太慢则丢弃或报错
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})
	c := make(chan struct{})
	this.Server.RegisterOnShutdown(func() { close(c) })
	go func() {
		select {
		case <-c:
		case <-ctx.Done():
			sdCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			this.Server.Shutdown(sdCtx)
		}
	}()
	return this.Server.ListenAndServe()
}
