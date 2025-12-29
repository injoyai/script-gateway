import React, { useState } from 'react';
import { Table, Select, Button, Space } from 'antd';

const { Option } = Select;

interface Node {
  key: string;
  name: string;
  address: string;
  type: string;
  value: string;
}

const NodeList: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState<string>('Sensor-001');

  const data: Record<string, Node[]> = {
    'Sensor-001': [
      { key: '1', name: 'Temperature', address: '40001', type: 'Float', value: '25.4' },
      { key: '2', name: 'Humidity', address: '40002', type: 'Float', value: '60.1' },
    ],
    'PLC-Main': [
      { key: '3', name: 'MotorSpeed', address: '100', type: 'Int', value: '1500' },
    ]
  };

  const columns = [
    { title: '节点名称', dataIndex: 'name', key: 'name' },
    { title: '地址', dataIndex: 'address', key: 'address' },
    { title: '数据类型', dataIndex: 'type', key: 'type' },
    { title: '当前值', dataIndex: 'value', key: 'value' },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space size="middle">
          <a>编辑</a>
          <a>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: 8 }}>选择设备:</span>
        <Select defaultValue="Sensor-001" style={{ width: 200, marginRight: 16 }} onChange={setSelectedDevice}>
          <Option value="Sensor-001">Sensor-001</Option>
          <Option value="PLC-Main">PLC-Main</Option>
        </Select>
        <Button type="primary">添加节点</Button>
      </div>
      <Table columns={columns} dataSource={data[selectedDevice] || []} />
    </div>
  );
};

export default NodeList;
