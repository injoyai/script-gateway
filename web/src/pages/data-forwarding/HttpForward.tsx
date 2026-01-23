import React, { useState, useEffect } from 'react';
import { Table, Button, Switch, Modal, Form, Input, Select, message, Space, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getPushHttps, createPushHttp, updatePushHttp, deletePushHttp, enablePushHttp, disablePushHttp, PushHttp } from '../../services/scriptApi';

const HttpForward: React.FC = () => {
  const [data, setData] = useState<PushHttp[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PushHttp | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await getPushHttps();
      setData(list);
    } catch (error: any) {
      message.error('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ method: 'POST', enable: true });
    setIsModalVisible(true);
  };

  const handleEdit = (record: PushHttp) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePushHttp(id);
      message.success('Deleted successfully');
      loadData();
    } catch (error: any) {
      message.error('Failed to delete: ' + error.message);
    }
  };

  const handleToggleEnable = async (id: number, checked: boolean) => {
    try {
      if (checked) {
        await enablePushHttp(id);
      } else {
        await disablePushHttp(id);
      }
      message.success(`${checked ? 'Enabled' : 'Disabled'} successfully`);
      loadData();
    } catch (error: any) {
      message.error('Operation failed: ' + error.message);
    }
  };

  const handleModalOk = () => {
    form.validateFields().then(async (values) => {
      try {
        if (editingItem) {
          await updatePushHttp({ ...values, id: editingItem.id });
          message.success('Updated successfully');
        } else {
          await createPushHttp(values);
          message.success('Created successfully');
        }
        setIsModalVisible(false);
        loadData();
      } catch (error: any) {
        message.error('Operation failed: ' + error.message);
      }
    });
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'enable',
      key: 'enable',
      render: (enable: boolean, record: PushHttp) => (
        <Switch
          checked={enable}
          onChange={(checked) => handleToggleEnable(record.id, checked)}
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: PushHttp) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure to delete this item?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="HTTP Forwarding Management"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          New Forwarder
        </Button>
      }
      style={{ margin: '16px', height: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0 }}
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ y: 'calc(100vh - 250px)' }}
      />

      <Modal
        title={editingItem ? 'Edit HTTP Forwarder' : 'New HTTP Forwarder'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please input name' }]}
          >
            <Input placeholder="e.g. Data Center" />
          </Form.Item>
          <Form.Item
            name="url"
            label="URL"
            rules={[{ required: true, message: 'Please input URL' }]}
          >
            <Input placeholder="http://example.com/api/data" />
          </Form.Item>
          <Form.Item
            name="method"
            label="Method"
            rules={[{ required: true, message: 'Please select method' }]}
          >
            <Select>
              <Select.Option value="POST">POST</Select.Option>
              <Select.Option value="PUT">PUT</Select.Option>
              <Select.Option value="GET">GET</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="header" label="Headers (JSON)">
             <Input.TextArea rows={4} placeholder='{"Authorization": "Bearer token"}' />
          </Form.Item>
          <Form.Item name="enable" valuePropName="checked" label="Enable">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default HttpForward;
