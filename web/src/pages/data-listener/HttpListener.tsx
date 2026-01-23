import React, { useState, useEffect } from 'react';
import { Table, Button, Switch, Modal, Form, Input, InputNumber, message, Space, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import useParserStore from '../../store/useParserStore';
import { 
  getHttpListeners, 
  createHttpListener, 
  updateHttpListener, 
  enableHttpListener, 
  disableHttpListener, 
  deleteHttpListener, 
  HttpListener as HttpListenerModel 
} from '../../services/scriptApi';

interface HttpPathData {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  parserId?: string;
}

interface HttpListenerData extends HttpListenerModel {
  paths: HttpPathData[];
}

const HttpListener: React.FC = () => {
  const { parsers } = useParserStore();
  const [data, setData] = useState<HttpListenerData[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const list = await getHttpListeners();
      // 适配 API 数据到组件数据
      const adaptedList = list.map(item => ({
        ...item,
        paths: [] // 后端暂不支持 paths，初始化为空
      }));
      setData(adaptedList);
    } catch (error: any) {
      message.error('加载数据失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Listener State
  const [isListenerModalVisible, setIsListenerModalVisible] = useState(false);
  const [editingListener, setEditingListener] = useState<HttpListenerData | null>(null);
  const [listenerForm] = Form.useForm();

  // Listener Handlers
  const handleAddListener = () => {
    setEditingListener(null);
    listenerForm.resetFields();
    listenerForm.setFieldsValue({ enable: true, port: 8080 });
    setIsListenerModalVisible(true);
  };

  const handleEditListener = (record: HttpListenerData) => {
    setEditingListener(record);
    listenerForm.setFieldsValue(record);
    setIsListenerModalVisible(true);
  };

  const handleDeleteListener = async (id: number) => {
    try {
      await deleteHttpListener(id);
      message.success('删除监听端口成功');
      loadData();
    } catch (error: any) {
      message.error('删除失败: ' + (error.message || '未知错误'));
    }
  };

  const handleToggleListenerEnable = async (id: number, checked: boolean) => {
    try {
      // 乐观更新
      setData(prev => prev.map(item => 
        item.id === id ? { ...item, enable: checked } : item
      ));

      if (checked) {
        await enableHttpListener(id);
      } else {
        await disableHttpListener(id);
      }
      message.success(`${checked ? '启用' : '禁用'}监听端口成功`);
    } catch (error: any) {
      message.error('操作失败: ' + (error.message || '未知错误'));
      loadData(); // 失败回滚
    }
  };

  const handleListenerModalOk = () => {
    listenerForm.validateFields().then(async values => {
      try {
        if (editingListener) {
          await updateHttpListener({ ...values, id: editingListener.id });
          message.success('更新监听端口成功');
        } else {
          await createHttpListener(values);
          message.success('创建监听端口成功');
        }
        setIsListenerModalVisible(false);
        loadData();
      } catch (error: any) {
        message.error('保存失败: ' + (error.message || '未知错误'));
      }
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
    },
    {
      title: '状态',
      key: 'enable',
      render: (_: any, record: HttpListenerData) => (
        <Switch
          checked={record.enable}
          onChange={(checked) => handleToggleListenerEnable(record.id, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: HttpListenerData) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEditListener(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个监听端口吗？"
            onConfirm={() => handleDeleteListener(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button 
            type="link" 
            icon={<PlusOutlined />} 
            disabled={true}
            title="暂不支持路径配置"
          >
            添加路径
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="HTTP 监听配置" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddListener}>
          添加监听端口
        </Button>
      }>
        <Table
          columns={listenerColumns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
          expandable={{
            expandedRowRender: (record) => (
                <div style={{ margin: 0 }}>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>路径配置 (暂未开放)</span>
                    </div>
                    <div style={{ color: '#999', padding: '10px 0' }}>暂无路径配置</div>
                </div>
            ),
          }}
        />
      </Card>

      {/* Listener Modal */}
      <Modal
        title={editingListener ? "编辑监听端口" : "添加监听端口"}
        visible={isListenerModalVisible}
        onOk={handleListenerModalOk}
        onCancel={() => setIsListenerModalVisible(false)}
      >
        <Form
          form={listenerForm}
          layout="vertical"
          initialValues={{ enable: true }}
        >
          <Form.Item
            name="name"
            label="服务名称"
            rules={[{ required: true, message: '请输入服务名称' }]}
          >
            <Input placeholder="例如：WebHook服务" />
          </Form.Item>
          <Form.Item
            name="port"
            label="监听端口"
            rules={[{ required: true, message: '请输入端口号' }]}
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="enable"
            label="启用状态"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default HttpListener;
