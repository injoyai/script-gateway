package listen

import (
	"context"
	"io"
	"net"
	"sync/atomic"
)

var _ Listener = (*UDP)(nil)

func NewUDP(addr string, topic string) *UDP {
	return &UDP{
		addr:  addr,
		topic: topic,
	}
}

type UDP struct {
	addr   string
	topic  string
	closed atomic.Bool
	conn   *net.UDPConn
	ctx    context.Context
	cancel context.CancelFunc
	msgCh  chan []byte
}

func (this *UDP) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	addr, err := net.ResolveUDPAddr("udp", this.addr)
	if err != nil {
		return err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	this.conn = conn

	this.ctx, this.cancel = context.WithCancel(ctx)

	go func() {
		buf := make([]byte, 4096)
		for {
			n, _, err := conn.ReadFromUDP(buf)
			if err != nil {
				if this.ctx.Err() != nil {
					return
				}
				continue
			}
			if n > 0 {
				data := make([]byte, n)
				copy(data, buf[:n])
				select {
				case this.msgCh <- data:
				default:
				}
			}
		}
	}()

	go func() {
		<-this.ctx.Done()
		conn.Close()
	}()

	return nil
}

func (this *UDP) ReadMessage() ([]byte, error) {
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

func (this *UDP) Write(p []byte) (int, error) {
	if this.conn == nil {
		return 0, io.ErrClosedPipe
	}
	return len(p), nil
}

func (this *UDP) Closed() bool {
	return this.closed.Load()
}

func (this *UDP) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	if this.conn != nil {
		this.conn.Close()
	}
	return nil
}
