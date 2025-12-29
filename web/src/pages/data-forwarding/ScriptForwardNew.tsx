import React, { useState } from 'react';
import { Layout, Tree, Card, Button, Space, message, Select } from 'antd';
import { FileOutlined, FolderOutlined, PlusOutlined, SaveOutlined, PlayCircleOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';

const { Sider, Content } = Layout;

const ScriptForward: React.FC = () => {
  const [code, setCode] = useState(`package main

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
}`);

  const [selectedFile, setSelectedFile] = useState('转发脚本/http_forward.go');

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
      setSelectedFile(info.node.title);
      message.info('打开 ' + info.node.title);
    }
  };

  const handleSave = () => {
    message.success('转发脚本已保存');
  };

  const handleTest = () => {
    message.info('脚本测试运行已启动...');
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
              <Button icon={<PlayCircleOutlined />} onClick={handleTest}>测试运行</Button>
              <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
            </Space>
          }
          style={{ height: '100%' }}
          bodyStyle={{ padding: 0, height: 'calc(100% - 57px)' }}
        >
          <Editor
            height="100%"
            defaultLanguage="go"
            value={code}
            onChange={(value: string | undefined) => setCode(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              automaticLayout: true,
            }}
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default ScriptForward;
