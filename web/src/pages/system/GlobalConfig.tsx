import React from 'react';
import { Form, Input, Button, Card, Divider, message } from 'antd';

const GlobalConfig: React.FC = () => {
  const onFinish = (values: any) => {
    message.success('系统配置已更新');
  };

  return (
    <Card title="系统配置" style={{ maxWidth: 800 }}>
      <Form
        layout="vertical"
        initialValues={{
          gatewayName: 'Edge-GW-001',
          description: 'Main production gateway',
          logLevel: 'INFO'
        }}
        onFinish={onFinish}
      >
        <Divider orientation="left">常规设置</Divider>
        <Form.Item label="网关名称" name="gatewayName">
          <Input />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea />
        </Form.Item>

        <Divider orientation="left">网络设置</Divider>
        <Form.Item label="管理接口 IP" name="mgmtIp" initialValue="192.168.1.1">
          <Input disabled />
        </Form.Item>
        
        <Divider orientation="left">高级设置</Divider>
        <Form.Item label="日志级别" name="logLevel">
          <Input />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存更改
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default GlobalConfig;
