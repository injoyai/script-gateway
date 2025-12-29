import React from 'react';
import { Form, Input, Button, Switch, Card, message, InputNumber } from 'antd';

const MqttForward: React.FC = () => {
  const onFinish = (values: any) => {
    console.log('Success:', values);
    message.success('配置已保存');
  };

  return (
    <Card title="MQTT 转发配置" style={{ maxWidth: 800 }}>
      <Form
        name="mqtt_forward"
        layout="vertical"
        initialValues={{
          enabled: true,
          broker: 'tcp://broker.emqx.io:1883',
          clientId: 'edge-gateway-001',
          topic: 'edge/data',
          qos: 1
        }}
        onFinish={onFinish}
      >
        <Form.Item label="启用 MQTT 转发" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          label="Broker 地址"
          name="broker"
          rules={[{ required: true, message: '请输入 Broker 地址!' }]}
        >
          <Input placeholder="tcp://localhost:1883" />
        </Form.Item>

        <Form.Item
          label="客户端 ID"
          name="clientId"
          rules={[{ required: true, message: '请输入客户端 ID!' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item label="用户名" name="username">
          <Input />
        </Form.Item>

        <Form.Item label="密码" name="password">
          <Input.Password />
        </Form.Item>

        <Form.Item
          label="主题"
          name="topic"
          rules={[{ required: true, message: '请输入主题!' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item label="QoS" name="qos">
          <InputNumber min={0} max={2} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default MqttForward;
