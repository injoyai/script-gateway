import React from 'react';
import { Form, Input, Button, Switch, Card, message, Select } from 'antd';

const HttpForward: React.FC = () => {
  const onFinish = (values: any) => {
    message.success('配置已保存');
  };

  return (
    <Card title="HTTP 转发配置" style={{ maxWidth: 800 }}>
      <Form
        name="http_forward"
        layout="vertical"
        initialValues={{
          enabled: false,
          url: 'http://example.com/api/data',
          method: 'POST'
        }}
        onFinish={onFinish}
      >
        <Form.Item label="启用 HTTP 转发" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          label="目标 URL"
          name="url"
          rules={[{ required: true, message: '请输入 URL!' }]}
        >
          <Input placeholder="http://example.com/api/ingest" />
        </Form.Item>

        <Form.Item label="HTTP 方法" name="method">
          <Select>
            <Select.Option value="POST">POST</Select.Option>
            <Select.Option value="PUT">PUT</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="请求头 (JSON)" name="headers">
          <Input.TextArea rows={4} placeholder='{"Authorization": "Bearer token"}' />
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

export default HttpForward;
