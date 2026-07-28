import React from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { FieldSpec } from './fieldSchema';
import ScriptFormField from '../../components/ScriptFormField';
import { PluginParamRenderer, PluginSelect } from '../../components/PluginParamRenderer';

interface Props {
  spec: FieldSpec;
  form: any;
}

// 按 FieldSpec.type 渲染对应 Form.Item + 控件
export const FieldRenderer: React.FC<Props> = ({ spec, form }) => {
  const rules = spec.required ? [{ required: true, message: `请输入${spec.label}` }] : undefined;
  const pluginName = Form.useWatch('plugin_name', form);
  const framingMode = Form.useWatch('framing_mode', form);
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
            mode={spec.multi ? 'multiple' : undefined}
            allowClear
            placeholder={spec.placeholder || '请选择'}
            options={(spec.options || []).map(o => ({ value: o, label: o === '' ? '(空)' : String(o) }))}
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
      return (
        <Form.Item key={spec.key} label={spec.label} tooltip={spec.tooltip}>
          <PluginParamRenderer
            pluginType={spec.pluginType || 'listener'}
            form={form}
            namePrefix={['params']}
            selectedName={pluginName}
          />
        </Form.Item>
      );
    case 'framing':
      return (
        <div key={spec.key}>
          <Form.Item name="framing_mode" label="分包模式" tooltip={spec.tooltip || '处理流式数据粘包；留空表示不分包'}>
            <Select allowClear placeholder="不分包" options={[
              { value: 'delimiter', label: '分隔符' },
              { value: 'fixed_length', label: '定长' },
              { value: 'length_field', label: '长度字段' },
            ]} />
          </Form.Item>
          {framingMode === 'delimiter' && (
            <Form.Item name="framing_delimiter" label="分隔符" tooltip="支持 \r \n \t 转义">
              <Input placeholder="\r\n" />
            </Form.Item>
          )}
          {framingMode === 'fixed_length' && (
            <Form.Item name="framing_length" label="定长长度">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="例如：16" />
            </Form.Item>
          )}
          {framingMode === 'length_field' && (
            <>
              <Form.Item name="framing_offset" label="偏移量" tooltip="长度字段在帧中的起始偏移">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
              <Form.Item name="framing_size" label="长度字段尺寸" tooltip="1/2/4 字节">
                <Select options={[{ value: 1, label: '1 字节' }, { value: 2, label: '2 字节' }, { value: 4, label: '4 字节' }]} />
              </Form.Item>
              <Form.Item name="framing_endian" label="字节序">
                <Select options={[{ value: 'big', label: '大端' }, { value: 'little', label: '小端' }]} />
              </Form.Item>
              <Form.Item name="framing_include_header" label="长度含头部" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
        </div>
      );
    case 'string':
    default:
      if (spec.key === 'plugin_name' && spec.pluginType) {
        return (
          <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
            <PluginSelect pluginType={spec.pluginType} placeholder={spec.placeholder || '选择监听插件'} />
          </Form.Item>
        );
      }
      return (
        <Form.Item key={spec.key} name={spec.key} label={spec.label} rules={rules} tooltip={spec.tooltip}>
          <Input placeholder={spec.placeholder} />
        </Form.Item>
      );
  }
};
