package push

import (
	"fmt"
	"time"

	"github.com/injoyai/conv"
	"github.com/injoyai/script-gateway/internal/types"

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

func (this *MQTT) PushRaw(msg any) error {
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

// MQTTDispatcher 适配 Dispatcher 接口
var _ Dispatcher = (*MQTTDispatcher)(nil)

type MQTTDispatcher struct {
	Client mqtt.Client
	Topic  string
	QoS    byte
	topics []string
}

func NewMQTTDispatcher(broker, clientID, user, password, pubTopic string, qos byte, subTopics []string) (*MQTTDispatcher, error) {
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

	return &MQTTDispatcher{
		Client: c,
		Topic:  pubTopic,
		QoS:    qos,
		topics: subTopics,
	}, nil
}

func (this *MQTTDispatcher) Push(msg *types.Message) error {
	if !this.Client.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}
	token := this.Client.Publish(this.Topic, this.QoS, false, msg.Payload)
	token.Wait()
	return token.Error()
}

func (this *MQTTDispatcher) Close() error {
	this.Client.Disconnect(250)
	return nil
}

func (this *MQTTDispatcher) Topics() []string { return this.topics }
