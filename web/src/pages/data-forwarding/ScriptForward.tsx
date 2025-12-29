import React, { useState } from 'react';
import { message, Modal, Form, Input } from 'antd';
import ScriptPageLayout, { ScriptItem } from '../../components/ScriptPageLayout';

const ScriptForward: React.FC = () => {
  const [data, setData] = useState<ScriptItem[]>([
    {
      id: '0-0',
      name: 'http_forward.go',
      enabled: true,
      script: `package main

import (
	"fmt"
	"encoding/json"
)

// Forward function processes data and sends it to custom destination
func Forward(data interface{}) error {
	jsonData, _ := json.Marshal(data)
	fmt.Printf("Forwarding data to HTTP: %s\\n", jsonData)
	return nil
}`
    },
    {
      id: '0-1',
      name: 'tcp_forward.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func Forward(data interface{}) error {
	fmt.Println("Forwarding data to TCP")
	return nil
}`
    },
    {
      id: '0-2',
      name: 'file_forward.go',
      enabled: false,
      script: `package main

import (
	"fmt"
)

func Forward(data interface{}) error {
	fmt.Println("Writing data to file")
	return nil
}`
    },
    {
      id: '0-3',
      name: 'mqtt_forward.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func Forward(data interface{}) error {
	fmt.Println("Publishing data to MQTT")
	return nil
}`
    },
    {
      id: '0-4',
      name: 'websocket_forward.go',
      enabled: true,
      script: `package main

import (
	"fmt"
)

func Forward(data interface{}) error {
	fmt.Println("Broadcasting data via WebSocket")
	return nil
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
    message.success(`转发脚本 "${item.name}" 保存成功`);
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

func Forward(data interface{}) error {
	fmt.Println("New Forward Script")
	return nil
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
        title="脚本转发管理"
        items={data}
        onSelect={(item) => {}}
        onUpdate={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onSave={handleSave}
        placeholder="请从左侧选择一个转发脚本..."
      />
      <Modal
        title="新建转发脚本"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="脚本名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入脚本名称，例如：new_forward.go" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ScriptForward;
