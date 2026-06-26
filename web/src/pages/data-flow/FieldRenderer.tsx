import React from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { FieldSpec } from './fieldSchema';
import ScriptFormField from '../../components/ScriptFormField';

interface Props {
  spec: FieldSpec;
  form: any;
}

// 按 FieldSpec.type 渲染对应 Form.Item + 控件
export const FieldRenderer: React.FC<Props> = ({ spec, form }) => {
  const rules = spec.required ? [{ required: true, message: `请输入${spec.label}` }] : undefined;
  switch (spec.type) {
    case 'number':
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <InputNumber
            min={spec.min}
            max={spec.max}
            placeholder={spec.placeholder}
            style={{ width: '100%' }}
          />
        </Form.Item>
      );
    case 'switch':
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} valuePropName="checked" tooltip={spec.tooltip}>
          <Switch />
        </Form.Item>
      );
    case 'select':
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <Select
            allowClear
            placeholder={spec.placeholder}
            options={(spec.options || []).map(o => ({ value: o, label: o || '(空)' }))}
          />
        </Form.Item>
      );
    case 'password':
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <Input.Password placeholder={spec.placeholder} />
        </Form.Item>
      );
    case 'textarea':
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <Input.TextArea rows={4} placeholder={spec.placeholder} />
        </Form.Item>
      );
    case 'script':
      return (
        <ScriptFormField
          key={spec.key}
          form={form}
          name={spec.key}
          label={spec.label}
          required={spec.required}
          tooltip={spec.tooltip}
          buttonText="编辑脚本"
          placeholder={spec.placeholder}
          initialScript={spec.default || ''}
        />
      );
    case 'pluginParams':
      // 横切阶段占位：listener 用不到，chain 阶段接入 PluginParamRenderer
      return (
        <Form.Item key={spec.key} label={spec.label} tooltip={spec.tooltip}>
          <span style={{ color: '#999' }}>插件参数编辑将在处理器链模块阶段启用</span>
        </Form.Item>
      );
    case 'string':
    default:
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <Input placeholder={spec.placeholder} />
        </Form.Item>
      );
  }
};
