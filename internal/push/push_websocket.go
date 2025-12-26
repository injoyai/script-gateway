package push

import "github.com/injoyai/ios/client"

var _ Pusher = (*Websocket)(nil)

type Websocket struct {
	Address string
	*client.Client
}

// Push implements the Pusher interface
func (this *Websocket) Push(msg any) error {
	this.Client.WriteAny(msg)
	return nil
}
