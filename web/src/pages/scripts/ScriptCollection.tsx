import React, { useState } from 'react';
import { message, Modal, Form, Input } from 'antd';
import ScriptPageLayout, { ScriptItem } from '../../components/ScriptPageLayout';

const ScriptCollection: React.FC = () => {
  const [data, setData] = useState<ScriptItem[]>([
    {
      id: '0-0',
      name: 'modbus_collector.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func main() {
	fmt.Println("Modbus数据采集脚本")
}`
    },
    {
      id: '0-1',
      name: 'mqtt_collector.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func main() {
	fmt.Println("MQTT数据采集脚本")
}`
    },
    {
      id: '0-2',
      name: 'serial_collector.go',
      enabled: false,
      script: `package main

import (
	"fmt"
)

func main() {
	fmt.Println("串口数据采集脚本")
}`
    },
    {
      id: '0-3',
      name: 'opcua_collector.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func main() {
	fmt.Println("OPC UA数据采集脚本")
}`
    },
    {
      id: '0-4',
      name: 'tcp_collector.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func main() {
	fmt.Println("TCP数据采集脚本")
}`
    },
  ]);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();

  const handleUpdate = (updatedItem: ScriptItem) => {
    setData(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const handleCreate = () => {
    createForm.resetFields();
    setCreateModalVisible(true);
  };

  const handleDelete = (id: string) => {
    setData(prev => prev.filter(item => item.id !== id));
    message.success('删除成功');
  };

  const handleSave = (item: ScriptItem) => {
    message.success(`采集脚本 "${item.name}" 保存成功`);
  };

  const handleCreateSubmit = () => {
    createForm.validateFields().then(values => {
      const newItem: ScriptItem = {
        id: Date.now().toString(),
        name: values.name,
        enabled: true,
        script: `package main

import (
    "fmt"
)

func main() {
    fmt.Println("New Collection Script")
}`,
      };
      setData(prev => [...prev, newItem]);
      setCreateModalVisible(false);
      message.success('创建成功');
    });
  };

  return (
    <>
      <ScriptPageLayout
        title="脚本采集管理"
        items={data}
        onSelect={(item) => {}}
        onUpdate={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onSave={handleSave}
        placeholder="请从左侧选择一个采集脚本..."
      />
      <Modal
        title="新建采集脚本"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="脚本名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入脚本名称，例如：new_collector.go" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ScriptCollection;
