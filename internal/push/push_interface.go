package push

import (
	"time"

	"github.com/injoyai/conv"
)

type Pusher interface {
	Push(msg any) error
}

type AnyWriter interface {
	WriteAny(any) error
}

type anyWriter struct {
	AnyWriter
}

func (this *anyWriter) Push(msg any) error {
	return this.AnyWriter.WriteAny(msg)
}

func Retry(p Pusher, retry int, interval ...time.Duration) Pusher {
	_interval := conv.Default(0, interval...)
	return &_retry{Pusher: p, Retry: retry, Interval: _interval}
}

type _retry struct {
	Pusher
	Retry    int
	Interval time.Duration
}

func (this *_retry) Push(msg any) error {
	for i := 0; i == 0 || i < this.Retry; i++ {
		if err := this.Pusher.Push(msg); err == nil {
			return nil
		}
		time.Sleep(this.Interval)
	}
	return nil
}
