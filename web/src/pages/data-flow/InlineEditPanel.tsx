import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Button, Space, Select, Switch, message } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import {
  type ListenerParentItem,
  type ListenerConnItem,
  type ProcessorChainItem,
  type DispatcherItem,
  type ViewerItem,
  type MockerItem,
  updateListenerParent,
  updateListenerConn,
  updateProcessorChain,
  updateDispatcher,
  updateViewer,
  updateMocker,
} from '../../services/dataFlowApi';
import { listPluginsByType, type PluginInfo, type PluginParamSpec } from '../../services/pluginApi';
import useScriptEditorStore from '../../store/useScriptEditorStore';
import { SectionTitle, TopicMultiSelect } from './FlowNodes';
import {
  PROCESSOR_TYPES,
  findProcessorType,
  buildDefaultConfig,
  parseSingleProcessor,
  serializeSingleProcessor,
} from './processorSchema';

export type EditTarget =
  | { kind: 'listenerParent'; data: ListenerParentItem }
  | { kind: 'listener'; data: ListenerConnItem }
  | { kind: 'chain'; data: ProcessorChainItem }
  | { kind: 'dispatcher'; data: DispatcherItem }
  | { kind: 'viewer'; data: ViewerItem }
  | { kind: 'mocker'; data: MockerItem }
  | null;

interface Props {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
  // 仅 listener 类型支持跳转高级编辑 Modal
  onAdvancedEdit?: (kind: 'listenerParent' | 'listener', type: string, node: any) => void;
}

// 解析 JSON 配置字段
const parseJSON = (s?: string): any => {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
};

// 内联编辑面板 - 核心是修改 topic 路由 + 基本配置
export const InlineEditPanel: React.FC<Props> = ({ target, onClose, onSaved, onAdvancedEdit }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  // 内置处理器链：当前选中的处理器 key 和 config（编辑时回填，保存时序列化为 processors JSON）
  const [builtinKey, setBuiltinKey] = useState<string>('');
  const [builtinConfig, setBuiltinConfig] = useState<Record<string, any>>({});
  // 插件容器：当前插件名和参数
  const [pluginName, setPluginName] = useState<string>('');
  const [pluginParams, setPluginParams] = useState<Record<string, any>>({});
  const [listenerPlugins, setListenerPlugins] = useState<PluginInfo[]>([]);
  const [processorPlugins, setProcessorPlugins] = useState<PluginInfo[]>([]);
  const [pusherPlugins, setPusherPlugins] = useState<PluginInfo[]>([]);
  const openScriptEditor = useScriptEditorStore((s) => s.openEditor);

  const currentListenerPluginSpecs = (listenerPlugins.find((p) => p.name === pluginName)?.params || []) as PluginParamSpec[];
  const currentProcessorPluginSpecs = (processorPlugins.find((p) => p.name === pluginName)?.params || []) as PluginParamSpec[];
  const currentPusherPluginSpecs = (pusherPlugins.find((p) => p.name === pluginName)?.params || []) as PluginParamSpec[];

  useEffect(() => {
    void (async () => {
      try {
        const [listeners, processors, pushers] = await Promise.all([
          listPluginsByType('listener'),
          listPluginsByType('processor'),
          listPluginsByType('pusher'),
        ]);
        setListenerPlugins(listeners || []);
        setProcessorPlugins(processors || []);
        setPusherPlugins(pushers || []);
      } catch (e: any) {
        console.error('[InlineEditPanel] 加载插件列表失败:', e);
      }
    })();
  }, []);

  // 从处理器链的 processors 字段中提取 script 处理器的脚本内容
  const extractChainScript = (processorsRaw?: string): { script: string; hasScript: boolean } => {
    try {
      const arr = JSON.parse(processorsRaw || '[]');
      if (!Array.isArray(arr)) return { script: '', hasScript: false };
      const scriptItem = arr.find((p: any) => p?.key === 'script');
      if (!scriptItem) return { script: '', hasScript: false };
      const cfg = typeof scriptItem.config === 'string' ? parseJSON(scriptItem.config) : (scriptItem.config || {});
      return { script: cfg.script || '', hasScript: true };
    } catch {
      return { script: '', hasScript: false };
    }
  };

  // 打开脚本编辑器编辑处理器链中的 script 处理器
  const handleEditChainScript = () => {
    if (target?.kind !== 'chain') return;
    const d = target.data;
    const { script, hasScript } = extractChainScript(d.processors);
    if (!hasScript) {
      message.warning('该处理器链未包含脚本处理器');
      return;
    }
    openScriptEditor({
      name: d.name,
      content: script,
      language: 'go',
      onSave: async (newContent) => {
        // 更新 processors 中的 script 配置
        let arr: any[] = [];
        try { arr = JSON.parse(d.processors || '[]'); } catch { arr = []; }
        const idx = arr.findIndex((p: any) => p?.key === 'script');
        if (idx < 0) return;
        const oldCfg = typeof arr[idx].config === 'string' ? parseJSON(arr[idx].config) : (arr[idx].config || {});
        arr[idx] = { ...arr[idx], config: JSON.stringify({ ...oldCfg, script: newContent }) };
        const newProcessors = JSON.stringify(arr);
        await updateProcessorChain({
          id: d.id,
          name: d.name,
          topic: d.topic,
          out_topic: d.out_topic,
          processors: newProcessors,
          enable: d.enable,
        });
        // 同步本地 target 数据，避免后续保存覆盖脚本
        d.processors = newProcessors;
        onSaved();
      },
    });
  };

  // 打开脚本编辑器编辑脚本分发器的脚本（config 字段直接存原始脚本内容）
  const handleEditDispatcherScript = () => {
    if (target?.kind !== 'dispatcher') return;
    if (target.data.type !== 'script') return;
    const d = target.data;
    openScriptEditor({
      name: d.name,
      content: d.config || '',
      language: 'go',
      onSave: async (newContent) => {
        await updateDispatcher({
          id: d.id,
          name: d.name,
          type: d.type,
          enable: d.enable,
          topics: d.topics,
          config: newContent,
        });
        // 同步本地 target 数据，避免后续保存覆盖脚本
        d.config = newContent;
        onSaved();
      },
    });
  };

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'listener') {
      const d = target.data;
      const cfg = parseJSON(d.config);
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
        out_topic: d.out_topic,
        // 平铺配置字段
        address: d.address || cfg.address,
        port: d.port || cfg.port,
        baud_rate: d.baud_rate || cfg.baud_rate,
        path: d.path || cfg.path,
        methods: d.methods || cfg.methods,
        sub_topic: d.sub_topic || cfg.sub_topic,
        qos: d.qos ?? cfg.qos,
        content: d.content || cfg.content,
      });
    } else if (target.kind === 'chain') {
      const d = target.data;
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
        out_topic: d.out_topic,
      });
      // 回填内置处理器 / 插件处理器
      const parsed = parseSingleProcessor(d.processors);
      if (parsed && parsed.key === 'plugin') {
        setBuiltinKey('');
        setBuiltinConfig({});
        setPluginName(parsed.config?.plugin_name || '');
        setPluginParams(parsed.config?.params || {});
      } else if (parsed && parsed.key !== 'script') {
        setBuiltinKey(parsed.key);
        setBuiltinConfig(parsed.config || buildDefaultConfig(parsed.key));
        setPluginName('');
        setPluginParams({});
      } else {
        setBuiltinKey('');
        setBuiltinConfig({});
        setPluginName('');
        setPluginParams({});
      }
    } else if (target.kind === 'dispatcher') {
      const d = target.data;
      const cfg = parseJSON(d.config);
      const topics = parseJSON(d.topics);
      form.setFieldsValue({
        name: d.name,
        topic_list: Array.isArray(topics) ? topics : [],
        // 常见配置字段
        url: cfg.url,
        method: cfg.method,
        broker: cfg.broker,
        client_id: cfg.client_id,
        username: cfg.username,
        password: cfg.password,
        pub_topic: cfg.pub_topic,
        address: cfg.address,
        plugin_name: cfg.plugin_name,
      });
      if (d.type === 'plugin') {
        setPluginName(cfg.plugin_name || '');
        setPluginParams(cfg.params || {});
      }
    } else if (target.kind === 'viewer') {
      const d = target.data;
      const topics = parseJSON(d.topics);
      form.setFieldsValue({
        name: d.name,
        topic_list: Array.isArray(topics) ? topics : [],
      });
    } else if (target.kind === 'mocker') {
      const d = target.data;
      form.setFieldsValue({
        name: d.name,
        topic: d.topic,
        payload: d.payload,
        interval: d.interval,
      });
    }
  }, [target, form]);

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (target.kind === 'listenerParent') {
        const d = target.data;
        const cfg: any = {};
        if (values.port) cfg.port = values.port;
        if (values.broker) cfg.broker = values.broker;
        if (values.client_id) cfg.client_id = values.client_id;
        if (values.username) cfg.username = values.username;
        if (values.password) cfg.password = values.password;
        await updateListenerParent({
          id: d.id,
          name: values.name,
          type: d.type,
          enable: d.enable,
          config: JSON.stringify(cfg),
        });
      } else if (target.kind === 'listener') {
        const d = target.data;
        const cfg: any = {};
        if (d.type === 'plugin') {
          cfg.plugin_name = pluginName || values.plugin_name;
          cfg.params = pluginParams;
        }
        if (values.address) cfg.address = values.address;
        if (values.port) cfg.port = values.port;
        if (values.baud_rate) cfg.baud_rate = values.baud_rate;
        if (values.path) cfg.path = values.path;
        if (values.methods) cfg.methods = values.methods;
        if (values.sub_topic) cfg.sub_topic = values.sub_topic;
        if (values.qos !== undefined) cfg.qos = values.qos;
        if (values.content) cfg.content = values.content;
        await updateListenerConn({
          id: d.id,
          name: values.name,
          topic: values.topic,
          out_topic: values.out_topic,
          type: d.type,
          parent_id: d.parent_id,
          enable: d.enable,
          config: JSON.stringify(cfg),
        });
      } else if (target.kind === 'chain') {
        const d = target.data;
        const { hasScript } = extractChainScript(d.processors);
        const payload: any = {
          id: d.id,
          name: values.name,
          topic: values.topic,
          out_topic: values.out_topic,
        };
        // 脚本链：保留原 processors（脚本由「编辑脚本」按钮修改）
        // 插件链：序列化 plugin 处理器
        // 内置链：序列化当前选择的处理器为 processors JSON
        if (!hasScript) {
          if (pluginName) {
            payload.processors = JSON.stringify([
              { key: 'plugin', config: JSON.stringify({ plugin_name: pluginName, params: pluginParams }) },
            ]);
          } else {
            if (!builtinKey) {
              message.error('请选择处理器类型');
              return;
            }
            // JSON 字段：把字符串解析回对象，避免存双重 JSON
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
            payload.processors = serializeSingleProcessor(builtinKey, finalConfig);
          }
        }
        await updateProcessorChain(payload);
        // 同步本地 target 数据，避免后续保存覆盖
        if (!hasScript && payload.processors) {
          d.processors = payload.processors;
        }
      } else if (target.kind === 'dispatcher') {
        const d = target.data;
        const topics = Array.isArray(values.topic_list) ? values.topic_list : [];
        if (d.type === 'script') {
          // 脚本分发器：config 直接存原始脚本，保存时保留原值（脚本通过编辑脚本按钮修改）
          await updateDispatcher({
            id: d.id,
            name: values.name,
            type: d.type,
            enable: d.enable,
            topics: JSON.stringify(topics),
            config: d.config,
          });
        } else {
          const cfg: any = {};
          if (values.url) cfg.url = values.url;
          if (values.method) cfg.method = values.method;
          if (values.broker) cfg.broker = values.broker;
          if (values.client_id) cfg.client_id = values.client_id;
          if (values.username) cfg.username = values.username;
          if (values.password) cfg.password = values.password;
          if (values.pub_topic) cfg.pub_topic = values.pub_topic;
          if (values.address) cfg.address = values.address;
          if (values.plugin_name || pluginName) cfg.plugin_name = pluginName || values.plugin_name;
          if (d.type === 'plugin') cfg.params = pluginParams;
          await updateDispatcher({
            id: d.id,
            name: values.name,
            type: d.type,
            enable: d.enable,
            topics: JSON.stringify(topics),
            config: JSON.stringify(cfg),
          });
        }
      } else if (target.kind === 'viewer') {
        const d = target.data;
        const topics = Array.isArray(values.topic_list) ? values.topic_list : [];
        await updateViewer({
          id: d.id,
          name: values.name,
          enable: d.enable,
          topics: JSON.stringify(topics),
        });
      } else if (target.kind === 'mocker') {
        const d = target.data;
        await updateMocker({
          id: d.id,
          name: values.name,
          topic: values.topic || '',
          payload: values.payload || '',
          interval: Number(values.interval) || 0,
          enable: d.enable,
        });
      }
      message.success('保存成功');
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  const titleMap = {
    listenerParent: '编辑父级监听器',
    listener: '编辑监听器',
    chain: '编辑处理器链',
    dispatcher: '编辑分发器',
    viewer: '编辑订阅查看器',
    mocker: '编辑虚拟数据发送器',
  };

  return (
    <Modal
      title={titleMap[target.kind]}
      open={!!target}
      onCancel={onClose}
      width={560}
      destroyOnClose
      footer={
        <Space>
          {onAdvancedEdit && (target.kind === 'listenerParent' || target.kind === 'listener') && (
            <Button onClick={() => onAdvancedEdit(target.kind, target.data.type, target.data)}>
              高级编辑
            </Button>
          )}
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        {/* 通用字段 */}
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        {/* topic 路由 - 核心编辑项 */}
        <SectionTitle title="数据流路由" color="blue" />

        {target.kind === 'listener' && (
          <>
            <Form.Item name="topic" label="入站 Topic" tooltip="连接收到的数据推送到此 topic">
              <Input placeholder="例如：device/data" />
            </Form.Item>
            <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 topic 的消息推送到连接">
              <Input placeholder="留空则不订阅出站消息" />
            </Form.Item>
            <Form.Item name="content" label="内容模板" tooltip="可选，配置监听器发送或解析的默认内容">
              <Input.TextArea rows={4} placeholder="可选内容模板或示例消息" />
            </Form.Item>
          </>
        )}

        {target.kind === 'chain' && (
          <>
            <Form.Item name="topic" label="订阅 Topic" tooltip="处理器链订阅此 topic 的消息进行处理">
              <Input placeholder="例如：device/data" />
            </Form.Item>
            <Form.Item name="out_topic" label="发布 Topic" tooltip="处理完成后默认发布到此 topic；留空则沿用处理器内部返回或原 topic">
              <Input placeholder="例如：device/cleaned" />
            </Form.Item>
            {extractChainScript(target.data.processors).hasScript ? (
              <Button icon={<CodeOutlined />} onClick={handleEditChainScript} block>
                编辑脚本
              </Button>
            ) : pluginName ? (
              <>
                <Form.Item label="处理器插件" required>
                  <Select
                    value={pluginName || undefined}
                    onChange={(name) => {
                      setPluginName(name);
                      const p = processorPlugins.find((x) => x.name === name);
                      const defaults: Record<string, any> = {};
                      for (const spec of p?.params || []) defaults[spec.key] = pluginParams[spec.key] ?? spec.default;
                      setPluginParams(defaults);
                    }}
                    options={processorPlugins.map((p) => ({ value: p.name, label: p.display || p.name }))}
                  />
                </Form.Item>
                {currentProcessorPluginSpecs.length > 0 && (
                  <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, marginBottom: 8 }}>
                    {currentProcessorPluginSpecs.map((spec) => (
                      <Form.Item key={spec.key} label={spec.label || spec.key} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                        {spec.type === 'int' || spec.type === 'number' || spec.type === 'float' ? (
                          <InputNumber value={pluginParams[spec.key]} min={spec.min} max={spec.max} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} style={{ width: '100%' }} />
                        ) : spec.type === 'bool' ? (
                          <Switch checked={!!pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} />
                        ) : spec.type === 'select' ? (
                          <Select value={pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} options={(spec.options || []).map((o) => ({ value: o, label: o }))} allowClear />
                        ) : (
                          <Input value={pluginParams[spec.key] ?? ''} onChange={(e) => setPluginParams((c) => ({ ...c, [spec.key]: e.target.value }))} />
                        )}
                      </Form.Item>
                    ))}
                  </div>
                )}
              </>
            ) : (
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
                {builtinKey && findProcessorType(builtinKey) && (
                  <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, marginBottom: 8 }}>
                    {findProcessorType(builtinKey)!.fields.map((f) => (
                      <Form.Item
                        key={f.key}
                        label={f.label}
                        tooltip={f.tooltip}
                        required={f.required}
                        style={{ marginBottom: 8 }}
                      >
                        {f.type === 'switch' ? (
                          <Switch
                            checked={!!builtinConfig[f.key]}
                            onChange={(checked) => setBuiltinConfig((c) => ({ ...c, [f.key]: checked }))}
                          />
                        ) : f.type === 'textarea' || f.type === 'json' ? (
                          <Input.TextArea
                            rows={3}
                            placeholder={f.placeholder || (f.type === 'json' ? '{}' : '')}
                            value={
                              f.type === 'json' && builtinConfig[f.key] && typeof builtinConfig[f.key] === 'object'
                                ? JSON.stringify(builtinConfig[f.key], null, 2)
                                : (builtinConfig[f.key] ?? '')
                            }
                            onChange={(e) => setBuiltinConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                          />
                        ) : (
                          <Input
                            placeholder={f.placeholder}
                            value={builtinConfig[f.key] ?? ''}
                            onChange={(e) => setBuiltinConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                          />
                        )}
                      </Form.Item>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {target.kind === 'dispatcher' && (
          <>
            <Form.Item name="topic_list" label="订阅 Topics" tooltip="分发器订阅这些 topic，可多选">
              <TopicMultiSelect placeholder="选择或输入 topic" />
            </Form.Item>
            {target.data.type === 'script' && (
              <Button icon={<CodeOutlined />} onClick={handleEditDispatcherScript} block>
                编辑脚本
              </Button>
            )}
          </>
        )}

        {target.kind === 'viewer' && (
          <Form.Item name="topic_list" label="订阅 Topics" tooltip="查看器订阅这些 topic，可多选">
            <TopicMultiSelect placeholder="选择或输入 topic" />
          </Form.Item>
        )}

        {target.kind === 'mocker' && (
          <>
            <Form.Item name="topic" label="目标 Topic" rules={[{ required: true, message: '请输入目标 topic' }]}>
              <Input placeholder="例如：device/mock" />
            </Form.Item>
            <Form.Item name="payload" label="数据内容">
              <Input.TextArea rows={4} placeholder={'纯文本或 JSON\n例如：{"value": 1}'} />
            </Form.Item>
            <Form.Item name="interval" label="定时间隔 (ms)" tooltip="0 表示仅手动触发，>0 启用后按此间隔自动发送">
              <Input type="number" placeholder="0 表示仅手动" />
            </Form.Item>
          </>
        )}

        {/* 类型特定配置 */}
        <SectionTitle title="配置参数" color="purple" />

        {target.kind === 'listener' && target.data.type === 'tcp_conn' && (
          <Form.Item name="address" label="监听地址"><Input placeholder="0.0.0.0:8080" /></Form.Item>
        )}
        {target.kind === 'listener' && target.data.type === 'udp_conn' && (
          <Form.Item name="address" label="监听地址"><Input placeholder="0.0.0.0:8080" /></Form.Item>
        )}
        {target.kind === 'listener' && target.data.type === 'serial_conn' && (
          <>
            <Form.Item name="port" label="串口"><Input placeholder="COM3 / /dev/ttyUSB0" /></Form.Item>
            <Form.Item name="baud_rate" label="波特率"><Input placeholder="9600" /></Form.Item>
          </>
        )}
        {target.kind === 'listener' && target.data.type === 'http_route' && (
          <>
            <Form.Item name="path" label="路径"><Input placeholder="/api/data" /></Form.Item>
            <Form.Item name="methods" label="方法"><Input placeholder="POST,GET" /></Form.Item>
          </>
        )}
        {target.kind === 'listener' && target.data.type === 'mqtt_subscription' && (
          <>
            <Form.Item name="sub_topic" label="订阅 Topic"><Input /></Form.Item>
            <Form.Item name="qos" label="QoS"><Input placeholder="0" /></Form.Item>
          </>
        )}

        {target.kind === 'listener' && target.data.type === 'plugin' && (
          <>
            <Form.Item name="plugin_name" label="插件名" rules={[{ required: true, message: '请选择插件' }]}>
              <Select
                value={pluginName || undefined}
                onChange={(name) => {
                  setPluginName(name);
                  const p = listenerPlugins.find((x) => x.name === name);
                  const defaults: Record<string, any> = {};
                  for (const spec of p?.params || []) defaults[spec.key] = pluginParams[spec.key] ?? spec.default;
                  setPluginParams(defaults);
                }}
                options={listenerPlugins.map((p) => ({ value: p.name, label: p.display || p.name }))}
              />
            </Form.Item>
            {currentListenerPluginSpecs.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, marginBottom: 8 }}>
                {currentListenerPluginSpecs.map((spec) => (
                  <Form.Item key={spec.key} label={spec.label || spec.key} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                    {spec.type === 'int' || spec.type === 'number' || spec.type === 'float' ? (
                      <InputNumber value={pluginParams[spec.key]} min={spec.min} max={spec.max} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} style={{ width: '100%' }} />
                    ) : spec.type === 'bool' ? (
                      <Switch checked={!!pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} />
                    ) : spec.type === 'select' ? (
                      <Select value={pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} options={(spec.options || []).map((o) => ({ value: o, label: o }))} allowClear />
                    ) : (
                      <Input value={pluginParams[spec.key] ?? ''} onChange={(e) => setPluginParams((c) => ({ ...c, [spec.key]: e.target.value }))} />
                    )}
                  </Form.Item>
                ))}
              </div>
            )}
          </>
        )}

        {target.kind === 'dispatcher' && target.data.type === 'http' && (
          <>
            <Form.Item name="url" label="URL"><Input placeholder="http://example.com/api" /></Form.Item>
            <Form.Item name="method" label="方法"><Input placeholder="POST" /></Form.Item>
          </>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'mqtt' && (
          <>
            <Form.Item name="broker" label="Broker"><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
            <Form.Item name="client_id" label="Client ID"><Input /></Form.Item>
            <Form.Item name="username" label="用户名"><Input /></Form.Item>
            <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
            <Form.Item name="pub_topic" label="发布 Topic"><Input /></Form.Item>
          </>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'websocket' && (
          <Form.Item name="address" label="地址"><Input placeholder="ws://127.0.0.1:8080/ws" /></Form.Item>
        )}
        {target.kind === 'dispatcher' && target.data.type === 'plugin' && (
          <>
            <Form.Item name="plugin_name" label="插件名" rules={[{ required: true, message: '请选择插件' }]}>
              <Select
                value={pluginName || undefined}
                onChange={(name) => {
                  setPluginName(name);
                  const p = pusherPlugins.find((x) => x.name === name);
                  const defaults: Record<string, any> = {};
                  for (const spec of p?.params || []) defaults[spec.key] = pluginParams[spec.key] ?? spec.default;
                  setPluginParams(defaults);
                }}
                options={pusherPlugins.map((p) => ({ value: p.name, label: p.display || p.name }))}
              />
            </Form.Item>
            {currentPusherPluginSpecs.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, marginBottom: 8 }}>
                {currentPusherPluginSpecs.map((spec) => (
                  <Form.Item key={spec.key} label={spec.label || spec.key} tooltip={spec.description} required={spec.required} style={{ marginBottom: 8 }}>
                    {spec.type === 'int' || spec.type === 'number' || spec.type === 'float' ? (
                      <InputNumber value={pluginParams[spec.key]} min={spec.min} max={spec.max} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} style={{ width: '100%' }} />
                    ) : spec.type === 'bool' ? (
                      <Switch checked={!!pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} />
                    ) : spec.type === 'select' ? (
                      <Select value={pluginParams[spec.key]} onChange={(v) => setPluginParams((c) => ({ ...c, [spec.key]: v }))} options={(spec.options || []).map((o) => ({ value: o, label: o }))} allowClear />
                    ) : (
                      <Input value={pluginParams[spec.key] ?? ''} onChange={(e) => setPluginParams((c) => ({ ...c, [spec.key]: e.target.value }))} />
                    )}
                  </Form.Item>
                ))}
              </div>
            )}
          </>
        )}
      </Form>
    </Modal>
  );
};
