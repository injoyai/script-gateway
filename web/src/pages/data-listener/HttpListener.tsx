import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
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
  path?: string;
  methods?: string;
  pre_script?: string;
  running?: boolean;
  error_info?: string;
}

const DEFAULT_PRE_SCRIPT = `package main

func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, metadata, true, nil
}
`;

const HttpListener: React.FC = () => {
  const [parents, setParents] = useState<ListenerParent[]>([]);
  const [conns, setConns] = useState<ListenerConn[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [loadingConns, setLoadingConns] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number>();
  const [parentVisible, setParentVisible] = useState(false);
  const [routeVisible, setRouteVisible] = useState(false);
  const [editingParent, setEditingParent] = useState<ListenerParent | null>(null);
  const [editingRoute, setEditingRoute] = useState<ListenerConn | null>(null);
  const [parentForm] = Form.useForm();
  const [routeForm] = Form.useForm();

  const selectedParent = useMemo(
    () => parents.find((item) => item.id === selectedParentId),
    [parents, selectedParentId]
  );

  const loadParents = useCallback(async () => {
    setLoadingParents(true);
    try {
      const res = await fetch(`${API_BASE}/listener-parent/list`);
      const json = await res.json();
      const list = (json.data || []).filter((item: ListenerParent) => item.type === 'http_server');
      setParents(list);
      if (!selectedParentId && list.length > 0) {
        setSelectedParentId(list[0].id);
      } else if (selectedParentId && !list.find((item: ListenerParent) => item.id === selectedParentId)) {
        setSelectedParentId(list[0]?.id);
      }
    } catch (e: any) {
      message.error('加载 HTTP 服务端失败: ' + (e.message || ''));
    } finally {
      setLoadingParents(false);
    }
  }, [selectedParentId]);

  const loadConns = useCallback(async (parentId?: number) => {
    if (!parentId) {
      setConns([]);
      return;
    }
    setLoadingConns(true);
    try {
      const res = await fetch(`${API_BASE}/listener-conn/list?type=http_route&parent_id=${parentId}`);
      const json = await res.json();
      setConns(json.data || []);
    } catch (e: any) {
      message.error('加载 HTTP 路由失败: ' + (e.message || ''));
    } finally {
      setLoadingConns(false);
    }
  }, []);

  useEffect(() => {
    loadParents();
  }, [loadParents]);

  useEffect(() => {
    loadConns(selectedParentId);
  }, [loadConns, selectedParentId]);

  const saveParent = async () => {
    try {
      const values = await parentForm.validateFields();
      const payload = {
        id: editingParent?.id,
        name: values.name,
        type: 'http_server',
        enable: values.enable ?? false,
        port: values.port,
      };
      const url = editingParent ? `${API_BASE}/listener-parent/update` : `${API_BASE}/listener-parent/create`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.code === 0 || json.code === 200) {
        message.success(editingParent ? '服务端已更新' : '服务端已创建');
        setParentVisible(false);
        loadParents();
        return;
      }
      message.error(json.msg || '保存失败');
    } catch {}
  };

  const saveRoute = async () => {
    if (!selectedParentId) {
      message.warning('请先选择 HTTP 服务端');
      return;
    }
    try {
      const values = await routeForm.validateFields();
      const payload = {
        id: editingRoute?.id,
        parent_id: selectedParentId,
        name: values.name,
        type: 'http_route',
        enable: values.enable ?? false,
        topic: values.topic || '',
        out_topic: values.out_topic || '',
        pre_script: values.pre_script || '',
        path: values.path || '',
        methods: values.method || '',
      };
      const url = editingRoute ? `${API_BASE}/listener-conn/update` : `${API_BASE}/listener-conn/create`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.code === 0 || json.code === 200) {
        message.success(editingRoute ? '路由已更新' : '路由已创建');
        setRouteVisible(false);
        loadConns(selectedParentId);
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

  const toggleRoute = async (record: ListenerConn, enable: boolean) => {
    const url = enable ? `${API_BASE}/listener-conn/enable` : `${API_BASE}/listener-conn/disable`;
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id }) });
    loadConns(selectedParentId);
  };

  const removeParent = async (id: number) => {
    await fetch(`${API_BASE}/listener-parent/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    message.success('服务端已删除');
    if (selectedParentId === id) {
      setSelectedParentId(undefined);
    }
    loadParents();
  };

  const removeRoute = async (id: number) => {
    await fetch(`${API_BASE}/listener-conn/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    message.success('路由已删除');
    loadConns(selectedParentId);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="HTTP 服务端"
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={loadParents} />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingParent(null);
                parentForm.resetFields();
                parentForm.setFieldsValue({ enable: true, port: 8200 });
                setParentVisible(true);
              }}
            >
              新建服务端
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loadingParents}
          dataSource={parents}
          pagination={false}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedParentId ? [selectedParentId] : [],
            onChange: (keys) => setSelectedParentId(keys[0] as number),
          }}
          onRow={(record) => ({
            onClick: () => setSelectedParentId(record.id),
            style: { cursor: 'pointer' },
          })}
          rowClassName={(record) => record.id === selectedParentId ? 'ant-table-row-selected' : ''}
          columns={[
            { title: '名称', dataIndex: 'name', key: 'name' },
            {
              title: '端口',
              key: 'port',
              render: (_: any, record: ListenerParent) => <Tag color="blue">{record.port || '-'}</Tag>,
            },
            {
              title: '状态',
              key: 'enable',
              width: 120,
              render: (_: any, record: ListenerParent) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Switch checked={record.enable} onChange={(checked) => toggleParent(record, checked)} checkedChildren="启用" unCheckedChildren="禁用" />
                </span>
              ),
            },
            {
              title: '运行状态',
              key: 'running_status',
              width: 130,
              render: (_: any, record: ListenerParent) => (
                <RunningStatusTag enable={record.enable} running={record.running} error={record.error_info} />
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: 180,
              render: (_: any, record: ListenerParent) => (
                <Space size="small" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingParent(record);
                      parentForm.setFieldsValue({ name: record.name, enable: record.enable, port: record.port });
                      setParentVisible(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm title="确定删除该服务端?" onConfirm={() => removeParent(record.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Divider style={{ margin: 0 }} />

      <Card
        title={`HTTP 路由${selectedParent ? ` · ${selectedParent.name}` : ''}`}
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={() => loadConns(selectedParentId)} disabled={!selectedParentId} />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!selectedParentId}
              onClick={() => {
                if (!selectedParentId) {
                  message.warning('请先选择 HTTP 服务端');
                  return;
                }
                setEditingRoute(null);
                routeForm.resetFields();
                routeForm.setFieldsValue({ enable: true, method: '', path: '/', topic: '', out_topic: '', pre_script: DEFAULT_PRE_SCRIPT });
                setRouteVisible(true);
              }}
            >
              新建路由
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loadingConns}
          dataSource={conns}
          pagination={false}
          locale={{ emptyText: selectedParentId ? '暂无路由' : '请先选择 HTTP 服务端' }}
          columns={[
            { title: '名称', dataIndex: 'name', key: 'name' },
            {
              title: '方法',
              key: 'method',
              width: 100,
              render: (_: any, record: ListenerConn) => <Tag color="purple">{record.methods || 'ALL'}</Tag>,
            },
            {
              title: '路径',
              key: 'path',
              render: (_: any, record: ListenerConn) => <Tag>{record.path || '/'}</Tag>,
            },
            {
              title: '入站 Topic',
              dataIndex: 'topic',
              key: 'topic',
              render: (topic: string) => <TopicLink topic={topic} color="green" />,
            },
            {
              title: '出站 Topic',
              dataIndex: 'out_topic',
              key: 'out_topic',
              render: (out_topic: string) => <TopicLink topic={out_topic} color="blue" />,
            },
            {
              title: '状态',
              key: 'enable',
              width: 120,
              render: (_: any, record: ListenerConn) => (
                <Switch checked={record.enable} onChange={(checked) => toggleRoute(record, checked)} checkedChildren="启用" unCheckedChildren="禁用" />
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: 180,
              render: (_: any, record: ListenerConn) => (
                <Space size="small">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingRoute(record);
                      routeForm.setFieldsValue({
                        name: record.name,
                        topic: record.topic,
                        out_topic: record.out_topic,
                        enable: record.enable,
                        path: record.path,
                        method: record.methods,
                        pre_script: record.pre_script || DEFAULT_PRE_SCRIPT,
                      });
                      setRouteVisible(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm title="确定删除该路由?" onConfirm={() => removeRoute(record.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal title={editingParent ? '编辑 HTTP 服务端' : '新建 HTTP 服务端'} open={parentVisible} onOk={saveParent} onCancel={() => setParentVisible(false)} destroyOnClose>
        <Form form={parentForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：主站 HTTP 服务" />
          </Form.Item>
          <Form.Item name="port" label="监听端口" rules={[{ required: true, message: '请输入端口' }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enable" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingRoute ? '编辑 HTTP 路由' : '新建 HTTP 路由'} open={routeVisible} onOk={saveRoute} onCancel={() => setRouteVisible(false)} width={720} destroyOnClose>
        <Form form={routeForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：设备上报接口" />
          </Form.Item>
          <Form.Item name="path" label="路由路径" rules={[{ required: true, message: '请输入路由路径' }]}>
            <Input placeholder="/device/report" />
          </Form.Item>
          <Form.Item name="method" label="请求方法">
            <Select options={[{ value: '', label: 'ALL (所有方式)' }, { value: 'GET' }, { value: 'POST' }, { value: 'PUT' }, { value: 'DELETE' }, { value: 'PATCH' }]} />
          </Form.Item>
          <Form.Item name="topic" label="入站 Topic" tooltip="连接收到的数据推送到此 Topic">
            <Input placeholder="例如：http.device.report" />
          </Form.Item>
          <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 Topic 的消息推送到连接">
            <Input placeholder="例如：http.device.command" />
          </Form.Item>
          <Form.Item name="enable" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
          <ScriptFormField
            form={routeForm}
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

export default HttpListener;
