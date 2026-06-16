package listen

import (
	"context"
	"fmt"
	"io"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var _ Listener = (*MQTT)(nil)

func NewMQTT(broker, clientID, username, password, subTopic string, outputTopic string) *MQTT {
	return &MQTT{
		broker:      broker,
		clientID:    clientID,
		username:    username,
		password:    password,
		subTopic:    subTopic,
		outputTopic: outputTopic,
	}
}

type MQTT struct {
	broker      string
	clientID    string
	username    string
	password    string
	subTopic    string
	outputTopic string
	closed      atomic.Bool
	client      mqtt.Client
	ctx         context.Context
	cancel      context.CancelFunc
	msgCh       chan []byte
}

func (this *MQTT) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	this.ctx, this.cancel = context.WithCancel(ctx)

	opts := mqtt.NewClientOptions()
	opts.AddBroker(this.broker)
	opts.SetClientID(this.clientID)
	opts.SetUsername(this.username)
	opts.SetPassword(this.password)
	opts.SetAutoReconnect(true)
	opts.SetConnectTimeout(time.Second * 5)

	this.client = mqtt.NewClient(opts)
	if token := this.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt connect fail: %w", token.Error())
	}

	token := this.client.Subscribe(this.subTopic, 0, func(_ mqtt.Client, msg mqtt.Message) {
		data := msg.Payload()
		select {
		case this.msgCh <- data:
		default:
		}
	})
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt subscribe fail: %w", token.Error())
	}

	go func() {
		<-this.ctx.Done()
		this.client.Disconnect(250)
	}()

	return nil
}

func (this *MQTT) ReadMessage() ([]byte, error) {
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

func (this *MQTT) Write(p []byte) (int, error) {
	if this.client == nil || !this.client.IsConnected() {
		return 0, io.ErrClosedPipe
	}
	token := this.client.Publish(this.subTopic, 0, false, p)
	token.Wait()
	if token.Error() != nil {
		return 0, token.Error()
	}
	return len(p), nil
}

func (this *MQTT) Closed() bool {
	return this.closed.Load()
}

func (this *MQTT) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	if this.client != nil && this.client.IsConnected() {
		this.client.Disconnect(250)
	}
	return nil
}
