package listen

import (
	"context"
	"io"
	"sync/atomic"
	"time"

	"go.bug.st/serial"
)

var _ Listener = (*Serial)(nil)

func NewSerial(port string, baudRate int, topic string) *Serial {
	return &Serial{
		port:     port,
		baudRate: baudRate,
		topic:    topic,
	}
}

type Serial struct {
	port     string
	baudRate int
	topic    string
	closed   atomic.Bool
	port_    serial.Port
	ctx      context.Context
	cancel   context.CancelFunc
}

func (this *Serial) Start(ctx context.Context) error {
	this.closed.Store(false)

	mode := &serial.Mode{
		BaudRate: this.baudRate,
	}
	p, err := serial.Open(this.port, mode)
	if err != nil {
		return err
	}
	this.port_ = p

	this.ctx, this.cancel = context.WithCancel(ctx)

	go func() {
		<-this.ctx.Done()
		p.Close()
	}()

	return nil
}

func (this *Serial) ReadMessage() ([]byte, error) {
	if this.port_ == nil {
		return nil, io.EOF
	}

	this.port_.SetReadTimeout(time.Second)

	buf := make([]byte, 4096)
	n, err := this.port_.Read(buf)
	if err != nil {
		if this.ctx.Err() != nil {
			this.closed.Store(true)
			return nil, io.EOF
		}
		if err != io.EOF {
			return nil, nil // 临时错误，继续循环
		}
		return nil, io.EOF
	}
	if n == 0 {
		return nil, nil
	}

	data := make([]byte, n)
	copy(data, buf[:n])
	return data, nil
}

func (this *Serial) Write(p []byte) (int, error) {
	if this.port_ == nil {
		return 0, io.ErrClosedPipe
	}
	return this.port_.Write(p)
}

func (this *Serial) Closed() bool {
	return this.closed.Load()
}

func (this *Serial) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	if this.port_ != nil {
		this.port_.Close()
	}
	return nil
}
