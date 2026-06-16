import React, { useState } from 'react';
import { Layout, Tree, Card, Button, Space, message, Select } from 'antd';
import { FileOutlined, FolderOutlined, PlusOutlined, SaveOutlined, PlayCircleOutlined, CodeOutlined } from '@ant-design/icons';
import useScriptEditorStore from '../../store/useScriptEditorStore';

const { Sider, Content } = Layout;

const defaultCode = `package main

import (
\t"fmt"
\t"encoding/json"
)

// Forward function processes data and sends it to custom destination
func Forward(data interface{}) error {
\tjsonData, _ := json.Marshal(data)
\tfmt.Printf("Forwarding data: %s\\n", jsonData)
\t// Add custom forwarding logic here (e.g., write to file, custom TCP, etc.)
\treturn nil
}`;

const ScriptForward: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState('转发脚本/http_forward.go');
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);

  const treeData = [
    {
      title: '转发脚本',
      key: '0-0',
      icon: <FolderOutlined />,
      children: [
        { title: 'http_forward.go', key: '0-0-0', icon: <FileOutlined />, isLeaf: true },
        { title: 'tcp_forward.go', key: '0-0-1', icon: <FileOutlined />, isLeaf: true },
        { title: 'file_forward.go', key: '0-0-2', icon: <FileOutlined />, isLeaf: true },
      ],
    },
    {
      title: '处理脚本',
      key: '0-1',
      icon: <FolderOutlined />,
      children: [
        { title: 'data_transform.go', key: '0-1-0', icon: <FileOutlined />, isLeaf: true },
        { title: 'filter_forward.go', key: '0-1-1', icon: <FileOutlined />, isLeaf: true },
      ],
    },
  ];

  const onSelect = (keys: React.Key[], info: any) => {
    if (info.node.isLeaf) {
      const fileName = info.node.title as string;
      setSelectedFile(fileName);
      openScriptEditor({
        name: fileName,
        content: defaultCode,
        language: 'go',
        onSave: async (content) => {
          message.success(`转发脚本 ${fileName} 已保存`);
        },
      });
    }
  };

  return (
    <Layout style={{ height: 'calc(100vh - 150px)' }}>
      <Sider width={250} style={{ background: '#fff', borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" size="small" icon={<PlusOutlined />}>新建脚本</Button>
        </div>
        <Tree
          showIcon
          defaultExpandAll
          onSelect={onSelect}
          treeData={treeData}
        />
      </Sider>
      <Content style={{ paddingLeft: 16 }}>
        <Card
          title={selectedFile}
          extra={
            <Space>
              <Button icon={<PlayCircleOutlined />}>测试运行</Button>
              <Button icon={<SaveOutlined />}>保存</Button>
            </Space>
          }
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ padding: 0, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          <div style={{ textAlign: 'center', color: '#999' }}>
            <CodeOutlined style={{ fontSize: 48, marginBottom: 16, color: '#1890ff' }} />
            <div>点击文件已在全局编辑器中打开</div>
          </div>
        </Card>
      </Content>
    </Layout>
  );
};

export default ScriptForward;
