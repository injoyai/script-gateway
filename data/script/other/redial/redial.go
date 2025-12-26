package redial

import (
	"context"
	"time"

	"github.com/injoyai/ios/client"
	"github.com/injoyai/ios/client/redial"
)

const (
	Name    = "Redial"
	Version = "v1.0"
)

func Run(ctx context.Context) error {
	return redial.RunTCP("127.0.0.1:10086", func(c *client.Client) {
		c.OnConnected = func(c *client.Client) error {
			go func() {
				<-time.After(time.Second * 10)
				c.CloseAll()
			}()
			return nil
		}
	})
}
