import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface Device {
  key: string;
  name: string;
  protocol: string;
  status: string;
  ip: string;
}

const DeviceList: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const [data, setData] = useState<Device[]>([
    { key: '1', name: 'Sensor-001', protocol: 'Modbus TCP', status: 'Online', ip: '192.168.1.10' },
    { key: '2', name: 'PLC-Main', protocol: 'OPC UA', status: 'Offline', ip: '192.168.1.20' },
  ]);

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '协议', dataIndex: 'protocol', key: 'protocol' },
    { title: 'IP 地址', dataIndex: 'ip', key: 'ip' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Online' ? 'green' : 'red'}>{status === 'Online' ? '在线' : '离线'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Device) => (
        <Space size="middle">
          <a>编辑</a>
          <a>删除</a>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    form.validateFields().then((values) => {
      const newData: Device = {
        key: Date.now().toString(),
        name: values.name,
        protocol: values.protocol,
        ip: values.ip,
        status: 'Offline',
      };
      setData([...data, newData]);
      setIsModalVisible(false);
      form.resetFields();
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加设备
        </Button>
      </div>
      <Table columns={columns} dataSource={data} />
      
      <Modal title="添加设备" visible={isModalVisible} onOk={handleOk} onCancel={() => setIsModalVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="设备名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="protocol" label="协议" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="Modbus TCP">Modbus TCP</Select.Option>
              <Select.Option value="OPC UA">OPC UA</Select.Option>
              <Select.Option value="MQTT">MQTT</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ip" label="IP 地址" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {/* Note: In a real app, this form would be generated dynamically based on selected protocol */}
        </Form>
      </Modal>
    </div>
  );
};

export default DeviceList;
