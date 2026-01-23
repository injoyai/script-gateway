import React, { useState, useEffect } from 'react';
import { Table, Button, Switch, Modal, Form, Input, InputNumber, message, Space, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getPushMqtts, createPushMqtt, updatePushMqtt, deletePushMqtt, enablePushMqtt, disablePushMqtt, PushMqtt } from '../../services/scriptApi';

const MqttForward: React.FC = () => {
  const [data, setData] = useState<PushMqtt[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PushMqtt | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await getPushMqtts();
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
    form.setFieldsValue({ 
      qos: 0, 
      enable: true,
      broker: 'tcp://broker.emqx.io:1883',
      clientId: 'edge-gateway-' + Math.floor(Math.random() * 1000)
    });
    setIsModalVisible(true);
  };

  const handleEdit = (record: PushMqtt) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePushMqtt(id);
      message.success('Deleted successfully');
      loadData();
    } catch (error: any) {
      message.error('Failed to delete: ' + error.message);
    }
  };

  const handleToggleEnable = async (id: number, checked: boolean) => {
    try {
      if (checked) {
        await enablePushMqtt(id);
      } else {
        await disablePushMqtt(id);
      }
      message.success(checked ? 'Enabled' : 'Disabled');
      loadData();
    } catch (error: any) {
      message.error('Operation failed: ' + error.message);
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await updatePushMqtt({ ...values, id: editingItem.id });
        message.success('Updated successfully');
      } else {
        await createPushMqtt(values);
        message.success('Created successfully');
      }
      setIsModalVisible(false);
      loadData();
    } catch (error: any) {
      // Form validation error or API error
      if (error.message) {
        message.error('Operation failed: ' + error.message);
      }
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Broker',
      dataIndex: 'broker',
      key: 'broker',
      ellipsis: true,
    },
    {
      title: 'Topic',
      dataIndex: 'topic',
      key: 'topic',
      width: 150,
    },
    {
      title: 'Client ID',
      dataIndex: 'clientId',
      key: 'clientId',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'QoS',
      dataIndex: 'qos',
      key: 'qos',
      width: 80,
    },
    {
      title: 'Status',
      dataIndex: 'enable',
      key: 'enable',
      width: 100,
      render: (enable: boolean, record: PushMqtt) => (
        <Switch
          checked={enable}
          onChange={(checked) => handleToggleEnable(record.id, checked)}
          checkedChildren="On"
          unCheckedChildren="Off"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: PushMqtt) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Are you sure to delete this item?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card 
        title="MQTT Forwarding List" 
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            New MQTT Forward
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingItem ? "Edit MQTT Forward" : "New MQTT Forward"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please input name!' }]}
          >
            <Input placeholder="e.g. EMQX Cloud" />
          </Form.Item>

          <Form.Item
            name="broker"
            label="Broker URL"
            rules={[{ required: true, message: 'Please input broker URL!' }]}
          >
            <Input placeholder="tcp://broker.emqx.io:1883" />
          </Form.Item>

          <Form.Item
            name="clientId"
            label="Client ID"
            rules={[{ required: true, message: 'Please input Client ID!' }]}
          >
            <Input placeholder="Unique Client ID" />
          </Form.Item>

          <Form.Item
            name="topic"
            label="Topic"
            rules={[{ required: true, message: 'Please input Topic!' }]}
          >
            <Input placeholder="e.g. sensor/data" />
          </Form.Item>

          <Space style={{ display: 'flex', width: '100%' }} align="baseline">
             <Form.Item
              name="username"
              label="Username"
              style={{ flex: 1 }}
            >
              <Input placeholder="Optional" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              style={{ flex: 1 }}
            >
              <Input.Password placeholder="Optional" />
            </Form.Item>
          </Space>

          <Form.Item
            name="qos"
            label="QoS"
          >
            <InputNumber min={0} max={2} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="enable"
            label="Enable"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MqttForward;
