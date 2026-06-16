import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import TopicLink from './TopicLink';
import ScriptFormField from './ScriptFormField';

const API_BASE = '/api';

export interface ListenerItem {
  id: number;
  name: string;
  type: string;
  enable: boolean;
  topic: string;
  out_topic: string;
  pre_script?: string;
  parent_id?: number;
  error_info?: string;
  running?: boolean;
  // TCP/UDP
  address?: string;
  // Serial
  port?: string;
  baud_rate?: number;
  // Script
  content?: string;
  // HTTP Route
  path?: string;
  methods?: string;
  // MQTT Subscription
  sub_topic?: string;
  qos?: number;
  // Extra (framing etc.)
  extra?: string;
}

export const DEFAULT_PRE_SCRIPT = `// 可选: 数据入队前的预处理脚本 (Go / Yaegi 沙箱)
// 必须定义 Process 函数,返回值依次为:
//   newPayload, newTopic, newMetadata, pass(false=丢弃), err
package main

func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, metadata, true, nil
}
`;

export interface ListenerCrudPageProps {
  endpoint?: 'listener' | 'listener-conn';
  type: string;
  title: string;
  addButtonText: string;
  modalWidth?: number;
  getInitialValues: () => Record<string, any>;
  getEditFields?: (record: ListenerItem) => Record<string, any>;
  buildExtra?: (values: Record<string, any>) => string;
  columns: Array<any>;
  renderExtraFields: () => React.ReactNode;
}

const ListenerCrudPage = ({
  endpoint = 'listener',
  type,
  title,
  addButtonText,
  modalWidth = 560,
  getInitialValues,
  getEditFields,
  buildExtra,
  columns,
  renderExtraFields,
}: ListenerCrudPageProps) => {
  const [data, setData] = useState<ListenerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ListenerItem | null>(null);
  const [form] = Form.useForm();

  const base = `${API_BASE}/${endpoint}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/list${endpoint === 'listener-conn' ? `?type=${encodeURIComponent(type)}` : ''}`);
      const json = await res.json();
      const list: ListenerItem[] = endpoint === 'listener-conn' ? (json.data || []) : (json.data || []).filter((item: ListenerItem) => item.type === type);
      setData(list);
    } catch (e: any) {
      message.error('加载失败: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }, [base, endpoint, type]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(getInitialValues());
    setModalVisible(true);
  };

  const handleEdit = (record: ListenerItem) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      topic: record.topic,
      out_topic: record.out_topic,
      enable: record.enable,
      pre_script: record.pre_script || '',
      ...(getEditFields ? getEditFields(record) : {}),
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        id: editing?.id,
        name: values.name,
        type,
        enable: values.enable ?? false,
        topic: values.topic || '',
        out_topic: values.out_topic || '',
        pre_script: values.pre_script || '',
        // 类型专属字段直接传
        address: values.address || '',
        port: values.port || '',
        baud_rate: values.baud_rate || 0,
        content: values.content || '',
        path: values.path || '',
        methods: values.methods || '',
        sub_topic: values.sub_topic || '',
        qos: values.qos || 0,
        extra: buildExtra ? buildExtra(values) : '',
      };
      const url = editing ? `${base}/update` : `${base}/create`;
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
        return;
      }
      message.error(json.msg || '保存失败');
    } catch {}
  };

  const handleToggle = async (record: ListenerItem, enable: boolean) => {
    try {
      setData((prev) => prev.map((item) => (item.id === record.id ? { ...item, enable } : item)));
      const url = enable ? `${base}/enable` : `${base}/disable`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      const json = await res.json();
      if (json.code !== 0 && json.code !== 200) {
        message.error((enable ? '启用失败: ' : '禁用失败: ') + (json.msg || ''));
        load();
        return;
      }
      message.success(enable ? '已启用' : '已禁用');
      load();
    } catch {
      message.error('操作失败');
      load();
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${base}/delete`, {
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

  const builtColumns = [
    ...columns,
    {
      title: '状态',
      key: 'enable',
      width: 120,
      render: (_: any, record: ListenerItem) => (
        <Switch checked={record.enable} onChange={(checked) => handleToggle(record, checked)} checkedChildren="启用" unCheckedChildren="禁用" />
      ),
    },
    {
      title: '运行状态',
      key: 'running_status',
      width: 130,
      render: (_: any, record: ListenerItem) => (
        <RunningStatusTag enable={record.enable} running={record.running} error={record.error_info} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: ListenerItem) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title={`确定删除该 ${title.replace('管理', '')}?`} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={title}
      extra={
        <Space>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={load} />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{addButtonText}</Button>
        </Space>
      }
    >
      <Table columns={builtColumns} dataSource={data} rowKey="id" loading={loading} size="middle" pagination={false} />

      <Modal title={editing ? `编辑${title.replace('管理', '')}` : `新建${title.replace('管理', '')}`} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={modalWidth} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="服务名称" rules={[{ required: true, message: '请输入服务名称' }]}>
            <Input />
          </Form.Item>

          {renderExtraFields()}

          <Form.Item name="topic" label="入站 Topic" tooltip="连接收到的数据推送到此 Topic">
            <Input />
          </Form.Item>

          <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 Topic 的消息推送到连接">
            <Input />
          </Form.Item>

          <Form.Item name="enable" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>

          <ScriptFormField
            form={form}
            name="pre_script"
            label="预处理脚本（可选）"
            tooltip="数据入队前先经过此脚本处理。必须定义 Process 函数"
            placeholder="点击打开全局 Go 脚本编辑器"
            initialScript={DEFAULT_PRE_SCRIPT}
          />
        </Form>
      </Modal>
    </Card>
  );
};

export const TopicColumn = {
  title: '入站 Topic',
  dataIndex: 'topic',
  key: 'topic',
  render: (topic: string) => <TopicLink topic={topic} color="green" />,
};

export const OutTopicColumn = {
  title: '出站 Topic',
  dataIndex: 'out_topic',
  key: 'out_topic',
  render: (out_topic: string) => <TopicLink topic={out_topic} color="blue" />,
};

// RunningStatusTag 通用的运行状态徽章，支持鼠标悬停查看错误详情
export interface RunningStatusTagProps {
  enable?: boolean;
  running?: boolean;
  error?: string;
}

export const RunningStatusTag: React.FC<RunningStatusTagProps> = ({ enable, running, error }) => {
  let color = 'default';
  let text = '已停止';
  if (error) {
    color = 'error';
    text = '运行异常';
  } else if (running) {
    color = 'success';
    text = '运行中';
  } else if (enable) {
    color = 'warning';
    text = '未启动';
  }
  const tag = <Tag color={color}>{text}</Tag>;
  if (error) {
    return <Tooltip title={error}>{tag}</Tooltip>;
  }
  return tag;
};

export default ListenerCrudPage;
