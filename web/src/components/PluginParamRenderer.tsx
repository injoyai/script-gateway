import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Spin, Empty } from 'antd';
import { listPluginsByType, type PluginInfo, type PluginParamSpec } from '../services/pluginApi';

interface Props {
  pluginType: string;              // 'processor' | 'decoder' | 'pusher' | ...
  form: any;
  namePrefix?: (string | number)[]; // 表单字段路径前缀，默认 ['plugin_params']
  selectedName?: string;          // 当前选中的插件名
}

// 插件参数动态渲染：基于后端 PluginParamSpec 生成表单控件
// 横切阶段抽取自 ProcessorChainManager，供后续 chain 模块阶段复用
export const PluginParamRenderer: React.FC<Props> = ({ pluginType, namePrefix = ['plugin_params'], selectedName }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listPluginsByType(pluginType)
      .then(list => { setPlugins(list || []); })
      .catch(() => { setPlugins([]); })
      .finally(() => { setLoading(false); });
  }, [pluginType]);

  const specs = useMemo<PluginParamSpec[]>(() => {
    const found = plugins.find(p => p.name === selectedName);
    return found?.params || [];
  }, [selectedName, plugins]);

  if (loading) {
    return <Spin size="small" />;
  }
  if (!selectedName) {
    return <Empty description="请先选择插件" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  if (specs.length === 0) {
    return <Empty description="该插件无可配置参数" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <>
      {specs.map(spec => {
        const label = spec.label || spec.key;
        const rules = spec.required ? [{ required: true, message: `请输入${label}` }] : undefined;
        const fieldName = [...namePrefix, spec.key];
        switch (spec.type) {
          case 'int':
          case 'number':
          case 'float':
            return (
              <Form.Item
                key={spec.key}
                name={fieldName}
                label={label}
                rules={rules}
                tooltip={spec.description}
              >
                <InputNumber
                  min={spec.min !== undefined ? spec.min : undefined}
                  max={spec.max !== undefined ? spec.max : undefined}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            );
          case 'bool':
            return (
              <Form.Item
                key={spec.key}
                name={fieldName}
                label={label}
                valuePropName="checked"
                tooltip={spec.description}
              >
                <Switch />
              </Form.Item>
            );
          case 'select':
            return (
              <Form.Item
                key={spec.key}
                name={fieldName}
                label={label}
                rules={rules}
                tooltip={spec.description}
              >
                <Select
                  allowClear
                  options={(spec.options || []).map(o => ({ value: o, label: o }))}
                />
              </Form.Item>
            );
          case 'string':
          default:
            return (
              <Form.Item
                key={spec.key}
                name={fieldName}
                label={label}
                rules={rules}
                tooltip={spec.description}
              >
                <Input />
              </Form.Item>
            );
        }
      })}
    </>
  );
};
