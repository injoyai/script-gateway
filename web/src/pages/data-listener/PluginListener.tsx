import React, { useCallback, useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Tag } from 'antd';
import ListenerCrudPage, { ListenerItem, TopicColumn, OutTopicColumn } from '../../components/ListenerCrudPage';
import { listPluginsByType, type PluginInfo } from '../../services/pluginApi';

// 插件监听器：选择已加载的 listener 类型插件，参数依据插件定义动态生成
const PluginListenerPage: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);

  const fetchPlugins = useCallback(async () => {
    try {
      const data = await listPluginsByType('listener');
      setPlugins(data || []);
    } catch (e: any) {
      console.error('[PluginListener] 加载 listener 插件列表失败:', e);
      setPlugins([]);
    }
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const findPlugin = (name: string) => plugins.find((p) => p.name === name);

  return (
    <ListenerCrudPage
      endpoint="listener-conn"
      type="plugin"
      title="插件监听管理"
      addButtonText="添加插件监听"
      modalWidth={680}
      getInitialValues={() => ({ enable: false })}
      getEditFields={(record) => ({
        plugin_name: record.plugin_name || '',
        params: record.params || {},
      })}
      columns={[
        { title: '服务名称', dataIndex: 'name', key: 'name' },
        {
          title: '插件',
          key: 'plugin_name',
          render: (_: any, r: ListenerItem) => <Tag color="purple">{r.plugin_name || '-'}</Tag>,
        },
        TopicColumn,
        OutTopicColumn,
      ]}
      renderExtraFields={() => (
        <>
          <Form.Item name="plugin_name" label="监听插件" rules={[{ required: true, message: '请选择插件' }]} tooltip="选择已加载的 listener 类型插件">
            <Select
              placeholder="选择监听插件"
              options={plugins.map((p) => ({ value: p.name, label: p.display || p.name }))}
              notFoundContent={plugins.length === 0 ? '暂无已加载的 listener 插件' : undefined}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const name = getFieldValue('plugin_name');
              const p = findPlugin(name);
              const specs = p?.params || [];
              if (!name) return null;
              if (specs.length === 0) {
                return <div style={{ color: '#8c8c8c', fontSize: 12 }}>该插件没有可配置的参数</div>;
              }
              return (
                <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4 }}>
                  {specs.map((spec) => {
                    const label = spec.label || spec.key;
                    const rules = spec.required ? [{ required: true, message: `请输入${label}` }] : [];
                    switch (spec.type) {
                      case 'int':
                      case 'number':
                      case 'float':
                        return (
                          <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description} style={{ marginBottom: 8 }}>
                            <InputNumber min={spec.min} max={spec.max} style={{ width: '100%' }} />
                          </Form.Item>
                        );
                      case 'bool':
                        return (
                          <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description} valuePropName="checked" style={{ marginBottom: 8 }}>
                            <Switch />
                          </Form.Item>
                        );
                      case 'select':
                        return (
                          <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description} style={{ marginBottom: 8 }}>
                            <Select options={(spec.options || []).map((o) => ({ value: o, label: o }))} allowClear />
                          </Form.Item>
                        );
                      case 'string':
                      default:
                        return (
                          <Form.Item key={spec.key} name={['params', spec.key]} label={label} rules={rules} tooltip={spec.description} style={{ marginBottom: 8 }}>
                            <Input />
                          </Form.Item>
                        );
                    }
                  })}
                </div>
              );
            }}
          </Form.Item>
        </>
      )}
    />
  );
};

export default PluginListenerPage;
