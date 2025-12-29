import React, { useState } from 'react';
import { Table, Button, Switch, Modal, Form, Input, InputNumber, message, Space, Popconfirm, Card, Select, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import useParserStore from '../../store/useParserStore';

interface MqttTopicData {
  id: string;
  name: string;
  topic: string;
  enabled: boolean;
  parserId?: string;
}

interface MqttListenerData {
  id: string;
  name: string;
  port: number;
  enabled: boolean;
  topics: MqttTopicData[];
}

const MqttListener: React.FC = () => {
  const { parsers } = useParserStore();
  const [data, setData] = useState<MqttListenerData[]>([
    {
      id: '1',
      name: '工厂MQTT服务',
      port: 1883,
      enabled: true,
      topics: [
        {
          id: '11',
          name: '温度传感器',
          topic: 'factory/temp/#',
          enabled: true,
          parserId: '1',
        },
        {
          id: '12',
          name: '湿度传感器',
          topic: 'factory/humidity/#',
          enabled: true,
        }
      ]
    },
  ]);

  // Listener State
  const [isListenerModalVisible, setIsListenerModalVisible] = useState(false);
  const [editingListener, setEditingListener] = useState<MqttListenerData | null>(null);
  const [listenerForm] = Form.useForm();

  // Topic State
  const [isTopicModalVisible, setIsTopicModalVisible] = useState(false);
  const [editingTopic, setEditingTopic] = useState<MqttTopicData | null>(null);
  const [currentListenerId, setCurrentListenerId] = useState<string | null>(null);
  const [topicForm] = Form.useForm();

  // Listener Handlers
  const handleAddListener = () => {
    setEditingListener(null);
    listenerForm.resetFields();
    setIsListenerModalVisible(true);
  };

  const handleEditListener = (record: MqttListenerData) => {
    setEditingListener(record);
    listenerForm.setFieldsValue(record);
    setIsListenerModalVisible(true);
  };

  const handleDeleteListener = (id: string) => {
    setData(prev => prev.filter(item => item.id !== id));
    message.success('删除监听端口成功');
  };

  const handleToggleListenerEnable = (id: string, checked: boolean) => {
    setData(prev => prev.map(item => 
      item.id === id ? { ...item, enabled: checked } : item
    ));
    message.success(`${checked ? '启用' : '禁用'}监听端口成功`);
  };

  const handleListenerModalOk = () => {
    listenerForm.validateFields().then(values => {
      if (editingListener) {
        setData(prev => prev.map(item => 
          item.id === editingListener.id ? { ...item, ...values } : item
        ));
        message.success('更新监听端口成功');
      } else {
        const newItem: MqttListenerData = {
          id: Date.now().toString(),
          enabled: true,
          topics: [],
          ...values,
        };
        setData(prev => [...prev, newItem]);
        message.success('创建监听端口成功');
      }
      setIsListenerModalVisible(false);
    });
  };

  // Topic Handlers
  const handleAddTopic = (listenerId: string) => {
    setCurrentListenerId(listenerId);
    setEditingTopic(null);
    topicForm.resetFields();
    setIsTopicModalVisible(true);
  };

  const handleEditTopic = (listenerId: string, record: MqttTopicData) => {
    setCurrentListenerId(listenerId);
    setEditingTopic(record);
    topicForm.setFieldsValue(record);
    setIsTopicModalVisible(true);
  };

  const handleDeleteTopic = (listenerId: string, topicId: string) => {
    setData(prev => prev.map(listener => {
      if (listener.id === listenerId) {
        return {
          ...listener,
          topics: listener.topics.filter(t => t.id !== topicId)
        };
      }
      return listener;
    }));
    message.success('删除主题成功');
  };

  const handleToggleTopicEnable = (listenerId: string, topicId: string, checked: boolean) => {
    setData(prev => prev.map(listener => {
      if (listener.id === listenerId) {
        return {
          ...listener,
          topics: listener.topics.map(t => 
            t.id === topicId ? { ...t, enabled: checked } : t
          )
        };
      }
      return listener;
    }));
    message.success(`${checked ? '启用' : '禁用'}主题成功`);
  };

  const handleTopicModalOk = () => {
    topicForm.validateFields().then(values => {
      if (!currentListenerId) return;

      setData(prev => prev.map(listener => {
        if (listener.id === currentListenerId) {
          if (editingTopic) {
            // Update Topic
            return {
              ...listener,
              topics: listener.topics.map(t => 
                t.id === editingTopic.id ? { ...t, ...values } : t
              )
            };
          } else {
            // Create Topic
            const newTopic: MqttTopicData = {
              id: Date.now().toString(),
              enabled: true,
              ...values,
            };
            return {
              ...listener,
              topics: [...listener.topics, newTopic]
            };
          }
        }
        return listener;
      }));
      
      message.success(editingTopic ? '更新主题成功' : '添加主题成功');
      setIsTopicModalVisible(false);
    });
  };

  // Columns for Listener Table
  const listenerColumns = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '监听端口',
      dataIndex: 'port',
      key: 'port',
      render: (port: number) => <Tag color="geekblue">{port}</Tag>
    },
    {
      title: '主题数量',
      key: 'topicsCount',
      render: (_: any, record: MqttListenerData) => record.topics.length
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: MqttListenerData) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Switch 
            checked={enabled} 
            onChange={(checked) => handleToggleListenerEnable(record.id, checked)} 
            checkedChildren="开启"
            unCheckedChildren="关闭"
          />
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: MqttListenerData) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<PlusOutlined />} 
            onClick={(e) => {
              e.stopPropagation();
              handleAddTopic(record.id);
            }}
          >
            添加主题
          </Button>
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={(e) => {
              e.stopPropagation();
              handleEditListener(record);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title={
              <div>
                确定要删除该监听端口吗?
                <div style={{ marginTop: 8, color: '#999' }}>
                  删除后将同时删除该端口下的所有主题配置
                </div>
              </div>
            }
            onConfirm={() => handleDeleteListener(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="text" 
              danger 
              icon={<DeleteOutlined />} 
              onClick={(e) => e.stopPropagation()}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Expanded Row Render (Topics Table)
  const expandedRowRender = (listener: MqttListenerData) => {
    const topicColumns = [
      {
        title: '主题名称',
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: '订阅 Topic',
        dataIndex: 'topic',
        key: 'topic',
        render: (text: string) => <Tag>{text}</Tag>
      },
      {
        title: '数据解析',
        dataIndex: 'parserId',
        key: 'parserId',
        render: (parserId: string) => {
          const parser = parsers.find(p => p.id === parserId);
          return parser ? <Tag color="blue">{parser.name}</Tag> : <span style={{ color: '#999' }}>无</span>;
        }
      },
      {
        title: '状态',
        dataIndex: 'enabled',
        key: 'enabled',
        render: (enabled: boolean, record: MqttTopicData) => (
          <Switch 
            size="small"
            checked={enabled} 
            onChange={(checked) => handleToggleTopicEnable(listener.id, record.id, checked)} 
          />
        ),
      },
      {
        title: '操作',
        key: 'action',
        render: (_: any, record: MqttTopicData) => (
          <Space size="small">
            <Button 
              type="text" 
              size="small"
              icon={<EditOutlined />} 
              onClick={() => handleEditTopic(listener.id, record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定要删除该主题吗?"
              onConfirm={() => handleDeleteTopic(listener.id, record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                type="text" 
                size="small"
                danger 
                icon={<DeleteOutlined />} 
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <Table 
        columns={topicColumns} 
        dataSource={listener.topics} 
        pagination={false} 
        rowKey="id"
        size="small"
      />
    );
  };

  return (
    <Card 
      title="MQTT 监听管理" 
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddListener}>
          新建监听端口
        </Button>
      }
      style={{ margin: '16px', height: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0 }}
    >
      <Table 
        columns={listenerColumns} 
        dataSource={data} 
        rowKey="id" 
        pagination={{ pageSize: 10 }}
        scroll={{ y: 'calc(100vh - 250px)' }}
        expandable={{
          expandedRowRender,
          expandRowByClick: true,
        }}
      />
      
      {/* Listener Modal */}
      <Modal
        title={editingListener ? '编辑监听端口' : '新建监听端口'}
        open={isListenerModalVisible}
        onOk={handleListenerModalOk}
        onCancel={() => setIsListenerModalVisible(false)}
      >
        <Form form={listenerForm} layout="vertical">
          <Form.Item 
            name="name" 
            label="服务名称" 
            rules={[{ required: true, message: '请输入服务名称' }]}
          >
            <Input placeholder="例如: 工厂MQTT服务" />
          </Form.Item>
          <Form.Item 
            name="port" 
            label="监听端口" 
            rules={[{ required: true, message: '请输入端口号' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={65535} placeholder="1883" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Topic Modal */}
      <Modal
        title={editingTopic ? '编辑主题' : '添加主题'}
        open={isTopicModalVisible}
        onOk={handleTopicModalOk}
        onCancel={() => setIsTopicModalVisible(false)}
      >
        <Form form={topicForm} layout="vertical">
          <Form.Item 
            name="name" 
            label="主题名称" 
            rules={[{ required: true, message: '请输入主题名称' }]}
          >
            <Input placeholder="例如: 温度传感器" />
          </Form.Item>
          <Form.Item 
            name="topic" 
            label="订阅 Topic" 
            rules={[{ required: true, message: '请输入Topic' }]}
          >
            <Input placeholder="device/+/data" />
          </Form.Item>
          <Form.Item
            name="parserId"
            label="数据解析 (可选)"
          >
            <Select allowClear placeholder="选择数据解析脚本">
              {parsers.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default MqttListener;
