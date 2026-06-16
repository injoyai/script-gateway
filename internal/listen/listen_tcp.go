package listen

import (
	"context"
	"io"
	"net"
	"sync"
	"sync/atomic"
)

var _ Listener = (*TCP)(nil)

func NewTCP(addr string, topic string) *TCP {
	return &TCP{
		addr:  addr,
		topic: topic,
	}
}

type TCP struct {
	addr   string
	topic  string
	closed atomic.Bool
	ln     net.Listener
	connMu sync.Mutex
	conns  map[net.Conn]struct{}
	ctx    context.Context
	cancel context.CancelFunc
	msgCh  chan []byte
}

func (this *TCP) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.conns = make(map[net.Conn]struct{})
	this.msgCh = make(chan []byte, 100)

	ln, err := net.Listen("tcp", this.addr)
	if err != nil {
		return err
	}
	this.ln = ln

	this.ctx, this.cancel = context.WithCancel(ctx)

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				if this.ctx.Err() != nil {
					return
				}
				continue
			}
			this.addConn(conn)
			go this.handleConn(conn)
		}
	}()

	go func() {
		<-this.ctx.Done()
		ln.Close()
		this.closeAllConns()
	}()

	return nil
}

func (this *TCP) ReadMessage() ([]byte, error) {
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

func (this *TCP) handleConn(conn net.Conn) {
	defer this.removeConn(conn)
	defer conn.Close()

	buf := make([]byte, 4096)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			return
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
}

func (this *TCP) Write(p []byte) (int, error) {
	this.connMu.Lock()
	defer this.connMu.Unlock()
	for conn := range this.conns {
		conn.Write(p)
	}
	return len(p), nil
}

func (this *TCP) Closed() bool {
	return this.closed.Load()
}

func (this *TCP) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	if this.ln != nil {
		this.ln.Close()
	}
	this.closeAllConns()
	return nil
}

func (this *TCP) addConn(c net.Conn) {
	this.connMu.Lock()
	defer this.connMu.Unlock()
	this.conns[c] = struct{}{}
}

func (this *TCP) removeConn(c net.Conn) {
	this.connMu.Lock()
	defer this.connMu.Unlock()
	delete(this.conns, c)
}

func (this *TCP) closeAllConns() {
	this.connMu.Lock()
	defer this.connMu.Unlock()
	for c := range this.conns {
		c.Close()
	}
}
