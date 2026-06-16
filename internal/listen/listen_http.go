package listen

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"time"
)

var _ Listener = (*HTTP)(nil)

func NewHTTP(port int, topic string) *HTTP {
	return &HTTP{
		port:  port,
		topic: topic,
		Server: &http.Server{
			Addr: fmt.Sprintf(":%d", port),
		},
	}
}

type HTTP struct {
	port   int
	topic  string
	closed atomic.Bool
	msgCh  chan []byte
	ctx    context.Context
	cancel context.CancelFunc
	*http.Server
}

func (this *HTTP) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	this.ctx, this.cancel = context.WithCancel(ctx)

	this.Server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		bs, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		select {
		case this.msgCh <- bs:
			w.WriteHeader(http.StatusOK)
		case <-r.Context().Done():
			return
		case <-time.After(5 * time.Second):
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})

	c := make(chan struct{})
	this.Server.RegisterOnShutdown(func() { close(c) })

	go func() {
		select {
		case <-c:
		case <-this.ctx.Done():
			sdCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			this.Server.Shutdown(sdCtx)
		}
	}()

	go func() {
		err := this.Server.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			this.closed.Store(true)
		}
	}()

	return nil
}

func (this *HTTP) ReadMessage() ([]byte, error) {
	select {
	case data, ok := <-this.msgCh:
		if !ok {
			return nil, io.EOF
		}
		return data, nil
	case <-this.ctx.Done():
		return nil, io.EOF
	}
}

func (this *HTTP) Write(p []byte) (int, error) {
	// HTTP server 不支持出站写入（请求-响应模式）
	return len(p), nil
}

func (this *HTTP) Closed() bool {
	return this.closed.Load()
}

func (this *HTTP) Close() error {
	this.closed.Store(true)
	return this.Server.Close()
}
