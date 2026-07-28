import React, { useState, useCallback } from 'react';
import { Modal, Space, Button, Tag, Select, message, Input, Typography } from 'antd';
import { SaveOutlined, ExperimentOutlined, PlayCircleOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import CodeEditor from './CodeEditor';
import useScriptEditorStore from '../store/useScriptEditorStore';
import type { ScriptType } from '../store/useScriptEditorStore';

const THEME_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'dracula', label: 'Dracula' },
];

const { Text, Paragraph } = Typography;

interface TestResult {
  success: boolean;
  output: string;
  console: string;
  error: string;
}

const ScriptEditorDrawer: React.FC = () => {
  const open = useScriptEditorStore((s) => s.open);
  const name = useScriptEditorStore((s) => s.name);
  const initialContent = useScriptEditorStore((s) => s.content);
  const scriptType = useScriptEditorStore((s) => s.scriptType);
  const onSave = useScriptEditorStore((s) => s.onSave);
  const close = useScriptEditorStore((s) => s.close);

  const [content, setContent] = useState(initialContent);
  const [theme, setTheme] = useState<'material' | 'monokai' | 'dracula'>('material');
  const [saving, setSaving] = useState(false);

  // 测试面板状态
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testPayload, setTestPayload] = useState('{"temperature": 25.6, "humidity": 60}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setContent(initialContent);
      setTestPanelOpen(false);
      setTestResult(null);
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

  const canRunTest = scriptType === 'deal' || scriptType === 'forward';

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/script-test/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: scriptType,
          content,
          payload: testPayload,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      // fbr 成功 code 是 200（http.StatusOK），非 0；错误信息字段是 msg（非 message）
      if ((data.code === 0 || data.code === 200) && data.data) {
        setTestResult(data.data);
      } else {
        // 多路径提取错误原因：data.data.error > data.msg > data.message > data.error > HTTP 状态
        const err =
          data.data?.error ||
          data.msg ||
          data.message ||
          data.error ||
          `请求失败（HTTP ${res.status}）`;
        setTestResult({ success: false, output: '', console: '', error: err });
      }
    } catch (e: any) {
      setTestResult({ success: false, output: '', console: '', error: '网络错误: ' + (e.message || String(e)) });
    } finally {
      setTesting(false);
    }
  }, [scriptType, content, testPayload]);

  const testPanelHeight = scriptType === 'listener' ? 220 : 340;

  return (
    <Modal
      title={
        <Space>
          <span>脚本编辑器</span>
          {name && <Tag color="blue">{name}</Tag>}
          {scriptType !== 'unknown' && (
            <Tag color={scriptType === 'deal' ? 'green' : scriptType === 'forward' ? 'orange' : 'purple'}>
              {scriptType === 'deal' ? 'Deal' : scriptType === 'forward' ? 'Forward' : 'Listener'}
            </Tag>
          )}
        </Space>
      }
      width="90vw"
      open={open}
      onCancel={close}
      destroyOnClose
      style={{ top: 20 }}
      bodyStyle={{ height: 'calc(100vh - 120px)', padding: '12px 0', display: 'flex', flexDirection: 'column' }}
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
            icon={testPanelOpen ? <CaretDownOutlined /> : <CaretRightOutlined />}
            onClick={() => setTestPanelOpen(!testPanelOpen)}
          >
            测试
          </Button>
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
      {/* 代码编辑器区域 */}
      <div style={{ flex: 1, minHeight: 0, transition: 'flex 0.3s' }}>
        <CodeEditor
          value={content}
          onChange={setContent}
          language="go"
          theme={theme}
          height="100%"
        />
      </div>

      {/* 测试折叠面板 */}
      {testPanelOpen && (
        <div
          style={{
            flexShrink: 0,
            height: testPanelHeight,
            borderTop: '1px solid var(--line)',
            padding: '12px 16px',
            overflow: 'auto',
            background: 'var(--paper-2, #fafafa)',
          }}
        >
          <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <ExperimentOutlined />
              <Text strong>
                {scriptType === 'listener' ? '编译 & 签名校验' : '运行测试'}
              </Text>
            </Space>
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={testing}
              onClick={handleTest}
            >
              {scriptType === 'listener' ? '校验' : '运行'}
            </Button>
          </Space>

          {canRunTest && (
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>测试 Payload</Text>
              <Input.TextArea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={3}
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, marginTop: 4 }}
                placeholder='输入测试数据，例如: {"key": "value"}'
              />
            </div>
          )}

          {testResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 运行结果 */}
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-sm, 4px)',
                  background: testResult.success ? 'rgba(82, 196, 26, 0.06)' : 'rgba(245, 34, 45, 0.06)',
                  border: `1px solid ${testResult.success ? 'rgba(82, 196, 26, 0.3)' : 'rgba(245, 34, 45, 0.3)'}`,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflow: 'auto',
                }}
              >
                {testResult.success ? (
                  <><Tag color="success" style={{ marginBottom: 4 }}>成功</Tag>{'\n'}{testResult.output}</>
                ) : (
                  <><Tag color="error" style={{ marginBottom: 4 }}>失败</Tag>{'\n'}{testResult.error}</>
                )}
              </div>

              {/* 终端输出 */}
              {testResult.console && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm, 4px)',
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                    color: '#d4d4d4',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  <div style={{ marginBottom: 4, color: '#888', fontSize: 11 }}>终端输出</div>
                  {testResult.console}
                </div>
              )}
            </div>
          )}

          {scriptType === 'unknown' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前脚本类型未知，不支持测试。请从数据流画布或对应管理页打开脚本编辑器。
            </Text>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ScriptEditorDrawer;
