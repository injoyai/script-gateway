import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import TopicLink from '../../components/TopicLink';
import CodeEditor from '../../components/CodeEditor';

const API_BASE = '/api';
const SIMPLE_MODE = 'simple';
const ADVANCED_MODE = 'advanced';
const { Text } = Typography;

interface ProcessorItem {
  id: number;
  name: string;
  topic: string;
  processors: string;
  enable: boolean;
}

interface ProcessorConfigItem {
  key: string;
  config?: string;
}

interface VisualProcessorNode {
  id: string;
  key: string;
  config: Record<string, any>;
}

const DEFAULT_PROCESS_SCRIPT = `package main

// Process 处理订阅到的消息
// 返回值依次为：
//   newPayload  处理后的数据，传 nil 表示不修改
//   newTopic    处理后的目标 topic，传空串表示不修改
//   newMetadata 处理后的元数据，传 nil 表示不修改
//   pass        false 表示丢弃该消息
//   err         处理错误
func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, metadata, true, nil
}
`;

const SIMPLE_PROCESSOR_OPTIONS = [
  { value: 'json_format', label: 'JSON格式化' },
  { value: 'json_extract', label: 'JSON提取' },
  { value: 'json_filter', label: 'JSON过滤' },
  { value: 'text_replace', label: '文本替换' },
  { value: 'text_regex_filter', label: '正则过滤' },
  { value: 'field_map', label: '字段映射' },
  { value: 'dlt645', label: 'DLT645协议' },
  { value: 'modbus_rtu', label: 'Modbus RTU协议' },
  { value: 'script', label: '自定义脚本' },
];

const createNodeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultNode = (key = 'script'): VisualProcessorNode => ({
  id: createNodeId(),
  key,
  config: key === 'script' ? { script: DEFAULT_PROCESS_SCRIPT, topic: '' } : { topic: '' },
});

const parseProcessors = (raw?: string): ProcessorConfigItem[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseConfig = (raw?: string) => {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

const parseProcessorNodes = (raw?: string): VisualProcessorNode[] => {
  const items = parseProcessors(raw);
  if (!items.length) return [];
  return items.map((item) => ({
    id: createNodeId(),
    key: item.key,
    config: parseConfig(item.config),
  }));
};

const buildProcessorItems = (nodes: VisualProcessorNode[]): ProcessorConfigItem[] => {
  return nodes.map((node) => ({
    key: node.key,
    config: JSON.stringify(node.config || {}),
  }));
};

const parseFieldMapping = (raw: string) => {
  const mapping: Record<string, string> = {};
  raw.split('\n').map(line => line.trim()).filter(Boolean).forEach((line) => {
    const [from, to] = line.split('=').map(item => item.trim());
    if (from && to) mapping[from] = to;
  });
  return mapping;
};

const mappingToText = (mapping?: Record<string, string>) => {
  if (!mapping) return '';
  return Object.entries(mapping).map(([from, to]) => `${from}=${to}`).join('\n');
};

const detectMode = (processors: ProcessorConfigItem[]) => processors.length <= 1 ? SIMPLE_MODE : ADVANCED_MODE;

const getProcessorSummary = (processors: ProcessorConfigItem[]) => {
  if (!processors.length) return '-';
  return processors.map(item => item.key).join(' -> ');
};

const getOutputTopic = (processors: ProcessorConfigItem[]) => {
  for (const item of processors) {
    const cfg = parseConfig(item.config);
    if (cfg.topic) return cfg.topic;
  }
  return '';
};

const buildSimpleProcessor = (values: Record<string, any>): ProcessorConfigItem[] => {
  const outTopic = values.out_topic || '';
  switch (values.processor_key) {
    case 'json_format':
      return [{ key: 'json_format', config: JSON.stringify({ pretty: values.json_pretty ?? true, topic: outTopic }) }];
    case 'json_extract':
      return [{ key: 'json_extract', config: JSON.stringify({ path: values.json_path || '', topic: outTopic }) }];
    case 'json_filter':
      return [{ key: 'json_filter', config: JSON.stringify({ path: values.json_filter_path || '', equals: values.json_filter_equals || '', topic: outTopic }) }];
    case 'text_replace':
      return [{ key: 'text_replace', config: JSON.stringify({ from: values.text_from || '', to: values.text_to || '', topic: outTopic }) }];
    case 'text_regex_filter':
      return [{ key: 'text_regex_filter', config: JSON.stringify({ pattern: values.text_pattern || '', topic: outTopic }) }];
    case 'field_map':
      return [{ key: 'field_map', config: JSON.stringify({ mapping: parseFieldMapping(values.field_mapping || ''), topic: outTopic }) }];
    case 'dlt645':
      return [{ key: 'dlt645', config: JSON.stringify({ topic: outTopic }) }];
    case 'modbus_rtu':
      return [{ key: 'modbus_rtu', config: JSON.stringify({ topic: outTopic }) }];
    case 'script':
      return [{ key: 'script', config: JSON.stringify({ script: values.script || DEFAULT_PROCESS_SCRIPT, topic: outTopic }) }];
    default:
      return [];
  }
};

const fillFormValues = (record?: ProcessorItem | null) => {
  if (!record) {
    return {
      name: '',
      topic: '',
      enable: true,
      mode: SIMPLE_MODE,
      processor_key: 'script',
      script: DEFAULT_PROCESS_SCRIPT,
      out_topic: '',
      json_pretty: true,
    };
  }

  const processors = parseProcessors(record.processors);
  const mode = detectMode(processors);
  const first = processors[0];
  const cfg = parseConfig(first?.config);
  return {
    name: record.name,
    topic: record.topic,
    enable: record.enable,
    mode,
    processor_key: first?.key || 'script',
    script: cfg.script || DEFAULT_PROCESS_SCRIPT,
    out_topic: cfg.topic || '',
    json_pretty: cfg.pretty ?? true,
    json_path: cfg.path || '',
    json_filter_path: cfg.path || '',
    json_filter_equals: cfg.equals || '',
    text_from: cfg.from || '',
    text_to: cfg.to || '',
    text_pattern: cfg.pattern || '',
    field_mapping: mappingToText(cfg.mapping),
  };
};

const updateNodeAt = (nodes: VisualProcessorNode[], index: number, updater: (node: VisualProcessorNode) => VisualProcessorNode) => {
  return nodes.map((node, currentIndex) => currentIndex === index ? updater(node) : node);
};

const moveNode = (nodes: VisualProcessorNode[], index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= nodes.length) return nodes;
  const next = [...nodes];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
};

const ProcessorChainManager: React.FC = () => {
  const [list, setList] = useState<ProcessorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancedNodes, setAdvancedNodes] = useState<VisualProcessorNode[]>([]);
  const [form] = Form.useForm();

  const selectedMode = Form.useWatch('mode', form);
  const selectedProcessorKey = Form.useWatch('processor_key', form);

  const selectedItem = useMemo(
    () => list.find(item => item.id === selectedId) || null,
    [list, selectedId],
  );

  const selectedProcessors = useMemo(() => {
    const mode = form.getFieldValue('mode');
    return mode === ADVANCED_MODE ? buildProcessorItems(advancedNodes) : parseProcessors(selectedItem?.processors);
  }, [advancedNodes, form, selectedItem]);

  const isDirty = useMemo(() => {
    if (!selectedItem) return false;
    const currentValues = form.getFieldsValue(true);
    const currentProcessors = currentValues.mode === ADVANCED_MODE
      ? buildProcessorItems(advancedNodes)
      : buildSimpleProcessor(currentValues);
    return JSON.stringify(fillFormValues(selectedItem)) !== JSON.stringify(fillFormValues({
      ...selectedItem,
      processors: JSON.stringify(currentProcessors),
      name: currentValues.name,
      topic: currentValues.topic,
      enable: currentValues.enable ?? false,
    } as ProcessorItem));
  }, [advancedNodes, form, selectedItem]);

  const applySelection = useCallback((item: ProcessorItem | null) => {
    if (!item) {
      setSelectedId(null);
      setAdvancedNodes([]);
      form.setFieldsValue(fillFormValues(null));
      return;
    }
    setSelectedId(item.id);
    setAdvancedNodes(parseProcessorNodes(item.processors));
    form.setFieldsValue(fillFormValues(item));
  }, [form]);

  const confirmBeforeAction = useCallback((action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    Modal.confirm({
      title: '当前规则尚未保存',
      content: '继续操作会丢失未保存内容，是否继续？',
      okText: '继续',
      cancelText: '取消',
      onOk: action,
    });
  }, [isDirty]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/processor_chain/list`);
      const data = await res.json();
      const items = data.data || [];
      setList(items);
      if (!items.length) {
        applySelection(null);
        return;
      }
      const nextSelected = items.find((item: ProcessorItem) => item.id === selectedId) || items[0];
      applySelection(nextSelected);
    } catch {
      message.error('获取数据处理列表失败');
    } finally {
      setLoading(false);
    }
  }, [applySelection, selectedId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSelect = (item: ProcessorItem) => {
    if (selectedId === item.id) return;
    confirmBeforeAction(() => applySelection(item));
  };

  const handleCreate = async () => {
    confirmBeforeAction(async () => {
      try {
        const payload = {
          name: '未命名数据处理',
          topic: '',
          processors: JSON.stringify([{ key: 'script', config: JSON.stringify({ script: DEFAULT_PROCESS_SCRIPT, topic: '' }) }]),
          enable: true,
        };
        const res = await fetch(`${API_BASE}/processor_chain/create`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.code === 0 || data.code === 200) {
          message.success('已创建');
          await fetchList();
        } else {
          message.error(data.msg || '创建失败');
        }
      } catch {
        message.error('创建失败');
      }
    });
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    try {
      setSaving(true);
      const values = await form.validateFields();
      const processors = values.mode === ADVANCED_MODE
        ? buildProcessorItems(advancedNodes)
        : buildSimpleProcessor(values);
      const payload = {
        id: selectedItem.id,
        name: values.name,
        topic: values.topic || '',
        processors: JSON.stringify(processors),
        enable: values.enable ?? false,
      };
      const res = await fetch(`${API_BASE}/processor_chain/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.code === 0 || data.code === 200) {
        message.success('保存成功');
        await fetchList();
      } else {
        message.error(data.msg || '保存失败');
      }
    } catch {
    } finally {
      setSaving(false);
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
      await fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    const executeDelete = async () => {
      try {
        await fetch(`${API_BASE}/processor_chain/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        message.success('删除成功');
        await fetchList();
      } catch {
        message.error('删除失败');
      }
    };

    if (selectedId === id) {
      confirmBeforeAction(() => {
        void executeDelete();
      });
      return;
    }

    await executeDelete();
  };

  const handleModeChange = (mode: string) => {
    form.setFieldValue('mode', mode);
    if (mode === ADVANCED_MODE && advancedNodes.length === 0) {
      const currentKey = form.getFieldValue('processor_key') || 'script';
      const currentOutTopic = form.getFieldValue('out_topic') || '';
      const currentNodes = buildSimpleProcessor({ ...form.getFieldsValue(), processor_key: currentKey, out_topic: currentOutTopic });
      const nextNodes = currentNodes.length
        ? currentNodes.map(item => ({ id: createNodeId(), key: item.key, config: parseConfig(item.config) }))
        : [createDefaultNode(currentKey)];
      setAdvancedNodes(nextNodes);
    }
    if (mode === SIMPLE_MODE && advancedNodes[0]) {
      const first = advancedNodes[0];
      const cfg = first.config || {};
      form.setFieldsValue({
        processor_key: first.key,
        out_topic: cfg.topic || '',
        json_pretty: cfg.pretty ?? true,
        json_path: cfg.path || '',
        json_filter_path: cfg.path || '',
        json_filter_equals: cfg.equals || '',
        text_from: cfg.from || '',
        text_to: cfg.to || '',
        text_pattern: cfg.pattern || '',
        field_mapping: mappingToText(cfg.mapping),
        script: cfg.script || DEFAULT_PROCESS_SCRIPT,
      });
    }
  };

  const renderSimpleProcessorForm = () => (
    <>
      <Form.Item name="processor_key" label="处理器类型" rules={[{ required: true, message: '请选择处理器类型' }]}>
        <Select options={SIMPLE_PROCESSOR_OPTIONS} />
      </Form.Item>

      {selectedProcessorKey === 'json_format' && (
        <Form.Item name="json_pretty" label="格式化方式">
          <Select options={[{ value: true, label: '美化输出' }, { value: false, label: '压缩输出' }]} />
        </Form.Item>
      )}

      {selectedProcessorKey === 'json_extract' && (
        <Form.Item name="json_path" label="提取路径" rules={[{ required: true, message: '请输入 JSON 路径' }]}>
          <Input placeholder="例如：data.temp" />
        </Form.Item>
      )}

      {selectedProcessorKey === 'json_filter' && (
        <>
          <Form.Item name="json_filter_path" label="过滤路径" rules={[{ required: true, message: '请输入 JSON 路径' }]}>
            <Input placeholder="例如：status" />
          </Form.Item>
          <Form.Item name="json_filter_equals" label="匹配值" rules={[{ required: true, message: '请输入匹配值' }]}>
            <Input placeholder="例如：ok" />
          </Form.Item>
        </>
      )}

      {selectedProcessorKey === 'text_replace' && (
        <>
          <Form.Item name="text_from" label="替换前" rules={[{ required: true, message: '请输入替换前内容' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="text_to" label="替换后">
            <Input />
          </Form.Item>
        </>
      )}

      {selectedProcessorKey === 'text_regex_filter' && (
        <Form.Item name="text_pattern" label="正则表达式" rules={[{ required: true, message: '请输入正则表达式' }]}>
          <Input placeholder="例如：^OK" />
        </Form.Item>
      )}

      {selectedProcessorKey === 'field_map' && (
        <Form.Item name="field_mapping" label="字段映射" rules={[{ required: true, message: '请输入字段映射' }]} tooltip="每行一个映射，格式: 原字段=目标字段">
          <Input.TextArea rows={6} placeholder={"temp=temperature\nname=device_name"} />
        </Form.Item>
      )}

      {selectedProcessorKey === 'script' && (
        <Form.Item name="script" label="处理脚本">
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
              <Text type="secondary">右侧脚本编辑</Text>
            </div>
            <CodeEditor
              value={form.getFieldValue('script') || DEFAULT_PROCESS_SCRIPT}
              onChange={(value) => form.setFieldValue('script', value)}
              language="go"
              theme="material"
              height="420px"
            />
          </div>
        </Form.Item>
      )}
    </>
  );

  const renderNodeConfig = (node: VisualProcessorNode, index: number) => {
    const cfg = node.config || {};
    return (
      <>
        <Form.Item label="处理器类型" style={{ marginBottom: 12 }}>
          <Select
            value={node.key}
            options={SIMPLE_PROCESSOR_OPTIONS}
            onChange={(value) => setAdvancedNodes(prev => updateNodeAt(prev, index, () => createDefaultNode(value)))}
          />
        </Form.Item>

        {node.key === 'json_format' && (
          <Form.Item label="格式化方式" style={{ marginBottom: 12 }}>
            <Select
              value={cfg.pretty ?? true}
              options={[{ value: true, label: '美化输出' }, { value: false, label: '压缩输出' }]}
              onChange={(value) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, pretty: value } })))}
            />
          </Form.Item>
        )}

        {node.key === 'json_extract' && (
          <Form.Item label="提取路径" style={{ marginBottom: 12 }}>
            <Input value={cfg.path || ''} placeholder="例如：data.temp" onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, path: e.target.value } })))} />
          </Form.Item>
        )}

        {node.key === 'json_filter' && (
          <>
            <Form.Item label="过滤路径" style={{ marginBottom: 12 }}>
              <Input value={cfg.path || ''} placeholder="例如：status" onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, path: e.target.value } })))} />
            </Form.Item>
            <Form.Item label="匹配值" style={{ marginBottom: 12 }}>
              <Input value={cfg.equals || ''} placeholder="例如：ok" onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, equals: e.target.value } })))} />
            </Form.Item>
          </>
        )}

        {node.key === 'text_replace' && (
          <>
            <Form.Item label="替换前" style={{ marginBottom: 12 }}>
              <Input value={cfg.from || ''} onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, from: e.target.value } })))} />
            </Form.Item>
            <Form.Item label="替换后" style={{ marginBottom: 12 }}>
              <Input value={cfg.to || ''} onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, to: e.target.value } })))} />
            </Form.Item>
          </>
        )}

        {node.key === 'text_regex_filter' && (
          <Form.Item label="正则表达式" style={{ marginBottom: 12 }}>
            <Input value={cfg.pattern || ''} placeholder="例如：^OK" onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, pattern: e.target.value } })))} />
          </Form.Item>
        )}

        {node.key === 'field_map' && (
          <Form.Item label="字段映射" tooltip="每行一个映射，格式: 原字段=目标字段" style={{ marginBottom: 12 }}>
            <Input.TextArea rows={5} value={mappingToText(cfg.mapping)} placeholder={"temp=temperature\nname=device_name"} onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, mapping: parseFieldMapping(e.target.value) } })))} />
          </Form.Item>
        )}

        {node.key === 'script' && (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
              <Text type="secondary">右侧脚本编辑</Text>
            </div>
            <CodeEditor
              value={cfg.script || DEFAULT_PROCESS_SCRIPT}
              onChange={(value) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, script: value } })))}
              language="go"
              theme="material"
              height="320px"
            />
          </div>
        )}

        <Form.Item label="节点输出 Topic" style={{ marginBottom: 0 }}>
          <Input value={cfg.topic || ''} placeholder="留空则沿用后续或原 Topic" onChange={(e) => setAdvancedNodes(prev => updateNodeAt(prev, index, item => ({ ...item, config: { ...item.config, topic: e.target.value } })))} />
        </Form.Item>
      </>
    );
  };

  const renderAdvancedProcessorForm = () => (
    <Card
      size="small"
      title="处理器链"
      extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setAdvancedNodes(prev => [...prev, createDefaultNode()])}>新增处理器</Button>}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {advancedNodes.map((node, index) => (
          <Card
            key={node.id}
            size="small"
            title={`节点 ${index + 1}`}
            extra={
              <Space>
                <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => setAdvancedNodes(prev => moveNode(prev, index, -1))} />
                <Button size="small" icon={<ArrowDownOutlined />} disabled={index === advancedNodes.length - 1} onClick={() => setAdvancedNodes(prev => moveNode(prev, index, 1))} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setAdvancedNodes(prev => prev.filter(item => item.id !== node.id))} />
              </Space>
            }
          >
            {renderNodeConfig(node, index)}
          </Card>
        ))}
        {!advancedNodes.length && <Empty description="暂无处理器节点，点击上方新增处理器" />}
      </Space>
    </Card>
  );

  return (
    <div style={{ height: '100%', display: 'flex', gap: 16 }}>
      <Card
        title="数据处理列表"
        style={{ width: 320, flexShrink: 0 }}
        bodyStyle={{ padding: 0, height: 'calc(100vh - 210px)', overflow: 'auto' }}
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={() => confirmBeforeAction(() => fetchList())} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建</Button>
          </Space>
        }
      >
        <List
          loading={loading}
          dataSource={list}
          renderItem={(item) => {
            const processors = parseProcessors(item.processors);
            const active = selectedId === item.id;
            return (
              <List.Item
                onClick={() => handleSelect(item)}
                style={{
                  cursor: 'pointer',
                  padding: '14px 16px',
                  background: active ? '#e6f7ff' : '#fff',
                  borderLeft: active ? '3px solid #1677ff' : '3px solid transparent',
                }}
                actions={[
                  <Switch
                    key="enable"
                    size="small"
                    checked={item.enable}
                    onClick={(checked, e) => {
                      e?.stopPropagation();
                      handleToggle(item, checked);
                    }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="确定删除该规则?"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDelete(item.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileTextOutlined style={{ color: active ? '#1677ff' : '#999' }} />}
                  title={<Space><Text strong={active}>{item.name}</Text>{item.enable ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>}</Space>}
                  description={<Space direction="vertical" size={2}><TopicLink topic={item.topic} color="green" emptyText="未设置订阅" /><Text type="secondary">{getProcessorSummary(processors)}</Text></Space>}
                />
              </List.Item>
            );
          }}
        />
      </Card>

      <Card
        title={selectedItem ? selectedItem.name : '数据处理编辑'}
        style={{ flex: 1 }}
        extra={selectedItem ? (
          <Space>
            <TopicLink topic={getOutputTopic(selectedProcessors)} color="blue" emptyText="沿用原 Topic" />
            <Button type="primary" icon={<EditOutlined />} loading={saving} onClick={handleSave}>保存</Button>
          </Space>
        ) : undefined}
        bodyStyle={{ height: 'calc(100vh - 210px)', overflow: 'auto' }}
      >
        {!selectedItem ? (
          <Empty description="请先从左侧选择或新建一条数据处理规则" />
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="例如：温度数据过滤" />
            </Form.Item>
            <Form.Item name="topic" label="订阅 Topic" rules={[{ required: true, message: '请输入订阅 Topic' }]}>
              <Input placeholder="例如：device.temp.raw" />
            </Form.Item>
            <Form.Item name="out_topic" label="输出 Topic" tooltip="处理后输出到该 Topic；留空则沿用处理器内部返回或原 Topic">
              <Input placeholder="例如：device.temp.cleaned" />
            </Form.Item>
            <Form.Item name="mode" label="模式" rules={[{ required: true, message: '请选择模式' }]}>
              <Select onChange={handleModeChange} options={[{ value: SIMPLE_MODE, label: '简单模式' }, { value: ADVANCED_MODE, label: '高级模式' }]} />
            </Form.Item>
            <Form.Item name="enable" label="启用状态" valuePropName="checked">
              <Switch />
            </Form.Item>
            {selectedMode === ADVANCED_MODE ? renderAdvancedProcessorForm() : renderSimpleProcessorForm()}
          </Form>
        )}
      </Card>
    </div>
  );
};

export default ProcessorChainManager;
