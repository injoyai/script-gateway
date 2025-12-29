import React, { useState } from 'react';
import { Table, Button, Switch, Modal, Form, Input, InputNumber, message, Space, Popconfirm, Card, Select, Tag, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';
import useParserStore from '../../store/useParserStore';

interface HttpPathData {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  parserId?: string;
}

interface HttpListenerData {
  id: string;
  name: string;
  port: number;
  enabled: boolean;
  paths: HttpPathData[];
}

const HttpListener: React.FC = () => {
  const { parsers } = useParserStore();
  const [data, setData] = useState<HttpListenerData[]>([
    {
      id: '1',
      name: 'WebHook服务',
      port: 8080,
      enabled: true,
      paths: [
        {
          id: '11',
          name: '接收GitHub Webhook',
          path: '/webhook/github',
          enabled: true,
          parserId: '1',
        },
        {
          id: '12',
          name: '通用数据接收',
          path: '/api/data',
          enabled: true,
        }
      ]
    },
    {
      id: '2',
      name: '内部API',
      port: 8081,
      enabled: true,
      paths: []
    },
  ]);

  // Listener State
  const [isListenerModalVisible, setIsListenerModalVisible] = useState(false);
  const [editingListener, setEditingListener] = useState<HttpListenerData | null>(null);
  const [listenerForm] = Form.useForm();

  // Path State
  const [isPathModalVisible, setIsPathModalVisible] = useState(false);
  const [editingPath, setEditingPath] = useState<HttpPathData | null>(null);
  const [currentListenerId, setCurrentListenerId] = useState<string | null>(null);
  const [pathForm] = Form.useForm();

  // Listener Handlers
  const handleAddListener = () => {
    setEditingListener(null);
    listenerForm.resetFields();
    setIsListenerModalVisible(true);
  };

  const handleEditListener = (record: HttpListenerData) => {
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
        const newItem: HttpListenerData = {
          id: Date.now().toString(),
          enabled: true,
          paths: [],
          ...values,
        };
        setData(prev => [...prev, newItem]);
        message.success('创建监听端口成功');
      }
      setIsListenerModalVisible(false);
    });
  };

  // Path Handlers
  const handleAddPath = (listenerId: string) => {
    setCurrentListenerId(listenerId);
    setEditingPath(null);
    pathForm.resetFields();
    setIsPathModalVisible(true);
  };

  const handleEditPath = (listenerId: string, record: HttpPathData) => {
    setCurrentListenerId(listenerId);
    setEditingPath(record);
    pathForm.setFieldsValue(record);
    setIsPathModalVisible(true);
  };

  const handleDeletePath = (listenerId: string, pathId: string) => {
    setData(prev => prev.map(listener => {
      if (listener.id === listenerId) {
        return {
          ...listener,
          paths: listener.paths.filter(p => p.id !== pathId)
        };
      }
      return listener;
    }));
    message.success('删除路径成功');
  };

  const handleTogglePathEnable = (listenerId: string, pathId: string, checked: boolean) => {
    setData(prev => prev.map(listener => {
      if (listener.id === listenerId) {
        return {
          ...listener,
          paths: listener.paths.map(p => 
            p.id === pathId ? { ...p, enabled: checked } : p
          )
        };
      }
      return listener;
    }));
    message.success(`${checked ? '启用' : '禁用'}路径成功`);
  };

  const handlePathModalOk = () => {
    pathForm.validateFields().then(values => {
      if (!currentListenerId) return;

      setData(prev => prev.map(listener => {
        if (listener.id === currentListenerId) {
          if (editingPath) {
            // Update Path
            return {
              ...listener,
              paths: listener.paths.map(p => 
                p.id === editingPath.id ? { ...p, ...values } : p
              )
            };
          } else {
            // Create Path
            const newPath: HttpPathData = {
              id: Date.now().toString(),
              enabled: true,
              ...values,
            };
            return {
              ...listener,
              paths: [...listener.paths, newPath]
            };
          }
        }
        return listener;
      }));
      
      message.success(editingPath ? '更新路径成功' : '添加路径成功');
      setIsPathModalVisible(false);
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
      title: '路径数量',
      key: 'pathsCount',
      render: (_: any, record: HttpListenerData) => record.paths.length
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: HttpListenerData) => (
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
      render: (_: any, record: HttpListenerData) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<PlusOutlined />} 
            onClick={(e) => {
              e.stopPropagation();
              handleAddPath(record.id);
            }}
          >
            添加路径
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
                  删除后将同时删除该端口下的所有路径配置
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

  // Expanded Row Render (Paths Table)
  const expandedRowRender = (listener: HttpListenerData) => {
    const pathColumns = [
      {
        title: '路径名称',
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: '请求路径',
        dataIndex: 'path',
        key: 'path',
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
        render: (enabled: boolean, record: HttpPathData) => (
          <Switch 
            size="small"
            checked={enabled} 
            onChange={(checked) => handleTogglePathEnable(listener.id, record.id, checked)} 
          />
        ),
      },
      {
        title: '操作',
        key: 'action',
        render: (_: any, record: HttpPathData) => (
          <Space size="small">
            <Button 
              type="text" 
              size="small"
              icon={<EditOutlined />} 
              onClick={() => handleEditPath(listener.id, record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定要删除该路径吗?"
              onConfirm={() => handleDeletePath(listener.id, record.id)}
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
        columns={pathColumns} 
        dataSource={listener.paths} 
        pagination={false} 
        rowKey="id"
        size="small"
      />
    );
  };

  return (
    <Card 
      title="HTTP 监听管理" 
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
            <Input placeholder="例如: WebHook服务" />
          </Form.Item>
          <Form.Item 
            name="port" 
            label="监听端口" 
            rules={[{ required: true, message: '请输入端口号' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={65535} placeholder="8080" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Path Modal */}
      <Modal
        title={editingPath ? '编辑路径' : '添加路径'}
        open={isPathModalVisible}
        onOk={handlePathModalOk}
        onCancel={() => setIsPathModalVisible(false)}
      >
        <Form form={pathForm} layout="vertical">
          <Form.Item 
            name="name" 
            label="路径名称" 
            rules={[{ required: true, message: '请输入路径名称' }]}
          >
            <Input placeholder="例如: 接收订单数据" />
          </Form.Item>
          <Form.Item 
            name="path" 
            label="请求路径" 
            rules={[{ required: true, message: '请输入请求路径' }]}
          >
            <Input placeholder="/api/v1/orders" />
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

export default HttpListener;
