import React, { useState } from 'react';
import { message, Modal, Form, Input } from 'antd';
import ScriptPageLayout, { ScriptItem } from '../../components/ScriptPageLayout';
import useParserStore, { ParserItem } from '../../store/useParserStore';

const DataParser: React.FC = () => {
  const { parsers, addParser, updateParser, deleteParser } = useParserStore();
  
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();

  const handleUpdate = (updatedItem: ScriptItem) => {
    updateParser(updatedItem as ParserItem);
  };

  const handleCreate = () => {
    createForm.resetFields();
    setCreateModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteParser(id);
    message.success('删除成功');
  };

  const handleSave = (item: ScriptItem) => {
    // In real app, make API call here
    message.success(`解析脚本 "${item.name}" 保存成功`);
  };

  const handleCreateSubmit = () => {
    createForm.validateFields().then(values => {
      const newItem: ParserItem = {
        id: Date.now().toString(),
        name: values.name,
        enabled: true,
        script: `package main

import (
	"fmt"
)

// Parse 解析函数，输入为原始数据，输出为解析后的结构
func Parse(data []byte) (interface{}, error) {
	return string(data), nil
}`,
      };
      addParser(newItem);
      setCreateModalVisible(false);
      message.success('创建成功');
    });
  };

  return (
    <>
      <ScriptPageLayout
        title="数据解析脚本"
        items={parsers}
        onSelect={(item) => {}}
        onUpdate={handleUpdate}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onSave={handleSave}
        placeholder="请从左侧选择一个解析脚本..."
      />
      <Modal
        title="新建解析脚本"
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

export default DataParser;
