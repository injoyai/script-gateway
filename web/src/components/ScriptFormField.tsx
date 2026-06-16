import React from 'react';
import { Button, Form, Space, Tag, Typography } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import useScriptEditorStore from '../store/useScriptEditorStore';

interface ScriptFormFieldProps {
  form: any;
  name: string;
  label: React.ReactNode;
  required?: boolean;
  tooltip?: React.ReactNode;
  buttonText?: string;
  placeholder?: string;
  initialScript?: string;
}

const ScriptFormField: React.FC<ScriptFormFieldProps> = ({
  form,
  name,
  label,
  required = false,
  tooltip,
  buttonText = '编辑脚本',
  placeholder,
  initialScript = '',
}) => {
  const openEditor = useScriptEditorStore((s) => s.openEditor);
  const value = Form.useWatch(name, form) || '';
  const hasValue = String(value).trim().length > 0;

  const handleOpen = () => {
    const current = form.getFieldValue(name);
    openEditor({
      name: typeof label === 'string' ? label : String(name),
      content: current || initialScript || '',
      language: 'go',
      onSave: async (content) => {
        form.setFieldValue(name, content);
      },
    });
  };

  return (
    <>
      <Form.Item name={name} hidden rules={required ? [{ required: true, message: `请编辑${typeof label === 'string' ? label : '脚本'}` }] : undefined}>
        <input />
      </Form.Item>
      <Form.Item label={label} tooltip={tooltip} required={required}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Button icon={<CodeOutlined />} onClick={handleOpen}>
              {buttonText}
            </Button>
            <Tag color={hasValue ? 'success' : 'default'}>{hasValue ? '已配置' : '未配置'}</Tag>
            <Typography.Text type="secondary">{String(value).length} 字符</Typography.Text>
          </Space>
          {placeholder && !hasValue && (
            <Typography.Text type="secondary">{placeholder}</Typography.Text>
          )}
        </Space>
      </Form.Item>
    </>
  );
};

export default ScriptFormField;
