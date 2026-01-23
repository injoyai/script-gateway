package push

import (
	"fmt"
	"time"

	"github.com/injoyai/conv"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MQTT struct {
	Client mqtt.Client
	Topic  string
	QoS    byte
}

func NewMQTT(broker, clientID, user, password, topic string) (*MQTT, error) {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(clientID)
	opts.SetUsername(user)
	opts.SetPassword(password)
	opts.SetAutoReconnect(true)
	opts.SetConnectTimeout(time.Second * 5)

	c := mqtt.NewClient(opts)
	if token := c.Connect(); token.Wait() && token.Error() != nil {
		return nil, token.Error()
	}

	return &MQTT{
		Client: c,
		Topic:  topic,
		QoS:    0,
	}, nil
}

func (this *MQTT) Push(msg any) error {
	if !this.Client.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}
	token := this.Client.Publish(this.Topic, this.QoS, false, conv.Bytes(msg))
	token.Wait()
	return token.Error()
}

func (this *MQTT) Close() {
	this.Client.Disconnect(250)
}
