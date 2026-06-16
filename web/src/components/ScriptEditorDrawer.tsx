import React, { useState, useCallback } from 'react';
import { Modal, Space, Button, Tag, Select, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import CodeEditor from './CodeEditor';
import useScriptEditorStore from '../store/useScriptEditorStore';

const THEME_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'dracula', label: 'Dracula' },
];

const ScriptEditorDrawer: React.FC = () => {
  const open = useScriptEditorStore((s) => s.open);
  const name = useScriptEditorStore((s) => s.name);
  const initialContent = useScriptEditorStore((s) => s.content);
  const onSave = useScriptEditorStore((s) => s.onSave);
  const close = useScriptEditorStore((s) => s.close);

  const [content, setContent] = useState(initialContent);
  const [theme, setTheme] = useState<'material' | 'monokai' | 'dracula'>('material');
  const [saving, setSaving] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  React.useEffect(() => {
    if (open) {
      setContent(initialContent);
      setIsDrawerOpen(true);
    } else {
      setIsDrawerOpen(false);
    }
  }, [open, initialContent]);

  const handleSave = useCallback(async () => {
    if (!onSave) {
      message.warning('未配置保存回调');
      return;
    }
    setSaving(true);
    try {
      await onSave(content);
      message.success('保存成功');
    } catch (e: any) {
      message.error('保存失败: ' + (e.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  }, [content, onSave]);

  return (
    <Modal
      title={
        <Space>
          <span>脚本编辑器</span>
          {name && <Tag color="blue">{name}</Tag>}
        </Space>
      }
      width="90vw"
      open={open}
      onCancel={close}
      destroyOnClose
      style={{ top: 20 }}
      bodyStyle={{ height: 'calc(100vh - 120px)', padding: '12px 0' }}
      footer={
        <Space size="middle">
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>语言</span>
          <Tag color="geekblue">Go</Tag>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>主题</span>
          <Select
            value={theme}
            onChange={(v) => setTheme(v as 'material' | 'monokai' | 'dracula')}
            options={THEME_OPTIONS}
            size="small"
            style={{ width: 110 }}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存
          </Button>
        </Space>
      }
    >
      <div style={{ height: '100%' }}>
        <CodeEditor
          key={isDrawerOpen ? 'open' : 'closed'}
          value={content}
          onChange={setContent}
          language="go"
          theme={theme}
          height="100%"
          refreshKey={isDrawerOpen ? 1 : 0}
        />
      </div>
    </Modal>
  );
};

export default ScriptEditorDrawer;
