import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Button, Space, message, Divider, Tag } from 'antd';
import {
  type ListenerParentItem,
  type ListenerConnItem,
  type ProcessorChainItem,
  type DispatcherItem,
  type ViewerItem,
  type MockerItem,
  updateListenerParent,
  updateListenerConn,
  updateProcessorChain,
  updateDispatcher,
  updateViewer,
  updateMocker,
} from '../../services/dataFlowApi';

export type EditTarget =
  | { kind: 'listenerParent'; data: ListenerParentItem }
  | { kind: 'listener'; data: ListenerConnItem }
  | { kind: 'chain'; data: ProcessorChainItem }
  | { kind: 'dispatcher'; data: DispatcherItem }
  | { kind: 'viewer'; data: ViewerItem }
  | { kind: 'mocker'; data: MockerItem }
  | null;

interface Props {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
}

// 解析 JSON 配置字段
const parseJSON = (s?: string): any => {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
};

// 内联编辑面板 - 核心是修改 topic 路由 + 基本配置
export const InlineEditPanel: React.FC<Props> = ({ target, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'listener') {
      const d = target.data;
      const cfg = parseJSON(d.config);
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
        out_topic: d.out_topic,
        // 平铺配置字段
        address: d.address || cfg.address,
        port: d.port || cfg.port,
        baud_rate: d.baud_rate || cfg.baud_rate,
        path: d.path || cfg.path,
        methods: d.methods || cfg.methods,
        sub_topic: d.sub_topic || cfg.sub_topic,
        qos: d.qos ?? cfg.qos,
        content: d.content || cfg.content,
      });
    } else if (target.kind === 'chain') {
      const d = target.data;
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
      });
    } else if (target.kind === 'dispatcher') {
      const d = target.data;
      const cfg = parseJSON(d.config);
      const topics = parseJSON(d.topics);
      form.setFieldsValue({
        name: d.name,
        topic_list: Array.isArray(topics) ? topics.join(',') : '',
        // 常见配置字段
        url: cfg.url,
        method: cfg.method,
        broker: cfg.broker,
        client_id: cfg.client_id,
        username: cfg.username,
        password: cfg.password,
        pub_topic: cfg.pub_topic,
        address: cfg.address,
        plugin_name: cfg.plugin_name,
      });
    } else if (target.kind === 'viewer') {
      const d = target.data;
      const topics = parseJSON(d.topics);
      form.setFieldsValue({
        name: d.name,
        topic_list: Array.isArray(topics) ? topics.join(',') : '',
      });
    } else if (target.kind === 'mocker') {
      const d = target.data;
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
        payload: d.payload,
        interval: d.interval,
      });
    }
  }, [target, form]);

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (target.kind === 'listenerParent') {
        const d = target.data;
        const cfg: any = {};
        if (values.port) cfg.port = values.port;
        if (values.broker) cfg.broker = values.broker;
        if (values.client_id) cfg.client_id = values.client_id;
        if (values.username) cfg.username = values.username;
        if (values.password) cfg.password = values.password;
        await updateListenerParent({
          id: d.id,
          name: values.name,
          type: d.type,
          enable: d.enable,
          config: JSON.stringify(cfg),
        });
      } else if (target.kind === 'listener') {
        const d = target.data;
        const cfg: any = {};
        if (values.address) cfg.address = values.address;
        if (values.port) cfg.port = values.port;
        if (values.baud_rate) cfg.baud_rate = values.baud_rate;
        if (values.path) cfg.path = values.path;
        if (values.methods) cfg.methods = values.methods;
        if (values.sub_topic) cfg.sub_topic = values.sub_topic;
        if (values.qos !== undefined) cfg.qos = values.qos;
        if (values.content) cfg.content = values.content;
        await updateListenerConn({
          id: d.id,
          name: values.name,
          topic: values.topic,
          out_topic: values.out_topic,
          type: d.type,
          parent_id: d.parent_id,
          enable: d.enable,
          config: JSON.stringify(cfg),
        });
      } else if (target.kind === 'chain') {
        const d = target.data;
        await updateProcessorChain({
          id: d.id,
          name: values.name,
          topic: values.topic,
          out_topic: values.out_topic,
        });
      } else if (target.kind === 'dispatcher') {
        const d = target.data;
        const cfg: any = {};
        if (values.url) cfg.url = values.url;
        if (values.method) cfg.method = values.method;
        if (values.broker) cfg.broker = values.broker;
        if (values.client_id) cfg.client_id = values.client_id;
        if (values.username) cfg.username = values.username;
        if (values.password) cfg.password = values.password;
        if (values.pub_topic) cfg.pub_topic = values.pub_topic;
        if (values.address) cfg.address = values.address;
        if (values.plugin_name) cfg.plugin_name = values.plugin_name;
        const topics = (values.topic_list || '').split(',').map((t: string) => t.trim()).filter(Boolean);
        await updateDispatcher({
          id: d.id,
          name: values.name,
          type: d.type,
          enable: d.enable,
          topics: JSON.stringify(topics),
          config: JSON.stringify(cfg),
        });
      } else if (target.kind === 'viewer') {
        const d = target.data;
        const topics = (values.topic_list || '').split(',').map((t: string) => t.trim()).filter(Boolean);
        await updateViewer({
          id: d.id,
          name: values.name,
          enable: d.enable,
          topics: JSON.stringify(topics),
        });
      } else if (target.kind === 'mocker') {
        const d = target.data;
        await updateMocker({
          id: d.id,
          name: values.name,
          topic: values.topic || '',
          payload: values.payload || '',
          interval: Number(values.interval) || 0,
          enable: d.enable,
        });
      }
      message.success('保存成功');
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  const titleMap = {
    listenerParent: '编辑父级监听器',
    listener: '编辑监听器',
    chain: '编辑处理器链',
    dispatcher: '编辑分发器',
    viewer: '编辑订阅查看器',
    mocker: '编辑虚拟数据发送器',
  };

  return (
    <Drawer
      title={titleMap[target.kind]}
      open={!!target}
      onClose={onClose}
      width={420}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        {/* 通用字段 */}
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        {/* topic 路由 - 核心编辑项 */}
        <Divider orientation="left" plain>
          <Tag color="blue">数据流路由</Tag>
        </Divider>

        {target.kind === 'listener' && (
          <>
            <Form.Item name="topic" label="入站 Topic" tooltip="连接收到的数据推送到此 topic">
              <Input placeholder="例如：device/data" />
            </Form.Item>
            <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 topic 的消息推送到连接">
              <Input placeholder="留空则不订阅出站消息" />
            </Form.Item>
            <Form.Item name="content" label="内容模板" tooltip="可选，配置监听器发送或解析的默认内容">
              <Input.TextArea rows={4} placeholder="可选内容模板或示例消息" />
            </Form.Item>
          </>
        )}

        {target.kind === 'chain' && (
          <>
            <Form.Item name="topic" label="订阅 Topic" tooltip="处理器链订阅此 topic 的消息进行处理">
              <Input placeholder="例如：device/data" />
            </Form.Item>
            <Form.Item name="out_topic" label="发布 Topic" tooltip="处理完成后默认发布到此 topic；留空则沿用处理器内部返回或原 topic">
              <Input placeholder="例如：device/cleaned" />
            </Form.Item>
          </>
        )}

        {target.kind === 'dispatcher' && (
          <Form.Item name="topic_list" label="订阅 Topics" tooltip="分发器订阅这些 topic，逗号分隔">
            <Input placeholder="topic1,topic2" />
          </Form.Item>
        )}

        {target.kind === 'viewer' && (
          <Form.Item name="topic_list" label="订阅 Topics" tooltip="查看器订阅这些 topic，逗号分隔">
            <Input placeholder="topic1,topic2" />
          </Form.Item>
        )}

        {target.kind === 'mocker' && (
          <>
            <Form.Item name="topic" label="目标 Topic" rules={[{ required: true, message: '请输入目标 topic' }]}>
              <Input placeholder="例如：device/mock" />
            </Form.Item>
            <Form.Item name="payload" label="数据内容">
              <Input.TextArea rows={4} placeholder={'纯文本或 JSON\n例如：{"value": 1}'} />
            </Form.Item>
            <Form.Item name="interval" label="定时间隔 (ms)" tooltip="0 表示仅手动触发，>0 启用后按此间隔自动发送">
              <Input type="number" placeholder="0 表示仅手动" />
            </Form.Item>
          </>
        )}

        {/* 类型特定配置 */}
        <Divider orientation="left" plain>
          <Tag color="purple">配置参数</Tag>
        </Divider>

        {target.kind === 'listener' && target.data.type === 'tcp_conn' && (
          <Form.Item name="address" label="监听地址"><Input placeholder="0.0.0.0:8080" /></Form.Item>
        )}
        {target.kind === 'listener' && target.data.type === 'udp_conn' && (
          <Form.Item name="address" label="监听地址"><Input placeholder="0.0.0.0:8080" /></Form.Item>
        )}
        {target.kind === 'listener' && target.data.type === 'serial_conn' && (
          <>
            <Form.Item name="port" label="串口"><Input placeholder="COM3 / /dev/ttyUSB0" /></Form.Item>
            <Form.Item name="baud_rate" label="波特率"><Input placeholder="9600" /></Form.Item>
          </>
        )}
        {target.kind === 'listener' && target.data.type === 'http_route' && (
          <>
            <Form.Item name="path" label="路径"><Input placeholder="/api/data" /></Form.Item>
            <Form.Item name="methods" label="方法"><Input placeholder="POST,GET" /></Form.Item>
          </>
        )}
        {target.kind === 'listener' && target.data.type === 'mqtt_subscription' && (
          <>
            <Form.Item name="sub_topic" label="订阅 Topic"><Input /></Form.Item>
            <Form.Item name="qos" label="QoS"><Input placeholder="0" /></Form.Item>
          </>
        )}

        {target.kind === 'dispatcher' && target.data.type === 'http' && (
          <>
            <Form.Item name="url" label="URL"><Input placeholder="http://example.com/api" /></Form.Item>
            <Form.Item name="method" label="方法"><Input placeholder="POST" /></Form.Item>
          </>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'mqtt' && (
          <>
            <Form.Item name="broker" label="Broker"><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
            <Form.Item name="client_id" label="Client ID"><Input /></Form.Item>
            <Form.Item name="username" label="用户名"><Input /></Form.Item>
            <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
            <Form.Item name="pub_topic" label="发布 Topic"><Input /></Form.Item>
          </>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'websocket' && (
          <Form.Item name="address" label="地址"><Input placeholder="ws://127.0.0.1:8080/ws" /></Form.Item>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'plugin' && (
          <Form.Item name="plugin_name" label="插件名"><Input /></Form.Item>
        )}
      </Form>
    </Drawer>
  );
};
