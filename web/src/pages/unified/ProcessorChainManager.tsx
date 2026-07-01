import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, CodeOutlined } from '@ant-design/icons';
import TopicLink from '../../components/TopicLink';
import useScriptEditorStore from '../../store/useScriptEditorStore';
import { listPluginsByType, type PluginInfo, type PluginParamSpec } from '../../services/pluginApi';
import {
  PROCESSOR_TYPES,
  findProcessorType,
  buildDefaultConfig,
  parseSingleProcessor,
  serializeSingleProcessor,
} from '../data-flow/processorSchema';

const API_BASE = '/api';

// 容器类型：脚本链 / 内置处理器链 / 插件处理器链
// 与数据流可视化页面保持一致
const CHAIN_KIND_SCRIPT = 'script_chain';
const CHAIN_KIND_BUILTIN = 'chain';
const CHAIN_KIND_PLUGIN = 'plugin_chain';
const CHAIN_KIND_OPTIONS = [
  { value: CHAIN_KIND_SCRIPT, label: '脚本处理器链' },
  { value: CHAIN_KIND_BUILTIN, label: '内置处理器链' },
  { value: CHAIN_KIND_PLUGIN, label: '插件处理器链' },
];

// 与 AGENTS.md 第 1 条一致：script 处理器函数名固定 Deal，返回 map[string]any
const DEFAULT_PROCESS_SCRIPT = `package main

func Deal(payload []byte) (map[string]any, error) {
	return map[string]any{
		"": payload,
	}, nil
}
`;

interface ProcessorItem {
  id: number;
  name: string;
  topic: string;
  out_topic?: string;
  processors: string;
  enable: boolean;
}

// 从 processors 推断容器类型
const detectChainKind = (processorsRaw?: string): string => {
  const parsed = parseSingleProcessor(processorsRaw);
  if (parsed?.key === 'script') return CHAIN_KIND_SCRIPT;
  if (parsed?.key === 'plugin') return CHAIN_KIND_PLUGIN;
  return CHAIN_KIND_BUILTIN;
};

// 从 processors 提取脚本内容
const extractScript = (raw?: string): string => {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_PROCESS_SCRIPT;
    const item = arr[0];
    const cfg = typeof item.config === 'string' ? JSON.parse(item.config) : (item.config || {});
    return cfg.script || DEFAULT_PROCESS_SCRIPT;
  } catch {
    return DEFAULT_PROCESS_SCRIPT;
  }
};

// 内置处理器的配置表单（与数据流页面 InlineEditPanel 一致）
const BuiltinProcessorFields: React.FC<{
  processorKey: string;
  config: Record<string, any>;
  onConfigChange: (cfg: Record<string, any>) => void;
}> = ({ processorKey, config, onConfigChange }) => {
  const spec = findProcessorType(processorKey);
  if (!spec) return null;
  if (spec.fields.length === 0) {
    return <div style={{ color: '#8c8c8c', fontSize: 12 }}>该处理器无可配置参数</div>;
  }
  return (
    <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4 }}>
      {spec.fields.map((f) => (
        <Form.Item key={f.key} label={f.label} tooltip={f.tooltip} required={f.required} style={{ marginBottom: 8 }}>
          {f.type === 'switch' ? (
            <Switch
              checked={!!config[f.key]}
              onChange={(checked) => onConfigChange({ ...config, [f.key]: checked })}
            />
          ) : f.type === 'textarea' || f.type === 'json' ? (
            <Input.TextArea
              rows={3}
              placeholder={f.placeholder || (f.type === 'json' ? '{}' : '')}
              value={
                f.type === 'json' && config[f.key] && typeof config[f.key] === 'object'
                  ? JSON.stringify(config[f.key], null, 2)
                  : (config[f.key] ?? '')
              }
              onChange={(e) => onConfigChange({ ...config, [f.key]: e.target.value })}
            />
          ) : (
            <Input
              placeholder={f.placeholder}
              value={config[f.key] ?? ''}
              onChange={(e) => onConfigChange({ ...config, [f.key]: e.target.value })}
            />
          )}
        </Form.Item>
      ))}
    </div>
  );
};

const ProcessorChainManager: React.FC = () => {
  const [list, setList] = useState<ProcessorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<ProcessorItem | null>(null);
  const [form] = Form.useForm();
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);

  // 内置处理器链：选中的处理器类型 + 配置
  const [builtinKey, setBuiltinKey] = useState<string>('');
  const [builtinConfig, setBuiltinConfig] = useState<Record<string, any>>({});
  // 脚本链：脚本草稿
  const [scriptDraft, setScriptDraft] = useState<string>('');
  // 插件链：插件名 + 参数 + 插件列表
  const [pluginName, setPluginName] = useState<string>('');
  const [pluginParams, setPluginParams] = useState<Record<string, any>>({});
  const [processorPlugins, setProcessorPlugins] = useState<PluginInfo[]>([]);

  const currentPluginSpecs: PluginParamSpec[] = (() => {
    const p = processorPlugins.find((p) => p.name === pluginName);
    return p?.params || [];
  })();

  const fetchProcessorPlugins = useCallback(async () => {
    try {
      const data = await listPluginsByType('processor');
      setProcessorPlugins(data || []);
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => { fetchProcessorPlugins(); }, [fetchProcessorPlugins]);

  const selectedKind = Form.useWatch('kind', form) as string | undefined;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/processor_chain/list`);
      const data = await res.json();
      setList(data.data || []);
    } catch {
      message.error('获取列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const resetForm = useCallback(() => {
    form.resetFields();
    setBuiltinKey('');
    setBuiltinConfig({});
    setScriptDraft('');
    setPluginName('');
    setPluginParams({});
  }, [form]);

  const handleCreate = () => {
    setEditItem(null);
    resetForm();
    form.setFieldsValue({ kind: CHAIN_KIND_SCRIPT, enable: false });
    setModalVisible(true);
  };

  const handleEdit = (record: ProcessorItem) => {
    setEditItem(record);
    const kind = detectChainKind(record.processors);
    form.setFieldsValue({
      name: record.name,
      topic: record.topic,
      out_topic: record.out_topic || '',
      enable: record.enable,
      kind,
    });
    setScriptDraft('');
    if (kind === CHAIN_KIND_BUILTIN) {
      const parsed = parseSingleProcessor(record.processors);
      if (parsed && parsed.key !== 'script' && parsed.key !== 'plugin') {
        setBuiltinKey(parsed.key);
        setBuiltinConfig(parsed.config || buildDefaultConfig(parsed.key));
      } else {
        setBuiltinKey('');
        setBuiltinConfig({});
      }
      setPluginName('');
      setPluginParams({});
    } else if (kind === CHAIN_KIND_PLUGIN) {
      const parsed = parseSingleProcessor(record.processors);
      setPluginName(parsed?.config?.plugin_name || '');
      setPluginParams(parsed?.config?.params || {});
      setBuiltinKey('');
      setBuiltinConfig({});
    } else {
      setBuiltinKey('');
      setBuiltinConfig({});
      setPluginName('');
      setPluginParams({});
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 序列化 processors
      let processors: string;
      if (values.kind === CHAIN_KIND_SCRIPT) {
        const script = scriptDraft || (editItem ? extractScript(editItem.processors) : DEFAULT_PROCESS_SCRIPT);
        processors = JSON.stringify([{ key: 'script', config: JSON.stringify({ script }) }]);
      } else if (values.kind === CHAIN_KIND_PLUGIN) {
        if (!pluginName) {
          message.error('请选择插件');
          return;
        }
        processors = JSON.stringify([{ key: 'plugin', config: JSON.stringify({ plugin_name: pluginName, params: pluginParams }) }]);
      } else {
        // 内置链：必须选了处理器类型
        if (!builtinKey) {
          message.error('请选择处理器类型');
          return;
        }
        // JSON 字段：把字符串解析回对象
        const spec = findProcessorType(builtinKey);
        const finalConfig: Record<string, any> = { ...builtinConfig };
        if (spec) {
          for (const f of spec.fields) {
            if (f.type === 'json' && typeof finalConfig[f.key] === 'string' && finalConfig[f.key].trim() !== '') {
              try {
                finalConfig[f.key] = JSON.parse(finalConfig[f.key]);
              } catch {
                message.error(`字段「${f.label}」不是合法 JSON`);
                return;
              }
            }
          }
        }
        processors = serializeSingleProcessor(builtinKey, finalConfig);
      }

      const payload = {
        id: editItem?.id,
        name: values.name,
        topic: values.topic || '',
        out_topic: values.out_topic || '',
        processors,
        enable: values.enable ?? false,
      };

      const url = editItem ? `${API_BASE}/processor_chain/update` : `${API_BASE}/processor_chain/create`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.code === 0 || data.code === 200) {
        message.success(editItem ? '更新成功' : '创建成功');
        setModalVisible(false);
        fetchList();
      } else {
        message.error(data.msg || '操作失败');
      }
    } catch {
      // 校验失败
    }
  };

  const handleToggle = async (record: ProcessorItem, enable: boolean) => {
    try {
      const url = enable ? `${API_BASE}/processor_chain/enable` : `${API_BASE}/processor_chain/disable`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      message.success(enable ? '已启用' : '已禁用');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/processor_chain/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      message.success('删除成功');
      fetchList();
    } catch {
      message.error('删除失败');
    }
  };

  // 列表内「编辑脚本」按钮：直接打开脚本编辑器抽屉，保存后写入数据库
  const handleEditScriptInline = async (record: ProcessorItem) => {
    const current = extractScript(record.processors);
    openScriptEditor({
      name: record.name,
      content: current,
      language: 'go',
      onSave: async (content) => {
        const payload = {
          id: record.id,
          name: record.name,
          topic: record.topic,
          out_topic: record.out_topic || '',
          processors: JSON.stringify([{ key: 'script', config: JSON.stringify({ script: content }) }]),
          enable: record.enable,
        };
        const res = await fetch(`${API_BASE}/processor_chain/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.code !== 0 && data.code !== 200) {
          throw new Error(data.msg || '保存失败');
        }
        fetchList();
      },
    });
  };

  // 弹窗内「编辑脚本」按钮：写入草稿，提交时一并保存
  const handleEditScriptInModal = () => {
    const current = scriptDraft || (editItem ? extractScript(editItem.processors) : DEFAULT_PROCESS_SCRIPT);
    openScriptEditor({
      name: editItem?.name || '新处理器链',
      content: current,
      language: 'go',
      onSave: (content) => {
        setScriptDraft(content);
        message.success('脚本已更新，点击「确定」保存生效');
      },
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      key: 'kind',
      width: 130,
      render: (_: any, record: ProcessorItem) => {
        const kind = detectChainKind(record.processors);
        if (kind === CHAIN_KIND_SCRIPT) return <Tag color="orange">脚本链</Tag>;
        if (kind === CHAIN_KIND_PLUGIN) {
          const parsed = parseSingleProcessor(record.processors);
          const name = parsed?.config?.plugin_name || '-';
          return <Tag color="purple">插件: {name}</Tag>;
        }
        const parsed = parseSingleProcessor(record.processors);
        const name = findProcessorType(parsed?.key || '')?.name || parsed?.key || '-';
        return <Tag color="blue">{name}</Tag>;
      },
    },
    {
      title: '订阅 Topic',
      dataIndex: 'topic',
      key: 'topic',
      render: (t: string) => <TopicLink topic={t} color="green" emptyText="-" />,
    },
    {
      title: '发布 Topic',
      dataIndex: 'out_topic',
      key: 'out_topic',
      render: (t: string) => <TopicLink topic={t || ''} color="blue" emptyText="沿用原 Topic" />,
    },
    {
      title: '状态',
      dataIndex: 'enable',
      key: 'enable',
      width: 80,
      render: (e: boolean, r: ProcessorItem) => <Switch checked={e} onChange={(v) => handleToggle(r, v)} size="small" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: ProcessorItem) => {
        const isScript = detectChainKind(record.processors) === CHAIN_KIND_SCRIPT;
        return (
          <Space>
            {isScript && (
              <Button type="link" size="small" icon={<CodeOutlined />} onClick={() => handleEditScriptInline(record)}>
                编辑脚本
              </Button>
            )}
            <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
            <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3>处理器链</h3>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editItem ? '编辑处理器链' : '新建处理器链'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={640}
        okText={editItem ? '保存' : '创建'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：温度数据过滤" />
          </Form.Item>
          <Form.Item name="kind" label="容器类型" rules={[{ required: true, message: '请选择容器类型' }]} tooltip="脚本链用 Deal 函数处理消息；内置链选择一个内置处理器">
            <Select
              options={CHAIN_KIND_OPTIONS}
              onChange={(value) => {
                // 切换类型时清空对应草稿
                if (value === CHAIN_KIND_SCRIPT) {
                  setBuiltinKey('');
                  setBuiltinConfig({});
                  setPluginName('');
                  setPluginParams({});
                } else if (value === CHAIN_KIND_PLUGIN) {
                  setBuiltinKey('');
                  setBuiltinConfig({});
                  setScriptDraft('');
                } else {
                  setScriptDraft('');
                  setPluginName('');
                  setPluginParams({});
                }
              }}
            />
          </Form.Item>
          <Form.Item name="topic" label="订阅 Topic" rules={[{ required: true, message: '请输入订阅 Topic' }]}>
            <Input placeholder="例如：device.temp.raw" />
          </Form.Item>
          <Form.Item name="out_topic" label="发布 Topic" tooltip="处理完成后默认发布到此 topic；留空则沿用处理器内部返回或原 topic">
            <Input placeholder="例如：device.temp.cleaned" />
          </Form.Item>

          {selectedKind === CHAIN_KIND_SCRIPT && (
            <>
              <div style={{ marginBottom: 8, color: '#8c8c8c', fontSize: 12 }}>
                脚本处理器链：通过 Deal 函数处理消息，支持多 topic 输出。点击下方按钮编辑脚本。
              </div>
              <Button icon={<CodeOutlined />} onClick={handleEditScriptInModal} block>
                {scriptDraft ? '编辑脚本（已编辑）' : '编辑脚本'}
              </Button>
              {!scriptDraft && !editItem && (
                <div style={{ marginTop: 4, color: '#faad14', fontSize: 12 }}>
                  未编辑脚本将使用默认模板创建
                </div>
              )}
            </>
          )}

          {selectedKind === CHAIN_KIND_BUILTIN && (
            <>
              <Form.Item label="处理器类型" required tooltip="一个容器只选一个处理器；多个处理请在数据流上串联多个容器">
                <Select
                  placeholder="选择内置处理器"
                  value={builtinKey || undefined}
                  onChange={(key) => {
                    setBuiltinKey(key);
                    setBuiltinConfig(buildDefaultConfig(key));
                  }}
                  options={PROCESSOR_TYPES.map((p) => ({ label: p.name, value: p.key }))}
                />
              </Form.Item>
              {builtinKey && (
                <BuiltinProcessorFields
                  processorKey={builtinKey}
                  config={builtinConfig}
                  onConfigChange={setBuiltinConfig}
                />
              )}
            </>
          )}

          {selectedKind === CHAIN_KIND_PLUGIN && (
            <>
              <Form.Item label="处理器插件" required tooltip="选择已加载的 processor 类型插件；参数依据插件定义动态生成">
                <Select
                  placeholder="选择处理器插件"
                  value={pluginName || undefined}
                  onChange={(name) => {
                    setPluginName(name);
                    const p = processorPlugins.find((x) => x.name === name);
                    const defaults: Record<string, any> = {};
                    for (const spec of p?.params || []) {
                      defaults[spec.key] = spec.default;
                    }
                    setPluginParams(defaults);
                  }}
                  options={processorPlugins.map((p) => ({ label: p.display || p.name, value: p.name }))}
                  notFoundContent={processorPlugins.length === 0 ? '暂无已加载的 processor 插件' : undefined}
                />
              </Form.Item>
              {pluginName && currentPluginSpecs.length > 0 && (
                <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4 }}>
                  {currentPluginSpecs.map((spec) => {
                    const label = spec.label || spec.key;
                    const val = pluginParams[spec.key];
                    const onChange = (v: any) => setPluginParams({ ...pluginParams, [spec.key]: v });
                    switch (spec.type) {
                      case 'int':
                      case 'number':
                      case 'float':
                        return (
                          <Form.Item key={spec.key} label={label} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                            <InputNumber
                              value={val}
                              min={spec.min !== undefined ? spec.min : undefined}
                              max={spec.max !== undefined ? spec.max : undefined}
                              onChange={(v) => onChange(v)}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        );
                      case 'bool':
                        return (
                          <Form.Item key={spec.key} label={label} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                            <Switch checked={!!val} onChange={onChange} />
                          </Form.Item>
                        );
                      case 'select':
                        return (
                          <Form.Item key={spec.key} label={label} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                            <Select value={val} onChange={onChange} options={(spec.options || []).map((o) => ({ value: o, label: o }))} allowClear />
                          </Form.Item>
                        );
                      case 'string':
                      default:
                        return (
                          <Form.Item key={spec.key} label={label} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                            <Input value={val ?? ''} onChange={(e) => onChange(e.target.value)} />
                          </Form.Item>
                        );
                    }
                  })}
                </div>
              )}
              {pluginName && currentPluginSpecs.length === 0 && (
                <div style={{ color: '#8c8c8c', fontSize: 12 }}>该插件没有可配置的参数</div>
              )}
            </>
          )}

          <Form.Item name="enable" label="启用状态" valuePropName="checked" style={{ marginTop: 12 }}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProcessorChainManager;
