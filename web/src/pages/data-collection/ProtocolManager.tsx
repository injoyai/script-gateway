import React, { useState } from 'react';
import { Tree, Card, Button, Space, message } from 'antd';
import { FileOutlined, FolderOutlined, SaveOutlined, DownloadOutlined, CodeOutlined } from '@ant-design/icons';
import useScriptEditorStore from '../../store/useScriptEditorStore';

const { DirectoryTree } = Tree;

const initialFileContent = `package main

import "fmt"

// Decode 协议解码函数，输入原始数据，输出解析结果
func Decode(data []byte) (map[string]any, error) {
	fmt.Printf("Decoding %d bytes\\n", len(data))
	return map[string]any{"raw": data}, nil
}
`;

const ProtocolManager: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);

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
      const fileName = info.node.title as string;
      setSelectedFile(fileName);
      openScriptEditor({
        name: fileName,
        content: initialFileContent,
        language: 'go',
        onSave: async (content) => {
          message.success(`文件 ${fileName} 保存成功`);
        },
      });
    }
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
              <Button icon={<SaveOutlined />} disabled={!selectedFile}>保存</Button>
              <Button icon={<DownloadOutlined />} disabled={!selectedFile}>下载</Button>
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
      </div>
    </div>
  );
};

export default ProtocolManager;
