import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Card, Space, Tag, Modal, Form, Input, Select, Switch, message } from 'antd';
import { ReloadOutlined, EditOutlined, DashboardOutlined } from '@ant-design/icons';

interface DataItem {
  id: string;
  key: string; // The unique identifier key
  alias?: string;
  value: string | number;
  group: string;
  updatedAt: string;
}

const { Option } = Select;

const DataMonitor: React.FC = () => {
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string | undefined>(undefined);
  
  // Edit Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<DataItem | null>(null);
  const [form] = Form.useForm();
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate mock data on first load
  useEffect(() => {
    const initialData: DataItem[] = Array.from({ length: 20 }).map((_, i) => ({
      id: `${i + 1}`,
      key: `sensor_point_${i + 1}`,
      alias: i % 3 === 0 ? `温度传感器 ${i + 1}` : undefined,
      value: (Math.random() * 100).toFixed(2),
      group: i < 10 ? '车间 A' : '车间 B',
      updatedAt: new Date().toLocaleTimeString(),
    }));
    setData(initialData);
  }, []);

  // Handle auto refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(handleRefresh, 2000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoRefresh]);

  const handleRefresh = () => {
    setLoading(true);
    // Simulate fetching data
    setTimeout(() => {
      setData(prevData => prevData.map(item => ({
        ...item,
        value: (Math.random() * 100).toFixed(2),
        updatedAt: new Date().toLocaleTimeString(),
      })));
      setLoading(false);
    }, 300);
  };

  const handleEdit = (record: DataItem) => {
    setEditingItem(record);
    form.setFieldsValue({
      alias: record.alias,
      group: record.group,
    });
    setIsModalVisible(true);
  };

  const handleModalOk = () => {
    form.validateFields().then(values => {
      setData(prevData => prevData.map(item => {
        if (item.id === editingItem?.id) {
          return {
            ...item,
            alias: values.alias,
            group: values.group,
          };
        }
        return item;
      }));
      setIsModalVisible(false);
      message.success('更新成功');
    });
  };

  const columns = [
    {
      title: '数据点标识',
      dataIndex: 'key',
      key: 'key',
      render: (text: string, record: DataItem) => (
        <Space>
           <span>{text}</span>
           {record.alias && <Tag color="blue">{record.alias}</Tag>}
        </Space>
      ),
    },
    {
      title: '当前值',
      dataIndex: 'value',
      key: 'value',
      render: (text: string) => <b style={{ color: '#1890ff' }}>{text}</b>,
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      render: (text: string) => <Tag color="cyan">{text}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DataItem) => (
        <Button 
          type="link" 
          icon={<EditOutlined />} 
          onClick={() => handleEdit(record)}
        >
          设置别名/分组
        </Button>
      ),
    },
  ];

  const uniqueGroups = Array.from(new Set(data.map(item => item.group)));
  const filteredData = filterGroup ? data.filter(item => item.group === filterGroup) : data;

  return (
    <div style={{ padding: 24 }}>
      <Card title={<Space><DashboardOutlined /><span>实时数据监控</span></Space>} bordered={false}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span>分组筛选:</span>
            <Select 
              style={{ width: 150 }} 
              placeholder="全部分组"
              allowClear
              onChange={setFilterGroup}
            >
              {uniqueGroups.map(group => (
                <Option key={group} value={group}>{group}</Option>
              ))}
            </Select>
          </Space>
          
          <Space>
            <span>自动刷新:</span>
            <Switch 
              checked={autoRefresh} 
              onChange={setAutoRefresh} 
              checkedChildren="开" 
              unCheckedChildren="关" 
            />
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={handleRefresh} 
              loading={loading}
            >
              立即刷新
            </Button>
          </Space>
        </div>

        <Table 
          columns={columns} 
          dataSource={filteredData} 
          rowKey="id" 
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="设置数据点"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="数据点标识">
            <Input value={editingItem?.key} disabled />
          </Form.Item>
          <Form.Item label="别名" name="alias">
            <Input placeholder="请输入别名，例如：1号电机温度" />
          </Form.Item>
          <Form.Item label="分组" name="group" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="请输入分组名称，例如：动力车间" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DataMonitor;
