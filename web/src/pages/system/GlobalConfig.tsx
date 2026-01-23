import React from 'react';
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Divider, 
  message, 
  Select, 
  Switch, 
  Row, 
  Col, 
  Tabs,
  InputNumber
} from 'antd';
import { 
  SettingOutlined, 
  GlobalOutlined, 
  SafetyCertificateOutlined,
  SaveOutlined,
  CloudOutlined
} from '@ant-design/icons';

const { TabPane } = Tabs;
const { Option } = Select;

const GlobalConfig: React.FC = () => {
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    console.log('Success:', values);
    message.success('系统配置已保存');
  };

  return (
    <div style={{ padding: 24 }}>
      <Card 
        title={
          <span>
            <SettingOutlined style={{ marginRight: 8 }} />
            系统全局配置
          </span>
        } 
        bordered={false}
        className="shadow-sm"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            gatewayName: 'Edge-GW-001',
            description: '生产环境主网关节点',
            logLevel: 'INFO',
            logRetention: 7,
            enableAuth: true,
            sessionTimeout: 30,
            mqttBroker: 'tcp://localhost:1883',
            heartbeatInterval: 60,
          }}
          onFinish={onFinish}
        >
          <Tabs defaultActiveKey="1" type="card">
            <TabPane 
              tab={
                <span>
                  <GlobalOutlined />
                  基础设置
                </span>
              } 
              key="1"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item 
                    label="网关名称" 
                    name="gatewayName"
                    rules={[{ required: true, message: '请输入网关名称' }]}
                    tooltip="用于在网络中标识此网关的唯一名称"
                  >
                    <Input placeholder="请输入网关名称" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item 
                    label="运行环境" 
                    name="environment" 
                    initialValue="production"
                  >
                    <Select>
                      <Option value="development">开发环境 (Development)</Option>
                      <Option value="testing">测试环境 (Testing)</Option>
                      <Option value="production">生产环境 (Production)</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="描述信息" name="description">
                <Input.TextArea rows={4} placeholder="请输入网关描述信息" />
              </Form.Item>
            </TabPane>

            <TabPane 
              tab={
                <span>
                  <CloudOutlined />
                  网络与服务
                </span>
              } 
              key="2"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item label="管理接口 IP" name="mgmtIp" initialValue="192.168.1.1">
                    <Input disabled prefix={<GlobalOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="MQTT Broker 地址" name="mqttBroker">
                    <Input placeholder="tcp://localhost:1883" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={24}>
                 <Col span={12}>
                  <Form.Item label="心跳间隔 (秒)" name="heartbeatInterval">
                    <InputNumber min={1} max={3600} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>

            <TabPane 
              tab={
                <span>
                  <SafetyCertificateOutlined />
                  安全与日志
                </span>
              } 
              key="3"
            >
              <Row gutter={24}>
                <Col span={12}>
                   <Form.Item label="日志级别" name="logLevel">
                    <Select>
                      <Option value="DEBUG">调试 (DEBUG)</Option>
                      <Option value="INFO">信息 (INFO)</Option>
                      <Option value="WARN">警告 (WARN)</Option>
                      <Option value="ERROR">错误 (ERROR)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="日志保留天数" name="logRetention">
                     <InputNumber min={1} max={365} addonAfter="天" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              
              <Divider orientation="left" plain>访问控制</Divider>
              
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item label="启用身份验证" name="enableAuth" valuePropName="checked">
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="会话超时 (分钟)" name="sessionTimeout">
                    <InputNumber min={5} max={1440} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>
          </Tabs>

          <Divider style={{ marginTop: 24 }} />
          
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large">
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default GlobalConfig;
