import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Switch,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import useScriptEditorStore from '../../store/useScriptEditorStore';
import ScriptFormField from '../../components/ScriptFormField';
import { RunningStatusTag } from '../../components/ListenerCrudPage';

const API_BASE = '/api';

interface ListenerItem {
  id: number;
  name: string;
  type: string;
  enable: boolean;
  topic: string;
  out_topic: string;
  content?: string;
  pre_script?: string;
  error_info?: string;
  running?: boolean;
}

const DEFAULT_SCRIPT = `package main

import "fmt"

// Run 入站函数（必须定义，或定义 OnMessage）
// 循环调用，返回的数据推入入站 Topic
// 返回 nil, nil 表示本次无数据产生
func Run() ([]byte, error) {
	fmt.Println("脚本监听运行中")
	return nil, nil
}

// OnMessage 出站函数（可选）
// 当出站 Topic 收到消息时调用
// func OnMessage(payload []byte) error {
// 	fmt.Printf("收到出站消息: %s\\n", payload)
// 	return nil
// }
`;

const ScriptListener: React.FC = () => {
  const [data, setData] = useState<ListenerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ListenerItem | null>(null);
  const [form] = Form.useForm();
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/listener-conn/list?type=script_conn`);
      const json = await res.json();
      setData(json.data || []);
    } catch (e: any) {
      message.error('加载失败: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enable: true, content: DEFAULT_SCRIPT });
    setModalVisible(true);
  };

  const handleEdit = (record: ListenerItem) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      topic: record.topic,
      out_topic: record.out_topic,
      enable: record.enable,
      content: record.content || DEFAULT_SCRIPT,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        id: editing?.id,
        name: values.name,
        type: 'script_conn',
        enable: values.enable ?? false,
        topic: values.topic || '',
        out_topic: values.out_topic || '',
        content: values.content || '',
      };
      const url = editing ? `${API_BASE}/listener-conn/update` : `${API_BASE}/listener-conn/create`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.code === 0 || json.code === 200) {
        message.success(editing ? '更新成功' : '创建成功');
        setModalVisible(false);
        load();
      } else {
        message.error(json.msg || '保存失败');
      }
    } catch {}
  };

  const handleToggle = async (record: ListenerItem, enable: boolean) => {
    try {
      setData((prev) => prev.map((i) => (i.id === record.id ? { ...i, enable } : i)));
      const url = enable ? `${API_BASE}/listener-conn/enable` : `${API_BASE}/listener-conn/disable`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      message.success(enable ? '已启用' : '已禁用');
    } catch {
      message.error('操作失败');
      load();
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/listener-conn/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOpenEditor = (record: ListenerItem) => {
    openScriptEditor({
      name: record.name,
      content: record.content || DEFAULT_SCRIPT,
      language: 'go',
      onSave: async (content) => {
        const payload = {
          id: record.id,
          name: record.name,
          type: record.type,
          enable: record.enable,
          topic: record.topic,
          out_topic: record.out_topic,
          content,
        };
        const res = await fetch(`${API_BASE}/listener-conn/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.code !== 0 && json.code !== 200) {
          throw new Error(json.msg || '保存失败');
        }
        load();
      },
    });
  };

  const columns = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      render: (n: string) => (
        <Space>
          <CodeOutlined style={{ color: 'var(--pine)' }} />
          {n}
        </Space>
      ),
    },
    {
      title: '入站 Topic',
      dataIndex: 'topic',
      key: 'topic',
      render: (t: string) => t ? <Tag color="green">{t}</Tag> : <span style={{ color: 'var(--ink-3)' }}>未设置</span>,
    },
    {
      title: '出站 Topic',
      dataIndex: 'out_topic',
      key: 'out_topic',
      render: (t: string) => t ? <Tag color="blue">{t}</Tag> : <span style={{ color: 'var(--ink-3)' }}>未设置</span>,
    },
    {
      title: '脚本大小',
      key: 'size',
      width: 100,
      render: (_: any, r: ListenerItem) => {
        const size = (r.content || '').length;
        return <Tag>{size} 字符</Tag>;
      },
    },
    {
      title: '状态',
      key: 'enable',
      width: 120,
      render: (_: any, r: ListenerItem) => (
        <Switch checked={r.enable} onChange={(c) => handleToggle(r, c)} checkedChildren="启用" unCheckedChildren="禁用" />
      ),
    },
    {
      title: '运行状态',
      key: 'running_status',
      width: 130,
      render: (_: any, r: ListenerItem) => (
        <RunningStatusTag enable={r.enable} running={r.running} error={r.error_info} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, r: ListenerItem) => (
        <Space size="small">
          <Button type="text" icon={<CodeOutlined />} onClick={() => handleOpenEditor(r)}>编辑脚本</Button>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)}>配置</Button>
          <Popconfirm title="确定删除该脚本监听?" onConfirm={() => handleDelete(r.id)}>
            <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="脚本监听管理" extra={<Space><Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={load} /></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加脚本监听</Button></Space>}>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="middle" pagination={false} />

      <Modal title={editing ? '编辑脚本监听' : '新建脚本监听'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={600} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="服务名称" rules={[{ required: true, message: '请输入服务名称' }]}><Input placeholder="例如：自定义协议解析" /></Form.Item>
          <Form.Item name="topic" label="入站 Topic" tooltip="脚本发出的数据推送到此 Topic"><Input placeholder="例如：script.custom" /></Form.Item>
          <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 Topic 的消息可被脚本消费"><Input placeholder="例如：script.command" /></Form.Item>
          <ScriptFormField
            form={form}
            name="content"
            label="脚本内容 (Go / Yaegi 沙箱)"
            required
            tooltip="点击编辑脚本按钮打开代码编辑器"
            initialScript={DEFAULT_SCRIPT}
          />
          <Form.Item name="enable" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ScriptListener;
