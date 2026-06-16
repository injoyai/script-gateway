import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layout,
  Tree,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Card,
  Dropdown,
  Menu,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  FileAddOutlined,
  FileTextOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import CodeEditor from '../../components/CodeEditor';
import type { DataNode } from 'antd/es/tree';
import {
  getScriptTree,
  getScriptContent,
  createScript,
  updateScript,
  deleteScript,
  moveScript,
  ScriptNode,
} from '../../services/scriptApi';

const { Sider, Content } = Layout;
const { Text } = Typography;

interface TreeNode extends DataNode {
  path: string;
  type: 'file' | 'directory';
  originalNode: ScriptNode;
}

const languageMap: Record<string, string> = {
  js: 'javascript',
  ts: 'javascript',
  py: 'python',
  go: 'go',
  golang: 'go',
  sh: 'shell',
  bash: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'xml',
  css: 'css',
  md: 'markdown',
};

const getLanguageByPath = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return languageMap[ext] || 'go';
};

const convertToTreeData = (node: ScriptNode): TreeNode[] => {
  if (!node.children || node.children.length === 0) {
    return [];
  }

  return node.children.map((child) => {
    const treeNode: TreeNode = {
      title: (
        <span>
          {child.type === 'directory' ? (
            <FolderOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          ) : (
            <FileOutlined style={{ marginRight: 8 }} />
          )}
          {child.name}
        </span>
      ),
      key: child.path,
      path: child.path,
      type: child.type,
      originalNode: child,
      isLeaf: child.type === 'file',
    };

    if (child.type === 'directory' && child.children) {
      treeNode.children = convertToTreeData(child);
    }

    return treeNode;
  });
};

const ScriptManager: React.FC = () => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedNode, setSelectedNode] = useState<ScriptNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [scriptContent, setScriptContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [createType, setCreateType] = useState<'file' | 'directory'>('file');
  const [parentPath, setParentPath] = useState<string>('');

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameForm] = Form.useForm();
  const [renameNode, setRenameNode] = useState<ScriptNode | null>(null);

  const selectedLanguage = useMemo(
    () => (selectedNode?.type === 'file' ? getLanguageByPath(selectedNode.path) : 'go'),
    [selectedNode],
  );

  const loadScriptTree = useCallback(async () => {
    setLoading(true);
    try {
      const root = await getScriptTree('');
      const data = convertToTreeData(root);
      setTreeData(data);
      if (root.children) {
        setExpandedKeys(root.children.map((c) => c.path));
      }
    } catch (error: any) {
      message.error('加载脚本树失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScriptTree();
  }, [loadScriptTree]);

  const handleSelect = async (keys: React.Key[], info: any) => {
    if (keys.length === 0) {
      setSelectedNode(null);
      setScriptContent('');
      return;
    }

    const node = info.node as TreeNode;
    setSelectedKeys(keys);
    setSelectedNode(node.originalNode);

    if (node.type === 'file') {
      try {
        const content = await getScriptContent(node.path);
        setScriptContent(content);
      } catch (error: any) {
        message.error('加载脚本内容失败: ' + (error.message || '未知错误'));
      }
      return;
    }

    setScriptContent('');
  };

  const handleExpand = (keys: React.Key[]) => {
    setExpandedKeys(keys);
  };

  const handleCreate = (type: 'file' | 'directory', nextParentPath?: string) => {
    setCreateType(type);
    setParentPath(nextParentPath || '');
    createForm.resetFields();
    createForm.setFieldsValue({
      name: '',
      content: type === 'file' ? '' : undefined,
    });
    setCreateModalVisible(true);
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const fullPath = parentPath ? `${parentPath}/${values.name}` : values.name;
      await createScript(fullPath, createType === 'directory', values.content || '');
      message.success(`${createType === 'directory' ? '文件夹' : '文件'}创建成功`);
      setCreateModalVisible(false);
      await loadScriptTree();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('创建失败: ' + (error.message || '未知错误'));
    }
  };

  const handleSave = async () => {
    if (!selectedNode || selectedNode.type !== 'file') return;
    try {
      setSaving(true);
      await updateScript(selectedNode.path, scriptContent);
      message.success('保存成功');
      await loadScriptTree();
    } catch (error: any) {
      message.error('保存失败: ' + (error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (node: ScriptNode) => {
    try {
      await deleteScript(node.path);
      message.success('删除成功');
      if (selectedNode?.path === node.path) {
        setSelectedNode(null);
        setSelectedKeys([]);
        setScriptContent('');
      }
      await loadScriptTree();
    } catch (error: any) {
      message.error('删除失败: ' + (error.message || '未知错误'));
    }
  };

  const handleRename = (node: ScriptNode) => {
    setRenameNode(node);
    renameForm.setFieldsValue({ name: node.name });
    setRenameModalVisible(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameNode) return;

    try {
      const values = await renameForm.validateFields();
      const currentParentPath = renameNode.path.split('/').slice(0, -1).join('/');
      const newPath = currentParentPath ? `${currentParentPath}/${values.name}` : values.name;

      await moveScript(renameNode.path, newPath);
      message.success('重命名成功');
      setRenameModalVisible(false);

      if (selectedNode?.path === renameNode.path) {
        const nextNode = { ...selectedNode, path: newPath, name: values.name };
        setSelectedNode(nextNode);
        setSelectedKeys([newPath]);
      }

      await loadScriptTree();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('重命名失败: ' + (error.message || '未知错误'));
    }
  };

  const getContextMenu = (node: ScriptNode) => (
    <Menu>
      <Menu.Item
        key="new-file"
        icon={<FileAddOutlined />}
        onClick={() => handleCreate('file', node.path)}
      >
        新建文件
      </Menu.Item>
      <Menu.Item
        key="new-folder"
        icon={<FolderAddOutlined />}
        onClick={() => handleCreate('directory', node.path)}
      >
        新建文件夹
      </Menu.Item>
      {node.type === 'directory' && (
        <>
          <Menu.Divider />
          <Menu.Item
            key="rename"
            icon={<EditOutlined />}
            onClick={() => handleRename(node)}
          >
            重命名
          </Menu.Item>
          <Menu.Item
            key="delete"
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(node)}
          >
            删除
          </Menu.Item>
        </>
      )}
      {node.type === 'file' && (
        <>
          <Menu.Divider />
          <Menu.Item
            key="rename"
            icon={<EditOutlined />}
            onClick={() => handleRename(node)}
          >
            重命名
          </Menu.Item>
          <Menu.Item
            key="delete"
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(node)}
          >
            删除
          </Menu.Item>
        </>
      )}
    </Menu>
  );

  const renderTreeNodes = (nodes: TreeNode[]): DataNode[] => {
    return nodes.map((node) => {
      const scriptNode = node.originalNode;
      return {
        ...node,
        title: (
          <Dropdown overlay={getContextMenu(scriptNode)} trigger={['contextMenu']}>
            <span style={{ cursor: 'pointer' }}>
              {scriptNode.type === 'directory' ? (
                <FolderOutlined style={{ marginRight: 8, color: '#1890ff' }} />
              ) : (
                <FileOutlined style={{ marginRight: 8 }} />
              )}
              {scriptNode.name}
            </span>
          </Dropdown>
        ),
        children: node.children ? renderTreeNodes(node.children as TreeNode[]) : undefined,
      } as DataNode;
    });
  };

  return (
    <Layout style={{ height: 'calc(100vh - 200px)', background: '#f5f5f5' }}>
      <Sider
        width={320}
        style={{
          background: '#fff',
          borderRight: '1px solid #e8e8e8',
          boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
        }}
      >
        <Card
          title={
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
              脚本管理
            </span>
          }
          size="small"
          headStyle={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderBottom: 'none',
            padding: '12px 16px',
          }}
          bodyStyle={{ padding: '12px', height: 'calc(100vh - 250px)', overflow: 'auto' }}
          extra={
            <Space>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={loadScriptTree}
                loading={loading}
              />
              <Dropdown
                overlay={
                  <Menu>
                    <Menu.Item
                      key="file"
                      icon={<FileAddOutlined />}
                      onClick={() => handleCreate('file')}
                    >
                      新建文件
                    </Menu.Item>
                    <Menu.Item
                      key="folder"
                      icon={<FolderAddOutlined />}
                      onClick={() => handleCreate('directory')}
                    >
                      新建文件夹
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button type="primary" icon={<PlusOutlined />} size="small">
                  新建
                </Button>
              </Dropdown>
            </Space>
          }
        >
          <Tree
            treeData={renderTreeNodes(treeData)}
            selectedKeys={selectedKeys}
            expandedKeys={expandedKeys}
            onSelect={handleSelect}
            onExpand={handleExpand}
            showLine={{ showLeafIcon: false }}
            blockNode
            style={{
              background: 'transparent',
            }}
          />
        </Card>
      </Sider>
      <Content style={{ padding: '20px', background: '#f5f5f5' }}>
        {selectedNode ? (
          <Card
            title={
              <Space>
                {selectedNode.type === 'directory' ? (
                  <FolderOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                ) : (
                  <FileOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                )}
                <Text strong style={{ fontSize: 16 }}>{selectedNode.name}</Text>
                {selectedNode.type === 'file' && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    ({selectedNode.size} bytes)
                  </Text>
                )}
              </Space>
            }
            extra={selectedNode.type === 'file' ? (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                保存
              </Button>
            ) : undefined}
            bodyStyle={{ padding: 0, height: 'calc(100vh - 250px)', overflow: 'hidden' }}
            style={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {selectedNode.type === 'file' ? (
              <CodeEditor
                value={scriptContent}
                onChange={setScriptContent}
                language={selectedLanguage}
                theme="material"
                height="100%"
              />
            ) : (
              <div
                style={{
                  padding: 48,
                  textAlign: 'center',
                  color: '#999',
                  background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <FolderOutlined style={{ fontSize: 64, marginBottom: 16, color: '#1890ff' }} />
                <div style={{ fontSize: 16 }}>当前选中的是文件夹</div>
              </div>
            )}
          </Card>
        ) : (
          <Card
            style={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              borderRadius: '8px',
              height: 'calc(100vh - 250px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
            }}
          >
            <div style={{ textAlign: 'center', color: '#999' }}>
              <FileOutlined style={{ fontSize: 64, marginBottom: 16, color: '#1890ff' }} />
              <div style={{ fontSize: 16 }}>请从左侧选择一个文件或文件夹</div>
            </div>
          </Card>
        )}
      </Content>

      <Modal
        title={`新建${createType === 'directory' ? '文件夹' : '文件'}`}
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder={`请输入${createType === 'directory' ? '文件夹' : '文件'}名称`} />
          </Form.Item>
          {createType === 'file' && (
            <Form.Item name="content" label="初始内容">
              <Input.TextArea rows={6} placeholder="可选：输入文件初始内容" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="重命名"
        open={renameModalVisible}
        onOk={handleRenameSubmit}
        onCancel={() => setRenameModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item
            name="name"
            label="新名称"
            rules={[{ required: true, message: '请输入新名称' }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default ScriptManager;
