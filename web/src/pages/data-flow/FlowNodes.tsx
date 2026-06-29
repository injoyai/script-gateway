import React, { memo, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Switch, Tag, Tooltip, Modal, Select } from 'antd';
import {
  GlobalOutlined,
  SendOutlined,
  ApiOutlined,
  UsbOutlined,
  WifiOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import BusynessBadge from './BusynessBadge';
import type { BusynessBadgeData } from '../../services/busynessApi';
import { listTopics } from '../../services/dataFlowApi';

// ============ 节点数据类型 ============

export type NodeKind = 'listenerParent' | 'listener' | 'chain' | 'dispatcher' | 'viewer' | 'mocker';

export interface ChildItem {
  id: number;
  name: string;
  type: string;
  enable: boolean;
  running?: boolean;
  errorInfo?: string;
  topic?: string;
  outTopic?: string;
  summary?: string;
}

export interface FlowNodeData {
  kind: NodeKind;
  id: number;
  name: string;
  type: string;
  enable: boolean;
  running?: boolean;
  errorInfo?: string;
  topic?: string;       // 入站/订阅 topic
  outTopic?: string;    // 出站 topic
  topics?: string[];    // 分发器订阅的 topics
  summary?: string;     // 摘要（端口/地址/处理器列表等）
  multiOutput?: boolean; // 是否为多路输出（如 script 处理器 fan-out）
  children?: ChildItem[]; // 父容器内的子项列表
  onToggle?: (id: number, enable: boolean) => void;
  onEdit?: (id: number) => void;
  onCreateChild?: (id: number) => void;
  onDelete?: (id: number) => void;
  onToggleChild?: (id: number, enable: boolean) => void;
  onEditChild?: (id: number) => void;
  onDeleteChild?: (id: number) => void;
  onView?: (id: number) => void; // 查看器：点击查看实时数据
  onTrigger?: (id: number) => void; // mocker：手动触发一次
  // 繁忙度徽章数据（由 DataFlowCanvas 轮询 /api/metrics/subscribers 后注入）
  busyness?: BusynessBadgeData;
  [key: string]: unknown;
}

// ============ 类型元信息 ============

const LISTENER_TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  tcp_conn:          { icon: <ApiOutlined />,      color: '#3a4f7a', label: 'TCP' },
  udp_conn:          { icon: <ApiOutlined />,      color: '#3a5a7a', label: 'UDP' },
  serial_conn:       { icon: <UsbOutlined />,       color: '#5a4a3a', label: '串口' },
  script_conn:       { icon: <FileTextOutlined />, color: '#4a3a5a', label: '脚本' },
  http_route:        { icon: <GlobalOutlined />,    color: '#3a4f7a', label: 'HTTP' },
  mqtt_subscription: { icon: <WifiOutlined />,     color: '#3a5a4f', label: 'MQTT' },
};

const DISPATCHER_TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  http:      { icon: <GlobalOutlined />,    color: '#b85c00', label: 'HTTP' },
  mqtt:      { icon: <WifiOutlined />,       color: '#b87a3a', label: 'MQTT' },
  websocket: { icon: <GlobalOutlined />,    color: '#b89a3a', label: 'WS' },
  script:    { icon: <FileTextOutlined />, color: '#7a5c00', label: '脚本' },
  rocketmq:  { icon: <SendOutlined />,       color: '#b83a5a', label: 'RocketMQ' },
  plugin:    { icon: <ThunderboltOutlined />,color: '#7a3a8a', label: '插件' },
};

// ============ 状态指示器 ============

const StatusDot: React.FC<{ enable: boolean; running?: boolean; error?: string }> = ({ enable, running, error }) => {
  let color = '#bbb';
  if (!enable) color = '#bbb';
  else if (error) color = '#ff4d4f';
  else if (running) color = '#52c41a';
  else color = '#faad14';
  return (
    <Tooltip title={error || (enable ? (running ? '运行中' : '已启用未运行') : '已禁用')}>
      <span style={{
        display: 'inline-block',
        width: 8, height: 8, borderRadius: '50%',
        background: color,
        boxShadow: running ? `0 0 6px ${color}` : 'none',
        transition: 'all 0.3s',
      }} />
    </Tooltip>
  );
};

// ============ 通用节点卡片 ============

const NodeCard: React.FC<{
  kind: NodeKind;
  data: FlowNodeData;
  meta: { icon: React.ReactNode; color: string; label: string };
  accent: string;
  children?: React.ReactNode;
}> = ({ data, meta, accent, children }) => {
  return (
    <div
      style={{
        position: 'relative',
        background: '#fff',
        border: `2px solid ${accent}`,
        borderRadius: 10,
        width: 240,
        boxSizing: 'border-box',
        boxShadow: data.running
          ? `0 4px 12px ${accent}33`
          : '0 2px 6px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.3s, transform 0.15s',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* 头部 */}
      <div style={{
        background: accent,
        color: '#fff',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
      }}>
        {meta.icon}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.label}
        </span>
        <BusynessBadge data={data.busyness} />
        <StatusDot enable={data.enable} running={data.running} error={data.errorInfo} />
      </div>

      {/* 主体 */}
      <div style={{ padding: '8px 10px' }}>
        <div
          style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 4, cursor: 'pointer' }}
          onClick={() => data.onEdit?.(data.id)}
        >
          {data.name}
        </div>
        {data.summary && (
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{data.summary}</div>
        )}
        {children}
        {/* topic 标签 */}
        {data.topic && (
          <div style={{ marginTop: 4 }}>
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>→ {data.topic}</Tag>
          </div>
        )}
        {data.outTopic && data.outTopic !== data.topic && (
          <div style={{ marginTop: 2 }}>
            <Tag color="green" style={{ fontSize: 10, margin: 0 }}>→ {data.outTopic}</Tag>
          </div>
        )}
        {data.topics && data.topics.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {data.topics.map((t, i) => (
              <Tag key={i} color="orange" style={{ fontSize: 10, margin: 0 }}>← {t}</Tag>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{
        padding: '4px 10px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#aaa' }}>#{data.id}</span>
          {data.onDelete && (
            <Tooltip title="删除">
              <DeleteOutlined
                style={{ color: '#999', fontSize: 12, padding: 2, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  Modal.confirm({
                    title: `确认删除「${data.name}」？`,
                    content: '删除后不可恢复，相关连线也会移除。',
                    okText: '删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => data.onDelete?.(data.id),
                  });
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
              />
            </Tooltip>
          )}
        </div>
        <Switch
          size="small"
          checked={data.enable}
          onChange={(checked, e) => {
            e.stopPropagation();
            data.onToggle?.(data.id, checked);
          }}
        />
      </div>
    </div>
  );
};

// ============ 监听器节点（列表项样式） ============

export const ListenerNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const meta = LISTENER_TYPE_META[d.type] || { icon: <ApiOutlined />, color: '#3a4f7a', label: d.type };
  return (
    <>
      <Handle type="source" position={Position.Right} style={{ background: meta.color, width: 10, height: 10 }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : meta.color}`,
          borderRadius: 10,
          width: 260,
          boxSizing: 'border-box',
          boxShadow: d.running
            ? `0 4px 12px ${meta.color}33`
            : selected
              ? '0 4px 12px rgba(22,119,255,0.18)'
              : '0 2px 6px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.3s, transform 0.15s',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* 头部 */}
        <div style={{
          background: meta.color,
          color: '#fff',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {meta.icon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.label}
          </span>
          <BusynessBadge data={d.busyness} />
          <StatusDot enable={d.enable} running={d.running} error={d.errorInfo} />
        </div>

        {/* 主体 */}
        <div style={{ padding: '8px 10px' }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 4, cursor: 'pointer' }}
            onClick={() => d.onEdit?.(d.id)}
          >
            {d.name}
          </div>
          {d.summary && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{d.summary}</div>
          )}
          {/* topic 标签 */}
          {d.topic && (
            <div style={{ marginTop: 4 }}>
              <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>→ {d.topic}</Tag>
            </div>
          )}
          {d.outTopic && d.outTopic !== d.topic && (
            <div style={{ marginTop: 2 }}>
              <Tag color="green" style={{ fontSize: 10, margin: 0 }}>→ {d.outTopic}</Tag>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Tooltip title="删除">
            <DeleteOutlined
              style={{ color: '#999', fontSize: 12, padding: 2 }}
              onClick={(e) => { e.stopPropagation(); d.onDelete?.(d.id); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
            />
          </Tooltip>
          <Switch
            size="small"
            checked={d.enable}
            onChange={(checked, e) => { e.stopPropagation(); d.onToggle?.(d.id, checked); }}
            onClick={(_, e) => e.stopPropagation()}
          />
        </div>
      </div>
    </>
  );
});

// ============ 处理器链节点 ============

export const ChainNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const meta = { icon: <ThunderboltOutlined />, color: '#b85c00', label: '处理器链' };
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: meta.color, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: meta.color, width: 10, height: 10 }} />
      <NodeCard kind="chain" data={d} meta={meta} accent={meta.color} />
    </>
  );
});

// ============ 分发器节点 ============

export const DispatcherNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const meta = DISPATCHER_TYPE_META[d.type] || { icon: <SendOutlined />, color: '#7a3a8a', label: d.type };
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: meta.color, width: 10, height: 10 }} />
      <NodeCard kind="dispatcher" data={d} meta={meta} accent={meta.color} />
    </>
  );
});

// ============ 订阅查看器节点 ============

export const ViewerNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const accent = '#1677ff';
  const meta = { icon: <EyeOutlined />, color: accent, label: '订阅查看器' };
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: accent, width: 10, height: 10 }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : accent}`,
          borderRadius: 10,
          width: 240,
          boxSizing: 'border-box',
          boxShadow: d.enable
            ? `0 4px 12px ${accent}33`
            : selected
              ? '0 4px 12px rgba(22,119,255,0.18)'
              : '0 2px 6px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.3s, transform 0.15s',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* 头部 */}
        <div style={{
          background: accent,
          color: '#fff',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {meta.icon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.label}
          </span>
          <BusynessBadge data={d.busyness} />
          <StatusDot enable={d.enable} running={d.enable} error={d.errorInfo} />
        </div>

        {/* 主体 */}
        <div style={{ padding: '8px 10px' }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 4, cursor: 'pointer' }}
            onClick={() => d.onView?.(d.id)}
          >
            {d.name}
          </div>
          {d.summary && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{d.summary}</div>
          )}
          {/* 订阅 topics */}
          {d.topics && d.topics.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 4 }}>
              {d.topics.map((t, i) => (
                <Tag key={i} color="blue" style={{ fontSize: 10, margin: 0 }}>← {t}</Tag>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Tooltip title="查看实时数据">
              <EyeOutlined
                style={{ color: '#1677ff', fontSize: 13, padding: 2, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); d.onView?.(d.id); }}
              />
            </Tooltip>
            <Tooltip title="删除">
              <DeleteOutlined
                style={{ color: '#999', fontSize: 12, padding: 2, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  Modal.confirm({
                    title: `确认删除「${d.name}」？`,
                    content: '删除后不可恢复，相关连线也会移除。',
                    okText: '删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => d.onDelete?.(d.id),
                  });
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <EditOutlined
                style={{ color: '#999', fontSize: 12, padding: 2, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); d.onEdit?.(d.id); }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
              />
            </Tooltip>
          </div>
          <Switch
            size="small"
            checked={d.enable}
            onChange={(checked, e) => { e.stopPropagation(); d.onToggle?.(d.id, checked); }}
            onClick={(_, e) => e.stopPropagation()}
          />
        </div>
      </div>
    </>
  );
});

// ============ Mocker 节点 ============

export const MockerNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const accent = '#722ed1';
  const meta = { icon: <ExperimentOutlined />, color: accent, label: 'Mocker' };
  return (
    <>
      <Handle type="source" position={Position.Right} style={{ background: accent, width: 10, height: 10 }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : accent}`,
          borderRadius: 10,
          width: 240,
          boxSizing: 'border-box',
          boxShadow: d.enable
            ? `0 4px 12px ${accent}33`
            : selected
              ? '0 4px 12px rgba(22,119,255,0.18)'
              : '0 2px 6px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.3s, transform 0.15s',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* 头部 */}
        <div style={{
          background: accent,
          color: '#fff',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {meta.icon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.label}
          </span>
          <BusynessBadge data={d.busyness} />
          <StatusDot enable={d.enable} running={d.running} error={d.errorInfo} />
        </div>

        {/* 主体 */}
        <div style={{ padding: '8px 10px' }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 4, cursor: 'pointer' }}
            onClick={() => d.onEdit?.(d.id)}
          >
            {d.name}
          </div>
          {d.summary && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{d.summary}</div>
          )}
          {d.outTopic && (
            <div style={{ marginTop: 4 }}>
              <Tag color="green" style={{ fontSize: 10, margin: 0 }}>→ {d.outTopic}</Tag>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Tooltip title="手动触发一次">
              <PlayCircleOutlined
                style={{ color: '#722ed1', fontSize: 13, padding: 2, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); d.onTrigger?.(d.id); }}
              />
            </Tooltip>
            <Tooltip title="删除">
              <DeleteOutlined
                style={{ color: '#999', fontSize: 12, padding: 2 }}
                onClick={(e) => { e.stopPropagation(); d.onDelete?.(d.id); }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
              />
            </Tooltip>
          </div>
          <Switch
            size="small"
            checked={d.enable}
            onChange={(checked, e) => { e.stopPropagation(); d.onToggle?.(d.id, checked); }}
            onClick={(_, e) => e.stopPropagation()}
          />
        </div>
      </div>
    </>
  );
});

export const ListenerParentNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const typeLabel = d.type === 'http_server' ? 'HTTP 服务' : d.type === 'mqtt_client' ? 'MQTT 客户端' : d.type;
  const children = d.children || [];

  return (
    <div style={{
      width: '100%', height: '100%',
      border: `1px solid ${selected ? '#1677ff' : '#91caff'}`,
      borderRadius: 12,
      background: 'linear-gradient(180deg, #f0f7ff 0%, #fafcff 100%)',
      boxShadow: selected ? '0 8px 24px rgba(22,119,255,0.18)' : '0 6px 18px rgba(22,119,255,0.08)',
      boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 头部标题+操作 */}
      <div style={{
        padding: '10px 14px',
        background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)',
        color: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>
              <GlobalOutlined />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, opacity: 0.9 }}>{typeLabel}</span>
              </div>
              <div
                style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onClick={() => d.onEdit?.(d.id)}
                title={d.name}
              >
                {d.name}
              </div>
            </div>
          </div>
          {/* 右上角：队列拥挤度 + 状态灯（与其他节点统一） */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BusynessBadge data={d.busyness} />
            <StatusDot enable={d.enable} running={d.running} error={d.errorInfo} />
          </div>
        </div>
        {d.summary && (
          <div style={{ fontSize: 11, lineHeight: 1.4, color: 'rgba(255,255,255,0.85)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.summary}
          </div>
        )}
      </div>

      {/* 子项列表区（不允许滚动条，所有子项全部显示） */}
      <div style={{ flex: 1, padding: '8px 10px', overflow: 'visible', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '16px 0' }}>
            暂无子项，点击下方「+」添加
          </div>
        ) : (
          children.map((child) => {
            const meta = LISTENER_TYPE_META[child.type] || { icon: <ApiOutlined />, color: '#3a4f7a', label: child.type };
            const handleId = `child-${child.id}`;
            return (
              <div
                key={child.id}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px',
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 6,
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e6f4ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }}
                onClick={() => d.onEditChild?.(child.id)}
              >
                {/* 子项的连线 Handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  style={{ background: meta.color, width: 8, height: 8, border: 'none', right: -4 }}
                />
                <span style={{ color: meta.color, display: 'inline-flex', flexShrink: 0, fontSize: 12 }}>{meta.icon}</span>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                  <Tooltip title={child.errorInfo || (child.enable ? (child.running ? '运行中' : '已启用未运行') : '已禁用')}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {child.name}
                    </span>
                  </Tooltip>
                  <StatusDot enable={child.enable} running={child.running} error={child.errorInfo} />
                  {child.topic && (
                    <Tag color="blue" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {child.topic}
                    </Tag>
                  )}
                </div>
                <Tooltip title="删除">
                  <DeleteOutlined
                    style={{ color: '#bbb', fontSize: 11, flexShrink: 0, padding: 1 }}
                    onClick={(e) => { e.stopPropagation(); d.onDeleteChild?.(child.id); }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                  />
                </Tooltip>
                <Switch
                  size="small"
                  checked={child.enable}
                  onChange={(checked, e) => { e.stopPropagation(); d.onToggleChild?.(child.id, checked); }}
                  onClick={(_, e) => e.stopPropagation()}
                />
              </div>
            );
          })
        )}
      </div>

      {/* 底部操作栏（与其他节点一致：操作放下方） */}
      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {d.onDelete && (
            <Tooltip title="删除">
              <DeleteOutlined
                style={{ color: '#999', fontSize: 12, padding: 2, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  Modal.confirm({
                    title: `确认删除「${d.name}」？`,
                    content: '删除父容器将级联清理其下所有子项，不可恢复。',
                    okText: '删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => d.onDelete?.(d.id),
                  });
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
              />
            </Tooltip>
          )}
          <Tooltip title="新增子项">
            <PlusOutlined
              style={{ color: '#1677ff', fontSize: 13, padding: 2, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); d.onCreateChild?.(d.id); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#0958d9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#1677ff'; }}
            />
          </Tooltip>
        </div>
        <Switch
          size="small"
          checked={d.enable}
          onChange={(checked, e) => { e.stopPropagation(); d.onToggle?.(d.id, checked); }}
          onClick={(_, e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
});

export const nodeTypes = {
  listenerParent: ListenerParentNode,
  listener: ListenerNode,
  chain: ChainNode,
  dispatcher: DispatcherNode,
  viewer: ViewerNode,
  mocker: MockerNode,
};

// ============ 表单分区标题（用于新建/编辑弹窗） ============
// 替代 Divider + Tag 的组合，更精致克制的视觉分割
export const SectionTitle: React.FC<{ title: string; color?: 'blue' | 'purple' }> = ({ title, color = 'blue' }) => {
  const accent = color === 'purple' ? '#722ed1' : '#1677ff';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 20,
      marginBottom: 12,
      paddingBottom: 8,
      borderBottom: '1px solid #f0f0f0',
    }}>
      <span style={{
        width: 3,
        height: 14,
        background: accent,
        borderRadius: 2,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: '#262626',
        letterSpacing: 0.3,
      }}>
        {title}
      </span>
    </div>
  );
};

// ============ 订阅 Topics 多选下拉 ============
// 从后端拉取当前可用 topic 列表，支持多选；允许手动输入未列出的 topic
export const TopicMultiSelect: React.FC<{ value?: string[]; onChange?: (v: string[]) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listTopics();
        if (cancelled) return;
        setOptions(list.map((t) => ({ label: `${t.topic} (深度 ${t.depth})`, value: t.topic })));
      } catch {
        // 拉取失败时保持空选项，用户仍可手动输入
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Select
      mode="tags"
      value={value}
      onChange={onChange}
      placeholder={placeholder || '选择或输入 topic'}
      options={options}
      tokenSeparators={[',']}
      style={{ width: '100%' }}
    />
  );
};
