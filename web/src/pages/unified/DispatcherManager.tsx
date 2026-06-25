import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, CodeOutlined } from '@ant-design/icons';
import TopicLink from '../../components/TopicLink';
import useScriptEditorStore from '../../store/useScriptEditorStore';
import ScriptFormField from '../../components/ScriptFormField';
import { listPluginsByType, type PluginInfo, type PluginParamSpec } from '../../services/pluginApi';

const API_BASE = '/api';

const DISPATCHER_TYPES = [
  { value: 'http', label: 'HTTP' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'script', label: '脚本' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'rocketmq', label: 'RocketMQ' },
  { value: 'plugin', label: '插件' },
];

const DispatcherManager: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form] = Form.useForm();
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);
  const [pusherPlugins, setPusherPlugins] = useState<PluginInfo[]>([]);

  const selectedType = Form.useWatch('type', form);
  const selectedPluginName = Form.useWatch('plugin_name', form);

  const currentPluginSpecs: PluginParamSpec[] = (() => {
    const p = pusherPlugins.find(p => p.name === selectedPluginName);
    return p?.params || [];
  })();

  const fetchPusherPlugins = useCallback(async () => {
    try {
      const data = await listPluginsByType('pusher');
      setPusherPlugins(data || []);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => { fetchPusherPlugins(); }, [fetchPusherPlugins]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dispatcher/list`);
      const data = await res.json();
      setList(data.data || []);
    } catch {
      message.error('获取列表失败');
    }
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const handleCreate = () => {
    setEditItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditItem(record);
    let config = {};
    try { config = JSON.parse(record.config || '{}'); } catch {}
    let topics: string[] = [];
    try { topics = JSON.parse(record.topics || '[]'); } catch {}
    form.setFieldsValue({ ...record, ...config, topic_list: topics.join(',') });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const { type, name, enable, topic_list, ...restConfig } = values;
    const topics = (topic_list || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    const payload = {
      id: editItem?.id,
      name,
      type,
      enable: enable ?? false,
      topics: JSON.stringify(topics),
      config: JSON.stringify(restConfig),
    };

    try {
      const url = editItem ? `${API_BASE}/dispatcher/update` : `${API_BASE}/dispatcher/create`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.code === 0 || data.code === 200) {
        message.success(editItem ? '更新成功' : '创建成功');
        setModalVisible(false);
        fetchList();
      } else {
        message.error(data.msg || '操作失败');
      }
    } catch {
      message.error('请求失败');
    }
  };

  const handleToggle = async (record: any, enable: boolean) => {
    try {
      const url = enable ? `${API_BASE}/dispatcher/enable` : `${API_BASE}/dispatcher/disable`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      message.success(enable ? '已启用' : '已禁用');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/dispatcher/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      message.success('删除成功');
      fetchList();
    } catch {
      message.error('删除失败');
    }
  };

  const renderConfigFields = () => {
    switch (selectedType) {
      case 'http':
        return (
          <>
            <Form.Item name="url" label="URL" rules={[{ required: true }]}><Input placeholder="http://example.com/api" /></Form.Item>
            <Form.Item name="method" label="方法"><Select options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }]} /></Form.Item>
          </>
        );
      case 'mqtt':
        return (
          <>
            <Form.Item name="broker" label="Broker" rules={[{ required: true }]}><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
            <Form.Item name="client_id" label="Client ID"><Input /></Form.Item>
            <Form.Item name="username" label="用户名"><Input /></Form.Item>
            <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
            <Form.Item name="pub_topic" label="发布Topic"><Input /></Form.Item>
          </>
        );
      case 'script':
        return (
          <ScriptFormField
            form={form}
            name="content"
            label="脚本内容"
            required
            tooltip="点击编辑脚本按钮打开代码编辑器"
          />
        );
      case 'websocket':
        return <Form.Item name="address" label="地址" rules={[{ required: true }]}><Input placeholder="ws://127.0.0.1:8080/ws" /></Form.Item>;
      case 'plugin':
        return (
          <>
            <Form.Item name="plugin_name" label="插件" rules={[{ required: true, message: '请选择插件' }]}>
              <Select
                placeholder="选择推送插件"
                options={pusherPlugins.map(p => ({ value: p.name, label: p.display || p.name }))}
                notFoundContent={pusherPlugins.length === 0 ? '暂无已加载的 pusher 插件' : undefined}
              />
            </Form.Item>
            {currentPluginSpecs.length > 0 && (
              <>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>插件参数</div>
                {currentPluginSpecs.map(spec => {
                  const label = spec.label || spec.key;
                  const rules = spec.required ? [{ required: true, message: `请输入${label}` }] : [];
                  switch (spec.type) {
                    case 'int':
                    case 'number':
                    case 'float':
                      return (
                        <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description}>
                          <InputNumber min={spec.min !== undefined ? spec.min : undefined} max={spec.max !== undefined ? spec.max : undefined} style={{ width: '100%' }} />
                        </Form.Item>
                      );
                    case 'bool':
                      return (
                        <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description} valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      );
                    case 'select':
                      return (
                        <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description}>
                          <Select options={(spec.options || []).map(o => ({ value: o, label: o }))} allowClear />
                        </Form.Item>
                      );
                    case 'string':
                    default:
                      return (
                        <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description}>
                          <Input />
                        </Form.Item>
                      );
                  }
                })}
              </>
            )}
            {selectedPluginName && currentPluginSpecs.length === 0 && (
              <div style={{ color: '#888', fontSize: 12 }}>该插件没有可配置的参数</div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color="purple">{t.toUpperCase()}</Tag> },
    { title: '订阅Topics', dataIndex: 'topics', key: 'topics', render: (t: string) => { try { return JSON.parse(t || '[]').map((x: string) => <TopicLink key={x} topic={x} color="default" />); } catch { return '-'; } } },
    { title: '状态', dataIndex: 'enable', key: 'enable', render: (e: boolean, r: any) => <Switch checked={e} onChange={(v) => handleToggle(r, v)} size="small" /> },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, record: any) => (
        <Space>
          {record.type === 'script' && (
            <Button type="link" size="small" icon={<CodeOutlined />} onClick={() => {
              let config: any = {};
              try { config = JSON.parse(record.config || '{}'); } catch {}
              openScriptEditor({
                name: record.name,
                content: config.content || '',
                language: 'go',
                onSave: async (content) => {
                  const payload = {
                    id: record.id,
                    name: record.name,
                    type: record.type,
                    enable: record.enable,
                    topics: record.topics,
                    config: JSON.stringify({ ...config, content }),
                  };
                  const res = await fetch(`${API_BASE}/dispatcher/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (data.code !== 0 && data.code !== 200) {
                    throw new Error(data.msg || '保存失败');
                  }
                  fetchList();
                },
              });
            }}>编辑脚本</Button>
          )}
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3>分发器管理</h3>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editItem ? '编辑分发器' : '新建分发器'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={DISPATCHER_TYPES} /></Form.Item>
          <Form.Item name="topic_list" label="订阅Topics"><Input placeholder="topic1,topic2 (逗号分隔)" /></Form.Item>
          <Form.Item name="enable" label="启用" valuePropName="checked"><Switch /></Form.Item>
          {renderConfigFields()}
        </Form>
      </Modal>
    </div>
  );
};

export default DispatcherManager;
