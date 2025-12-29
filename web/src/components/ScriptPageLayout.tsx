import React, { useState } from 'react';
import { Layout, Card, List, Button, Switch, Space, Popconfirm, message, Typography } from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  FileTextOutlined, 
  SaveOutlined,
  EditOutlined 
} from '@ant-design/icons';
import CodeEditor from './CodeEditor';

const { Sider, Content } = Layout;
const { Text } = Typography;

export interface ScriptItem {
  id: string;
  name: string;
  enabled: boolean;
  script: string;
  description?: React.ReactNode;
  [key: string]: any;
}

interface ScriptPageLayoutProps {
  title: string;
  items: ScriptItem[];
  onSelect: (item: ScriptItem) => void;
  onUpdate: (item: ScriptItem) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: (item: ScriptItem) => void;
  placeholder?: string;
  extraButtons?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  showEnableSwitch?: boolean;
}

const ScriptPageLayout: React.FC<ScriptPageLayoutProps> = ({
  title,
  items,
  onSelect,
  onUpdate,
  onCreate,
  onDelete,
  onSave,
  placeholder = '请从左侧选择脚本...',
  extraButtons,
  bottomPanel,
  showEnableSwitch = true
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find(item => item.id === selectedId);

  const handleSelect = (item: ScriptItem) => {
    setSelectedId(item.id);
    onSelect(item);
  };

  const handleToggleEnable = (item: ScriptItem, checked: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ ...item, enabled: checked });
  };

  const handleCodeChange = (code: string) => {
    if (selectedItem) {
      // Create a local update or propagate up? 
      // Usually we want to edit in local state before saving.
      // But for simplicity in this reusable component, we might need a way to track dirty state.
      // For now, we assume parent handles updates or we pass a modified object to parent onSave.
      // Let's assume onUpdate updates the state in parent immediately or we need local state.
      // Better: Update parent state immediately for "draft" or have a separate draft state.
      // To keep it simple and unified: Parent controls state.
      onUpdate({ ...selectedItem, script: code });
    }
  };

  return (
    <Layout style={{ height: '100%', background: '#f5f5f5' }}>
      <Sider 
        width={300} 
        style={{ 
          background: '#fff', 
          borderRight: '1px solid #e8e8e8',
          overflow: 'auto'
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate} size="small">
              新建
            </Button>
          </div>
        </div>
        <List
          itemLayout="horizontal"
          dataSource={items}
          renderItem={item => (
            <List.Item 
              style={{ 
                padding: '12px 16px',
                cursor: 'pointer',
                background: selectedId === item.id ? '#e6f7ff' : 'transparent',
                borderLeft: selectedId === item.id ? '3px solid #1890ff' : '3px solid transparent',
                transition: 'all 0.3s'
              }}
              onClick={() => handleSelect(item)}
              actions={
                showEnableSwitch
                  ? [
                      <Switch 
                        size="small" 
                        checked={item.enabled} 
                        onClick={(checked, e) => handleToggleEnable(item, checked, e)} 
                      />
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ color: selectedId === item.id ? '#1890ff' : '#999' }} />}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Text ellipsis style={{ maxWidth: 140, color: selectedId === item.id ? '#1890ff' : 'inherit', fontWeight: selectedId === item.id ? 600 : 400 }}>
                      {item.name}
                    </Text>
                  </div>
                }
                description={item.description}
              />
              <Popconfirm
                title="确定要删除吗?"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDelete(item.id);
                  if (selectedId === item.id) setSelectedId(null);
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="确定"
                cancelText="取消"
              >
                 <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    size="small" 
                    onClick={(e) => e.stopPropagation()}
                 />
              </Popconfirm>
            </List.Item>
          )}
        />
      </Sider>
      <Content style={{ padding: 0, height: '100%' }}>
        {selectedItem ? (
          <Card
            title={selectedItem.name}
            bordered={false}
            extra={
              <Space>
                {extraButtons}
                <Button 
                  type="primary" 
                  icon={<SaveOutlined />} 
                  onClick={() => onSave(selectedItem)}
                >
                  保存脚本
                </Button>
              </Space>
            }
            bodyStyle={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CodeEditor
                value={selectedItem.script}
                onChange={handleCodeChange}
                language="go"
                theme="material"
                height="100%"
              />
            </div>
            {bottomPanel}
          </Card>
        ) : (
          <div style={{ 
            height: '100%', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            background: '#fff',
            borderRadius: 4,
            border: '1px dashed #d9d9d9',
            color: '#999'
          }}>
            <Space direction="vertical" align="center">
              <FileTextOutlined style={{ fontSize: 48 }} />
              <span>{placeholder}</span>
            </Space>
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default ScriptPageLayout;
