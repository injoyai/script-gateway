import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Modal,
  Popconfirm,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { RunningStatusTag } from '../../components/ListenerCrudPage';
import TopicLink from '../../components/TopicLink';
import ScriptFormField from '../../components/ScriptFormField';

const API_BASE = '/api';

interface ListenerParent {
  id: number;
  name: string;
  type: string;
  enable: boolean;
  port?: number;
  broker?: string;
  client_id?: string;
  username?: string;
  password?: string;
  running?: boolean;
  error_info?: string;
}

interface ListenerConn {
  id: number;
  parent_id: number;
  name: string;
  type: string;
  enable: boolean;
  topic: string;
  out_topic: string;
  sub_topic?: string;
  qos?: number;
  pre_script?: string;
  running?: boolean;
  error_info?: string;
}

const DEFAULT_PRE_SCRIPT = `package main

func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, metadata, true, nil
}
`;

const MqttListener: React.FC = () => {
  const [parents, setParents] = useState<ListenerParent[]>([]);
  const [subs, setSubs] = useState<ListenerConn[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number>();
  const [loadingParents, setLoadingParents] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [parentVisible, setParentVisible] = useState(false);
  const [subVisible, setSubVisible] = useState(false);
  const [editingParent, setEditingParent] = useState<ListenerParent | null>(null);
  const [editingSub, setEditingSub] = useState<ListenerConn | null>(null);
  const [parentForm] = Form.useForm();
  const [subForm] = Form.useForm();

  const selectedParent = useMemo(() => parents.find((item) => item.id === selectedParentId), [parents, selectedParentId]);

  const loadParents = useCallback(async () => {
    setLoadingParents(true);
    try {
      const res = await fetch(`${API_BASE}/listener-parent/list`);
      const json = await res.json();
      const list = (json.data || []).filter((item: ListenerParent) => item.type === 'mqtt_client');
      setParents(list);
      if (!selectedParentId && list.length > 0) setSelectedParentId(list[0].id);
      if (selectedParentId && !list.find((item: ListenerParent) => item.id === selectedParentId)) setSelectedParentId(list[0]?.id);
    } catch (e: any) {
      message.error('加载 MQTT 客户端失败: ' + (e.message || ''));
    } finally {
      setLoadingParents(false);
    }
  }, [selectedParentId]);

  const loadSubs = useCallback(async (parentId?: number) => {
    if (!parentId) {
      setSubs([]);
      return;
    }
    setLoadingSubs(true);
    try {
      const res = await fetch(`${API_BASE}/listener-conn/list?type=mqtt_subscription&parent_id=${parentId}`);
      const json = await res.json();
      setSubs(json.data || []);
    } catch (e: any) {
      message.error('加载订阅失败: ' + (e.message || ''));
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => { loadParents(); }, [loadParents]);
  useEffect(() => { loadSubs(selectedParentId); }, [loadSubs, selectedParentId]);

  const saveParent = async () => {
    try {
      const values = await parentForm.validateFields();
      const payload = {
        id: editingParent?.id,
        name: values.name,
        type: 'mqtt_client',
        enable: values.enable ?? false,
        broker: values.broker || '',
        client_id: values.client_id || '',
        username: values.username || '',
        password: values.password || '',
      };
      const url = editingParent ? `${API_BASE}/listener-parent/update` : `${API_BASE}/listener-parent/create`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.code === 0 || json.code === 200) {
        message.success(editingParent ? '客户端已更新' : '客户端已创建');
        setParentVisible(false);
        loadParents();
        return;
      }
      message.error(json.msg || '保存失败');
    } catch {}
  };

  const saveSub = async () => {
    if (!selectedParentId) {
      message.warning('请先选择 MQTT 客户端');
      return;
    }
    try {
      const values = await subForm.validateFields();
      const payload = {
        id: editingSub?.id,
        parent_id: selectedParentId,
        name: values.name,
        type: 'mqtt_subscription',
        enable: values.enable ?? false,
        topic: values.topic || '',
        out_topic: values.out_topic || '',
        pre_script: values.pre_script || '',
        sub_topic: values.sub_topic || '',
        qos: values.qos ?? 0,
      };
      const url = editingSub ? `${API_BASE}/listener-conn/update` : `${API_BASE}/listener-conn/create`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.code === 0 || json.code === 200) {
        message.success(editingSub ? '订阅已更新' : '订阅已创建');
        setSubVisible(false);
        loadSubs(selectedParentId);
        return;
      }
      message.error(json.msg || '保存失败');
    } catch {}
  };

  const toggleParent = async (record: ListenerParent, enable: boolean) => {
    const url = enable ? `${API_BASE}/listener-parent/enable` : `${API_BASE}/listener-parent/disable`;
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id }) });
    loadParents();
  };

  const toggleSub = async (record: ListenerConn, enable: boolean) => {
    const url = enable ? `${API_BASE}/listener-conn/enable` : `${API_BASE}/listener-conn/disable`;
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id }) });
    loadSubs(selectedParentId);
  };

  const removeParent = async (id: number) => {
    await fetch(`${API_BASE}/listener-parent/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    message.success('客户端已删除');
    if (selectedParentId === id) setSelectedParentId(undefined);
    loadParents();
  };

  const removeSub = async (id: number) => {
    await fetch(`${API_BASE}/listener-conn/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    message.success('订阅已删除');
    loadSubs(selectedParentId);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="MQTT 客户端" extra={<Space><Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={loadParents} /></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingParent(null); parentForm.resetFields(); parentForm.setFieldsValue({ enable: true, broker: 'tcp://127.0.0.1:1883' }); setParentVisible(true); }}>新建客户端</Button></Space>}>
        <Table
          rowKey="id"
          loading={loadingParents}
          dataSource={parents}
          pagination={false}
          rowSelection={{ type: 'radio', selectedRowKeys: selectedParentId ? [selectedParentId] : [], onChange: (keys) => setSelectedParentId(keys[0] as number) }}
          columns={[
            { title: '名称', dataIndex: 'name', key: 'name' },
            { title: 'Broker', key: 'broker', render: (_: any, record: ListenerParent) => <Tag color="geekblue">{record.broker || '-'}</Tag> },
            { title: 'Client ID', key: 'client_id', render: (_: any, record: ListenerParent) => <Tag>{record.client_id || '-'}</Tag> },
            { title: '状态', key: 'enable', render: (_: any, record: ListenerParent) => <Switch checked={record.enable} onChange={(checked) => toggleParent(record, checked)} checkedChildren="启用" unCheckedChildren="禁用" /> },
            { title: '运行状态', key: 'running_status', width: 130, render: (_: any, record: ListenerParent) => <RunningStatusTag enable={record.enable} running={record.running} error={record.error_info} /> },
            { title: '操作', key: 'action', render: (_: any, record: ListenerParent) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => { setEditingParent(record); parentForm.setFieldsValue({ name: record.name, enable: record.enable, broker: record.broker, client_id: record.client_id, username: record.username, password: record.password }); setParentVisible(true); }}>编辑</Button><Popconfirm title="确定删除该 MQTT 客户端?" onConfirm={() => removeParent(record.id)}><Button type="text" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> },
          ]}
        />
      </Card>

      <Card title="MQTT 订阅" extra={<Space><Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => loadSubs(selectedParentId)} /></Tooltip><Button type="primary" icon={<PlusOutlined />} disabled={!selectedParent} onClick={() => { setEditingSub(null); subForm.resetFields(); subForm.setFieldsValue({ enable: true, qos: 0, pre_script: '' }); setSubVisible(true); }}>新建订阅</Button></Space>}>
        {!selectedParent && <div style={{ color: 'var(--ink-3)' }}>请先在上方选择一个 MQTT 客户端</div>}
        {selectedParent && <><div style={{ marginBottom: 12, color: 'var(--ink-2)' }}>当前客户端：<Tag color="blue">{selectedParent.name}</Tag></div><Table rowKey="id" loading={loadingSubs} dataSource={subs} pagination={false} columns={[
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '订阅 Topic', key: 'sub_topic', render: (_: any, record: ListenerConn) => <Tag color="geekblue">{record.sub_topic || '-'}</Tag> },
          { title: 'QoS', key: 'qos', render: (_: any, record: ListenerConn) => <Tag>{record.qos ?? 0}</Tag> },
          { title: '入站 Topic', dataIndex: 'topic', key: 'topic', render: (topic: string) => <TopicLink topic={topic} color="green" /> },
          { title: '出站 Topic', dataIndex: 'out_topic', key: 'out_topic', render: (out_topic: string) => <TopicLink topic={out_topic} color="blue" /> },
          { title: '状态', key: 'enable', render: (_: any, record: ListenerConn) => <Switch checked={record.enable} onChange={(checked) => toggleSub(record, checked)} checkedChildren="启用" unCheckedChildren="禁用" /> },
          { title: '运行状态', key: 'running_status', width: 130, render: (_: any, record: ListenerConn) => <RunningStatusTag enable={record.enable} running={record.running} error={record.error_info} /> },
          { title: '操作', key: 'action', render: (_: any, record: ListenerConn) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => { setEditingSub(record); subForm.setFieldsValue({ name: record.name, enable: record.enable, topic: record.topic, out_topic: record.out_topic, pre_script: record.pre_script || '', sub_topic: record.sub_topic, qos: record.qos }); setSubVisible(true); }}>编辑</Button><Popconfirm title="确定删除该订阅?" onConfirm={() => removeSub(record.id)}><Button type="text" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> },
        ]} /></>}
      </Card>

      <Modal title={editingParent ? '编辑 MQTT 客户端' : '新建 MQTT 客户端'} open={parentVisible} onOk={saveParent} onCancel={() => setParentVisible(false)} destroyOnClose>
        <Form form={parentForm} layout="vertical">
          <Form.Item name="name" label="客户端名称" rules={[{ required: true, message: '请输入客户端名称' }]}><Input /></Form.Item>
          <Form.Item name="broker" label="Broker 地址" rules={[{ required: true, message: '请输入 Broker 地址' }]}><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
          <Form.Item name="client_id" label="Client ID"><Input placeholder="留空则自动生成" /></Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="username" label="用户名" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="password" label="密码" style={{ flex: 1 }}><Input.Password /></Form.Item>
          </Space>
          <Form.Item name="enable" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingSub ? '编辑 MQTT 订阅' : '新建 MQTT 订阅'} open={subVisible} onOk={saveSub} onCancel={() => setSubVisible(false)} width={720} destroyOnClose>
        <Form form={subForm} layout="vertical">
          <Form.Item name="name" label="订阅名称" rules={[{ required: true, message: '请输入订阅名称' }]}><Input /></Form.Item>
          <Form.Item name="sub_topic" label="订阅 Topic" rules={[{ required: true, message: '请输入订阅 Topic' }]}><Input placeholder="factory/+/temp" /></Form.Item>
          <Form.Item name="qos" label="QoS"><Select options={[{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }]} /></Form.Item>
          <Divider />
          <Form.Item name="topic" label="入站 Topic" tooltip="收到的 MQTT 消息推送到此 Topic"><Input /></Form.Item>
          <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 Topic 的消息通过 MQTT 发布出去"><Input /></Form.Item>
          <Form.Item name="enable" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
          <ScriptFormField
            form={subForm}
            name="pre_script"
            label="预处理脚本（可选）"
            placeholder="点击打开全局 Go 脚本编辑器"
            initialScript={DEFAULT_PRE_SCRIPT}
          />
        </Form>
      </Modal>
    </Space>
  );
};

export default MqttListener;
