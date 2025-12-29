import React, { useState } from 'react';
import { Tree, Card, Button, Space, message } from 'antd';
import { DownOutlined, FileOutlined, FolderOutlined, SaveOutlined, DownloadOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';

const { DirectoryTree } = Tree;

const initialFileContent = `package main

import (
	"fmt"
)

// This is a sample protocol script
func main() {
	fmt.Println("Protocol Handler initialized")
}
`;

const ProtocolManager: React.FC = () => {
  const [code, setCode] = useState(initialFileContent);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const treeData = [
    {
      title: 'protocols',
      key: '0-0',
      icon: <FolderOutlined />,
      children: [
        {
          title: 'modbus',
          key: '0-0-0',
          icon: <FolderOutlined />,
          children: [
            { title: 'modbus_tcp.go', key: '0-0-0-0', icon: <FileOutlined />, isLeaf: true },
            { title: 'modbus_rtu.go', key: '0-0-0-1', icon: <FileOutlined />, isLeaf: true },
          ],
        },
        {
          title: 'custom',
          key: '0-0-1',
          icon: <FolderOutlined />,
          children: [
            { title: 'my_proto.go', key: '0-0-1-0', icon: <FileOutlined />, isLeaf: true },
          ],
        },
      ],
    },
  ];

  const onSelect = (keys: React.Key[], info: any) => {
    if (info.node.isLeaf) {
      setSelectedFile(info.node.title as string);
      // In a real app, fetch file content here
      message.info('Opened ' + info.node.title);
    }
  };

  const handleSave = () => {
      message.success('文件保存成功');
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 150px)' }}>
      <div style={{ width: 250, borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" size="small">新建脚本</Button>
        </div>
        <DirectoryTree
          multiple
          defaultExpandAll
          onSelect={onSelect}
          treeData={treeData}
        />
      </div>
      <div style={{ flex: 1, paddingLeft: 16, display: 'flex', flexDirection: 'column' }}>
        <Card 
          title={selectedFile ? selectedFile : "选择一个文件"} 
          extra={
            <Space>
              <Button icon={<SaveOutlined />} onClick={handleSave} disabled={!selectedFile}>保存</Button>
              <Button icon={<DownloadOutlined />} disabled={!selectedFile}>下载</Button>
            </Space>
          }
          headStyle={{ background: '#1e1e1e', color: '#fff', borderBottom: '1px solid #333' }}
          bodyStyle={{ padding: 0, flex: 1, height: '100%', background: '#1e1e1e' }}
          style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}
        >
          <div style={{ height: '100%', minHeight: 400, background: '#1e1e1e' }}>
            <Editor
              height="100%"
              defaultLanguage="go"
              value={code}
              onChange={(value?: string) => setCode(value || '')}
              theme="gw-dark"
              options={{
                lineNumbers: 'on',
                glyphMargin: true,
                minimap: { enabled: false },
                automaticLayout: true,
                renderLineHighlight: 'none',
                scrollBeyondLastLine: false,
              }}
              onMount={(editor: any, monaco: any) => {
                monaco.editor.defineTheme('gw-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [],
                  colors: {
                    'editor.background': '#1e1e1e',
                    'editorGutter.background': '#1e1e1e',
                    'editorLineNumber.foreground': '#858585',
                    'editorLineNumber.activeForeground': '#c6c6c6',
                  },
                });
                monaco.editor.setTheme('gw-dark');
              }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ProtocolManager;
