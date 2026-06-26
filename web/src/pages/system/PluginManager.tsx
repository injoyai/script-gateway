import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ExclamationCircleOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  CodeOutlined,
  SendOutlined,
  ScheduleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  listPlugins,
  reloadAllPlugins,
  reloadTypePlugins,
  reloadOnePlugin,
  startTaskPlugin,
  stopTaskPlugin,
  saveTaskConfig,
  getTaskConfig,
  PLUGIN_TYPES,
  type PluginGroups,
  type PluginInfo,
  type PluginLoadError,
} from '../../services/pluginApi';

const { Text, Paragraph } = Typography;

// 类型 -> 图标 / 颜色 / 中文名
const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  listener: { icon: <GlobalOutlined />, color: '#3a4f7a', label: '监听器' },
  decoder: { icon: <CodeOutlined />, color: '#0f5e4d', label: '解码器' },
  processor: { icon: <ThunderboltOutlined />, color: '#b85c00', label: '处理器' },
  pusher: { icon: <SendOutlined />, color: '#7a3a8a', label: '推送器' },
  task: { icon: <ScheduleOutlined />, color: '#3a7a5f', label: '后台任务' },
};

const PluginCard: React.FC<{
  plugin: PluginInfo;
  onReload: (name: string) => void;
  onStart?: (name: string) => void;
  onStop?: (name: string) => void;
  onConfig?: (plugin: PluginInfo) => void;
  reloading: boolean;
}> = ({ plugin, onReload, onStart, onStop, onConfig, reloading }) => {
  const meta = TYPE_META[plugin.type] || TYPE_META.processor;
  return (
    <Card
      size="small"
      style={{
        height: '100%',
        borderColor: 'var(--line)',
        background: 'var(--paper-0)',
      }}
      title={
        <Space size={6}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <Text strong style={{ fontSize: 13.5 }}>
            {plugin.display || plugin.name}
          </Text>
          {plugin.version && (
            <Tag
              style={{
                fontSize: 10,
                margin: 0,
                padding: '0 6px',
                lineHeight: '18px',
                borderRadius: 4,
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {plugin.version}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space size={4}>
          {plugin.type === 'task' && (
            plugin.running ? (
              <Tooltip title="停止">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={() => onStop?.(plugin.name)}
                />
              </Tooltip>
            ) : (
              <Tooltip title="启动">
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => onStart?.(plugin.name)}
                />
              </Tooltip>
            )
          )}
          <Tooltip title="重载">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={reloading} />}
              onClick={() => onReload(plugin.name)}
            />
          </Tooltip>
          {onConfig && (
            <Tooltip title="配置参数">
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                onClick={() => onConfig(plugin)}
              />
            </Tooltip>
          )}
        </Space>
      }
      bodyStyle={{ padding: '10px 14px 12px' }}
    >
      <div style={{ marginBottom: 8 }}>
        {plugin.type === 'task' ? (
          plugin.running ? (
            <Tag color="success" style={{ margin: 0 }}>运行中</Tag>
          ) : (
            <Tag style={{ margin: 0 }}>已停止</Tag>
          )
        ) : (
          <Tag color="blue" style={{ margin: 0 }}>已加载</Tag>
        )}
        <Text
          type="secondary"
          style={{ marginLeft: 8, fontSize: 11.5, fontFamily: 'var(--font-mono)' }}
        >
          {plugin.name}
        </Text>
      </div>

      {plugin.description && (
        <Paragraph
          type="secondary"
          style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.55 }}
          ellipsis={{ rows: 2 }}
        >
          {plugin.description}
        </Paragraph>
      )}

      {plugin.error && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            background: 'var(--rouge-soft)',
            border: '1px solid rgba(181,56,66,0.2)',
            borderRadius: 6,
            fontSize: 11.5,
            color: 'var(--rouge)',
            fontFamily: 'var(--font-mono)',
            wordBreak: 'break-all',
          }}
        >
          {plugin.error}
        </div>
      )}

      {plugin.params && plugin.params.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Text
            type="secondary"
            style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            参数
          </Text>
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {plugin.params.map((p) => (
              <Tooltip
                key={p.key}
                title={
                  <div style={{ fontSize: 12 }}>
                    <div>键: <code>{p.key}</code></div>
                    <div>类型: {p.type}{p.required ? ' · 必填' : ''}</div>
                    {p.description && <div>说明: {p.description}</div>}
                    {p.default !== undefined && <div>默认: {String(p.default)}</div>}
                  </div>
                }
              >
                <Tag
                  style={{
                    fontSize: 10.5,
                    margin: 0,
                    padding: '0 6px',
                    lineHeight: '18px',
                    borderRadius: 4,
                    background: 'var(--paper-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--ink-2)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {p.label || p.key}
                  {p.required && <span style={{ color: 'var(--rouge)', marginLeft: 2 }}>*</span>}
                </Tag>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

const FailedCard: React.FC<{ err: PluginLoadError }> = ({ err }) => (
  <Card
    size="small"
    style={{
      height: '100%',
      borderColor: 'rgba(181,56,66,0.3)',
      background: 'var(--rouge-soft)',
    }}
    title={
      <Space size={6}>
        <ExclamationCircleOutlined style={{ color: 'var(--rouge)' }} />
        <Text strong style={{ fontSize: 13.5, color: 'var(--rouge)' }}>
          {err.Name}
        </Text>
      </Space>
    }
    bodyStyle={{ padding: '10px 14px 12px' }}
  >
    <div style={{ marginBottom: 6 }}>
      <Tag color="error" style={{ margin: 0 }}>加载失败</Tag>
      <Text
        type="secondary"
        style={{ marginLeft: 8, fontSize: 11.5, fontFamily: 'var(--font-mono)' }}
      >
        {err.Type}
      </Text>
    </div>
    <div
      style={{
        padding: '6px 8px',
        background: 'var(--paper-0)',
        border: '1px solid rgba(181,56,66,0.15)',
        borderRadius: 6,
        fontSize: 11.5,
        color: 'var(--rouge)',
        fontFamily: 'var(--font-mono)',
        wordBreak: 'break-all',
        maxHeight: 120,
        overflow: 'auto',
      }}
    >
      {err.Err}
    </div>
    {err.Dir && (
      <Text
        type="secondary"
        style={{ display: 'block', marginTop: 6, fontSize: 10.5, fontFamily: 'var(--font-mono)' }}
      >
        {err.Dir}
      </Text>
    )}
  </Card>
);

const PluginManager: React.FC = () => {
  const [groups, setGroups] = useState<PluginGroups>({});
  const [loading, setLoading] = useState(false);
  const [reloadingName, setReloadingName] = useState<string | null>(null);
  const [reloadingType, setReloadingType] = useState<string | null>(null);
  // task 插件参数配置 Modal
  const [configModal, setConfigModal] = useState<{ open: boolean; plugin: PluginInfo | null; saving: boolean; enable: boolean; params: Record<string, any> }>({
    open: false, plugin: null, saving: false, enable: false, params: {},
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlugins();
      setGroups(data || {});
    } catch (e: any) {
      message.error(e?.message || '获取插件列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleReloadAll = async () => {
    setLoading(true);
    try {
      await reloadAllPlugins();
      message.success('已重载所有插件');
      await fetchAll();
    } catch (e: any) {
      message.error(e?.message || '重载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReloadType = async (type: string) => {
    setReloadingType(type);
    try {
      await reloadTypePlugins(type);
      message.success(`已重载 ${TYPE_META[type]?.label || type} 类型插件`);
      await fetchAll();
    } catch (e: any) {
      message.error(e?.message || '重载失败');
    } finally {
      setReloadingType(null);
    }
  };

  const handleReloadOne = async (type: string, name: string) => {
    setReloadingName(`${type}/${name}`);
    try {
      await reloadOnePlugin(type, name);
      message.success(`已重载插件 ${name}`);
      await fetchAll();
    } catch (e: any) {
      message.error(e?.message || '重载失败');
    } finally {
      setReloadingName(null);
    }
  };

  const handleStartTask = async (name: string) => {
    try {
      await startTaskPlugin(name);
      message.success(`已启动任务 ${name}`);
      await fetchAll();
    } catch (e: any) {
      message.error(e?.message || '启动失败');
    }
  };

  const handleStopTask = async (name: string) => {
    try {
      await stopTaskPlugin(name);
      message.success(`已停止任务 ${name}`);
      await fetchAll();
    } catch (e: any) {
      message.error(e?.message || '停止失败');
    }
  };

  // 打开 task 插件参数配置 Modal
  const handleOpenTaskConfig = async (plugin: PluginInfo) => {
    setConfigModal({ open: true, plugin, saving: false, enable: false, params: {} });
    try {
      const cfg = await getTaskConfig(plugin.name);
      // 用已保存的值覆盖默认值
      const merged: Record<string, any> = {};
      for (const spec of plugin.params || []) {
        merged[spec.key] = cfg.params?.[spec.key] ?? spec.default;
      }
      setConfigModal({ open: true, plugin, saving: false, enable: cfg.enable, params: merged });
    } catch {
      // 读取失败时使用默认值
      const defaults: Record<string, any> = {};
      for (const spec of plugin.params || []) {
        defaults[spec.key] = spec.default;
      }
      setConfigModal({ open: true, plugin, saving: false, enable: false, params: defaults });
    }
  };

  // 保存 task 插件参数配置
  const handleSaveTaskConfig = async () => {
    if (!configModal.plugin) return;
    setConfigModal(s => ({ ...s, saving: true }));
    try {
      await saveTaskConfig(configModal.plugin.name, configModal.params, configModal.enable);
      message.success(`已保存 ${configModal.plugin.name} 的参数配置`);
      setConfigModal(s => ({ ...s, open: false, saving: false }));
    } catch (e: any) {
      message.error(e?.message || '保存失败');
      setConfigModal(s => ({ ...s, saving: false }));
    }
  };

  // 统计
  const stats = useMemo(() => {
    let loaded = 0;
    let failed = 0;
    let running = 0;
    for (const type of Object.keys(groups)) {
      const g = groups[type];
      if (!g) continue;
      loaded += (g.loaded || []).length;
      failed += (g.failed || []).length;
      for (const p of g.loaded || []) {
        if (p.running) running++;
      }
    }
    return { loaded, failed, running };
  }, [groups]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 24px' }}>
      {/* 顶部操作栏 */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          borderColor: 'var(--line)',
          background: 'var(--paper-0)',
        }}
        bodyStyle={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
      >
        <Space size={20} wrap>
          <Space size={6}>
            <AppstoreOutlined style={{ color: 'var(--indigo)' }} />
            <Text strong style={{ fontSize: 15 }}>插件管理</Text>
          </Space>
          <Space size={16}>
            <Tooltip title="已加载插件数">
              <Text style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                已加载 <Text strong style={{ color: 'var(--pine)', fontFamily: 'var(--font-mono)' }}>{stats.loaded}</Text>
              </Text>
            </Tooltip>
            <Tooltip title="运行中的 task 插件">
              <Text style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                运行中 <Text strong style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>{stats.running}</Text>
              </Text>
            </Tooltip>
            {stats.failed > 0 && (
              <Tooltip title="加载失败数">
                <Text style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  失败 <Text strong style={{ color: 'var(--rouge)', fontFamily: 'var(--font-mono)' }}>{stats.failed}</Text>
                </Text>
              </Tooltip>
            )}
          </Space>
        </Space>
        <Space>
          <Tooltip title="刷新列表">
            <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading} />
          </Tooltip>
          <Popconfirm
            title="重载所有插件"
            okText="确认重载"
            cancelText="取消"
            onConfirm={handleReloadAll}
          >
            <Button type="primary" icon={<ReloadOutlined />} loading={loading}>
              重载全部
            </Button>
          </Popconfirm>
        </Space>
      </Card>

      <Spin spinning={loading && stats.loaded === 0 && stats.failed === 0}>
        {stats.loaded === 0 && stats.failed === 0 && !loading ? (
          <Card style={{ borderColor: 'var(--line)' }}>
            <Empty
              description={
                <span>
                  暂无插件，请将插件放入 <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--indigo)' }}>plugins/</code> 目录后点击「重载全部」
                </span>
              }
            />
          </Card>
        ) : (
          PLUGIN_TYPES.map((pt) => {
            const group = groups[pt.value];
            if (!group || (!group.loaded?.length && !group.failed?.length)) return null;
            const meta = TYPE_META[pt.value];
            return (
              <Card
                key={pt.value}
                size="small"
                style={{
                  marginBottom: 16,
                  borderColor: 'var(--line)',
                  background: 'var(--paper-1)',
                }}
                title={
                  <Space size={8}>
                    <span style={{ color: meta.color, fontSize: 15 }}>{meta.icon}</span>
                    <Text strong style={{ fontSize: 14 }}>{meta.label}</Text>
                    <Tag
                      style={{
                        fontSize: 10.5,
                        margin: 0,
                        padding: '0 6px',
                        lineHeight: '18px',
                        borderRadius: 4,
                        background: 'var(--paper-2)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink-3)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {(group.loaded || []).length + (group.failed || []).length}
                    </Tag>
                  </Space>
                }
                extra={
                  <Tooltip title={`重载所有${meta.label}插件`}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined spin={reloadingType === pt.value} />}
                      onClick={() => handleReloadType(pt.value)}
                      disabled={!!reloadingType}
                    >
                      重载类型
                    </Button>
                  </Tooltip>
                }
                bodyStyle={{ padding: '14px 16px' }}
              >
                <Row gutter={[12, 12]}>
                  {(group.loaded || []).map((plugin) => (
                    <Col key={plugin.name} xs={24} sm={12} md={8} lg={6} xl={6}>
                      <PluginCard
                        plugin={plugin}
                        reloading={reloadingName === `${pt.value}/${plugin.name}`}
                        onReload={(name) => handleReloadOne(pt.value, name)}
                        onStart={pt.value === 'task' ? handleStartTask : undefined}
                        onStop={pt.value === 'task' ? handleStopTask : undefined}
                        onConfig={pt.value === 'task' ? handleOpenTaskConfig : undefined}
                      />
                    </Col>
                  ))}
                  {(group.failed || []).map((err) => (
                    <Col key={`failed-${err.Name}`} xs={24} sm={12} md={8} lg={6} xl={6}>
                      <FailedCard err={err} />
                    </Col>
                  ))}
                </Row>
              </Card>
            );
          })
        )}
      </Spin>

      {/* task 插件参数配置 Modal */}
      <Modal
        title={configModal.plugin ? `配置参数 - ${configModal.plugin.display || configModal.plugin.name}` : '配置参数'}
        open={configModal.open}
        onCancel={() => setConfigModal(s => ({ ...s, open: false }))}
        onOk={handleSaveTaskConfig}
        confirmLoading={configModal.saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        {configModal.plugin && (
          <div>
            {configModal.plugin.description && (
              <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 12 }}>
                {configModal.plugin.description}
              </Paragraph>
            )}
            <Form layout="vertical">
              <Form.Item label="自动启动">
                <Switch
                  checked={configModal.enable}
                  onChange={(v) => setConfigModal(s => ({ ...s, enable: v }))}
                />
                <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                  开启后系统启动时自动运行该任务
                </Text>
              </Form.Item>

              {(configModal.plugin.params || []).length === 0 ? (
                <Text type="secondary">该插件没有可配置的参数</Text>
              ) : (
                (configModal.plugin.params || []).map((spec) => {
                  const val = configModal.params[spec.key];
                  const label = spec.label || spec.key;
                  const onChange = (v: any) =>
                    setConfigModal(s => ({ ...s, params: { ...s.params, [spec.key]: v } }));
                  switch (spec.type) {
                    case 'int':
                    case 'number':
                    case 'float':
                      return (
                        <Form.Item key={spec.key} label={label} tooltip={spec.description}>
                          <InputNumber
                            value={val}
                            min={spec.min !== undefined ? spec.min : undefined}
                            max={spec.max !== undefined ? spec.max : undefined}
                            onChange={onChange}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      );
                    case 'bool':
                      return (
                        <Form.Item key={spec.key} label={label} tooltip={spec.description}>
                          <Switch checked={!!val} onChange={onChange} />
                        </Form.Item>
                      );
                    case 'select':
                      return (
                        <Form.Item key={spec.key} label={label} tooltip={spec.description}>
                          <Select
                            value={val}
                            options={(spec.options || []).map(o => ({ value: o, label: o }))}
                            onChange={onChange}
                            allowClear
                          />
                        </Form.Item>
                      );
                    case 'string':
                    default:
                      return (
                        <Form.Item key={spec.key} label={label} tooltip={spec.description}>
                          <Input value={val} onChange={(e) => onChange(e.target.value)} />
                        </Form.Item>
                      );
                  }
                })
              )}
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PluginManager;
