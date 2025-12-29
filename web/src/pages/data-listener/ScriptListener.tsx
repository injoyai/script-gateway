import React, { useState } from 'react';
import { message, Modal, Form, Input } from 'antd';
import ScriptPageLayout, { ScriptItem } from '../../components/ScriptPageLayout';

const ScriptListener: React.FC = () => {
  const [data, setData] = useState<ScriptItem[]>([
    { 
      id: '1', 
      name: '自定义WebSocket服务', 
      enabled: true,
      script: `package main

import "fmt"

func main() {
    fmt.Println("启动自定义监听...")
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
    // In real app, make API call here
    message.success(`脚本 "${item.name}" 保存成功`);
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
    fmt.Println("New Listener Script")
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
        title="脚本监听管理"
        items={data}
        onSelect={(item) => {}}
        onUpdate={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onSave={handleSave}
        placeholder="请从左侧选择一个监听脚本..."
      />
      <Modal
        title="新建监听脚本"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="脚本名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入脚本名称" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ScriptListener;
