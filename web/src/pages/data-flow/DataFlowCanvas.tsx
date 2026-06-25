import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type EdgeChange,
  type NodeTypes,
  type XYPosition,
  MarkerType,
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Space, Spin, message, Input, Tag, Tooltip, Empty, Modal, Form, Divider } from 'antd';
import {
  ReloadOutlined,
  LayoutOutlined,
  SearchOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  SendOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  createListenerConn,
  createListenerParent,
  createProcessorChain,
  createDispatcher,
  deleteListenerConn,
  fetchAllFlowData,
  getFlowLayout,
  saveFlowLayout,
  toggleListenerParent,
  toggleListenerConn,
  toggleProcessorChain,
  toggleDispatcher,
  toggleViewer,
  createViewer,
  updateViewer,
  toggleMocker,
  createMocker,
  triggerMocker,
  deleteMocker,
  updateProcessorChain,
  updateDispatcher,
  type FlowData,
} from '../../services/dataFlowApi';
import { nodeTypes, type FlowNodeData } from './FlowNodes';
import { InlineEditPanel, type EditTarget } from './InlineEditPanel';
import ViewerStreamModal from './ViewerStreamModal';
import { fetchBusynessBadges, type BusynessBadgeData } from '../../services/busynessApi';

// ============ 工具函数 ============

// 解析 JSON
const parseJSON = (s?: string): any => {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
};

// 生成节点摘要
const buildSummary = (kind: string, type: string, data: any): string => {
  if (kind === 'listener') {
    switch (type) {
      case 'http_server':
        return `HTTP 服务 ${data.port || parseJSON(data.config).port || ''}`.trim();
      case 'mqtt_client':
        return parseJSON(data.config).broker || data.broker || '';
      case 'tcp_conn':
      case 'udp_conn':
        return data.address || data.config?.address || '';
      case 'serial_conn':
        return [data.port || data.config?.port, data.baud_rate || data.config?.baud_rate].filter(Boolean).join(' @ ');
      case 'http_route':
        return [data.path || data.config?.path, data.methods || data.config?.methods].filter(Boolean).join(' ');
      case 'mqtt_subscription':
        return data.sub_topic || data.config?.sub_topic || '';
      case 'script_conn':
        return '脚本监听';
      default:
        return '';
    }
  }
  if (kind === 'chain') {
    try {
      const procs = JSON.parse(data.processors || '[]');
      const procSummary = procs.length === 0 ? '无处理器' : procs.map((p: any) => p.key).join(' → ');
      return data.out_topic ? `${procSummary} · 发布到 ${data.out_topic}` : procSummary;
    } catch {
      return data.out_topic ? `发布到 ${data.out_topic}` : '';
    }
  }
  if (kind === 'dispatcher') {
    const cfg = parseJSON(data.config);
    switch (type) {
      case 'http':
        return cfg.url || '';
      case 'mqtt':
        return [cfg.broker, cfg.pub_topic].filter(Boolean).join(' → ');
      case 'websocket':
        return cfg.address || '';
      case 'script':
        return '脚本推送';
      case 'plugin':
        return cfg.plugin_name || '';
      default:
        return '';
    }
  }
  return '';
};

// ============ 构建节点和边 ============

interface BuildResult {
  nodes: Node[];
  edges: Edge[];
}


const buildGraph = (data: FlowData, callbacks: {
  onToggleListenerParent: (id: number, enable: boolean) => void;
  onToggleListener: (id: number, enable: boolean) => void;
  onToggleChain: (id: number, enable: boolean) => void;
  onToggleDispatcher: (id: number, enable: boolean) => void;
  onEditListenerParent: (id: number) => void;
  onCreateListenerChild: (id: number) => void;
  onEditListener: (id: number) => void;
  onEditChain: (id: number) => void;
  onEditDispatcher: (id: number) => void;
  onToggleViewer: (id: number, enable: boolean) => void;
  onEditViewer: (id: number) => void;
  onViewViewer: (id: number) => void;
  onToggleMocker: (id: number, enable: boolean) => void;
  onEditMocker: (id: number) => void;
  onTriggerMocker: (id: number) => void;
  onDeleteMocker: (id: number) => void;
  onDeleteListener: (id: number) => void;
}, savedPositions: Record<string, XYPosition>): BuildResult => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const COL_X = { mocker: -260, listener: 80, chain: 460, dispatcher: 800, viewer: 1140 };
  const NODE_GAP_Y = 160;
  let listenerY = 60;
  let chainY = 60;
  let dispatcherY = 60;
  let viewerY = 60;
  let mockerY = 60;

  // 父容器内子项的布局参数（用于高度计算）
  const parentWidth = 320;
  const headerHeight = 76;
  const childRowHeight = 32;
  const childRowGap = 4;
  const listPadding = 16;

  // 记录每个子项的 source 信息：{ sourceId, sourceHandle?, topic }
  const listenerSources: { parentId: string; childId: number; topic: string; standalone?: boolean }[] = [];

  for (const parent of data.parents) {
    const childConns = data.conns.filter((conn) => conn.parent_id === parent.id);
    const parentId = `listener-parent-${parent.id}`;
    const childCount = Math.max(1, childConns.length);
    const listHeight = childCount * childRowHeight + Math.max(0, childCount - 1) * childRowGap + listPadding;
    const parentHeight = Math.max(headerHeight + 48, headerHeight + listHeight);

    // 构建子项数据
    const childrenData = childConns.map((conn) => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      enable: conn.enable,
      running: conn.running,
      errorInfo: conn.error_info,
      topic: conn.topic,
      outTopic: conn.out_topic,
      summary: buildSummary('listener', conn.type, conn),
    }));

    nodes.push({
      id: parentId,
      type: 'listenerParent',
      position: savedPositions[parentId] || { x: COL_X.listener, y: listenerY },
      data: {
        kind: 'listenerParent',
        id: parent.id,
        name: parent.name,
        type: parent.type,
        enable: parent.enable,
        running: childConns.some((item) => item.running),
        errorInfo: childConns.find((item) => item.error_info)?.error_info,
        summary: buildSummary('listener', parent.type, parent),
        children: childrenData,
        onToggle: callbacks.onToggleListenerParent,
        onEdit: callbacks.onEditListenerParent,
        onCreateChild: callbacks.onCreateListenerChild,
        onToggleChild: callbacks.onToggleListener,
        onEditChild: callbacks.onEditListener,
        onDeleteChild: callbacks.onDeleteListener,
      } as any,
      style: { width: parentWidth, height: parentHeight, zIndex: 0, padding: 0 },
    });

    // 记录子项的 topic 用于边构建
    for (const conn of childConns) {
      if (conn.topic) {
        listenerSources.push({ parentId, childId: conn.id, topic: conn.topic });
      }
    }

    listenerY += parentHeight + 28;
  }

  // 处理独立监听器（parent_id=0 或父容器不存在的子项）：作为独立节点显示，不用父级容器
  const parentIds = new Set(data.parents.map((p) => p.id));
  const standaloneConns = data.conns.filter((conn) => conn.parent_id === 0 || !parentIds.has(conn.parent_id));
  for (const conn of standaloneConns) {
    const nodeId = `listener-${conn.id}`;
    nodes.push({
      id: nodeId,
      type: 'listener',
      position: savedPositions[nodeId] || { x: COL_X.listener, y: listenerY },
      data: {
        kind: 'listener',
        id: conn.id,
        name: conn.name,
        type: conn.type,
        enable: conn.enable,
        running: conn.running,
        errorInfo: conn.error_info,
        topic: conn.topic,
        outTopic: conn.out_topic,
        summary: buildSummary('listener', conn.type, conn),
        onToggle: callbacks.onToggleListener,
        onEdit: callbacks.onEditListener,
        onDelete: callbacks.onDeleteListener,
      } as any,
      style: { width: 260 },
    });

    if (conn.topic) {
      listenerSources.push({ parentId: nodeId, childId: conn.id, topic: conn.topic, standalone: true });
    }

    listenerY += 100;
  }

  const chainNodes: { id: string; topic: string; outTopic?: string }[] = [];
  for (const chain of data.chains) {
    const summary = buildSummary('chain', '', chain);
    const nodeData: FlowNodeData = {
      kind: 'chain',
      id: chain.id,
      name: chain.name,
      type: 'chain',
      enable: chain.enable,
      topic: chain.topic,
      outTopic: chain.out_topic,
      summary,
      onToggle: callbacks.onToggleChain,
      onEdit: callbacks.onEditChain,
    };
    const nodeId = `chain-${chain.id}`;
    nodes.push({
      id: nodeId,
      type: 'chain',
      position: savedPositions[nodeId] || { x: COL_X.chain, y: chainY },
      data: nodeData as any,
    });
    chainY += NODE_GAP_Y;
    if (chain.topic || chain.out_topic) {
      chainNodes.push({ id: nodeId, topic: chain.topic, outTopic: chain.out_topic });
    }
  }

  for (const disp of data.dispatchers) {
    const summary = buildSummary('dispatcher', disp.type, disp);
    const topics = parseJSON(disp.topics);
    const topicList = Array.isArray(topics) ? topics : [];
    const nodeData: FlowNodeData = {
      kind: 'dispatcher',
      id: disp.id,
      name: disp.name,
      type: disp.type,
      enable: disp.enable,
      topics: topicList,
      summary,
      onToggle: callbacks.onToggleDispatcher,
      onEdit: callbacks.onEditDispatcher,
    };
    const nodeId = `dispatcher-${disp.id}`;
    nodes.push({
      id: nodeId,
      type: 'dispatcher',
      position: savedPositions[nodeId] || { x: COL_X.dispatcher, y: dispatcherY },
      data: nodeData as any,
    });
    dispatcherY += NODE_GAP_Y;
  }

  // 查看器节点
  const viewerNodes: { id: string; topics: string[] }[] = [];
  for (const viewer of data.viewers || []) {
    const topics = parseJSON(viewer.topics);
    const topicList = Array.isArray(topics) ? topics : [];
    const summary = topicList.length > 0 ? `订阅 ${topicList.length} 个 topic` : '未订阅';
    const nodeData: FlowNodeData = {
      kind: 'viewer',
      id: viewer.id,
      name: viewer.name,
      type: 'viewer',
      enable: viewer.enable,
      topics: topicList,
      summary,
      onToggle: callbacks.onToggleViewer,
      onEdit: callbacks.onEditViewer,
      onView: callbacks.onViewViewer,
    };
    const nodeId = `viewer-${viewer.id}`;
    nodes.push({
      id: nodeId,
      type: 'viewer',
      position: savedPositions[nodeId] || { x: COL_X.viewer, y: viewerY },
      data: nodeData as any,
    });
    viewerNodes.push({ id: nodeId, topics: topicList });
    viewerY += NODE_GAP_Y;
  }

  // Mocker 节点（虚拟数据发送器，向 topic 注入数据）
  const mockerNodes: { id: string; topic: string }[] = [];
  for (const mocker of data.mockers || []) {
    const intervalLabel = mocker.interval > 0 ? `定时 ${mocker.interval}ms` : '仅手动';
    const summary = `${intervalLabel}${mocker.payload ? ` · ${mocker.payload.length}B` : ''}`;
    const nodeData: FlowNodeData = {
      kind: 'mocker',
      id: mocker.id,
      name: mocker.name,
      type: 'mocker',
      enable: mocker.enable,
      running: mocker.enable && mocker.interval > 0,
      outTopic: mocker.topic,
      summary,
      onToggle: callbacks.onToggleMocker,
      onEdit: callbacks.onEditMocker,
      onTrigger: callbacks.onTriggerMocker,
      onDelete: callbacks.onDeleteMocker,
    };
    const nodeId = `mocker-${mocker.id}`;
    nodes.push({
      id: nodeId,
      type: 'mocker',
      position: savedPositions[nodeId] || { x: COL_X.mocker, y: mockerY },
      data: nodeData as any,
    });
    if (mocker.topic) {
      mockerNodes.push({ id: nodeId, topic: mocker.topic });
    }
    mockerY += NODE_GAP_Y;
  }

  const topicToChains = new Map<string, string[]>();
  for (const cn of chainNodes) {
    if (!cn.topic) continue;
    const arr = topicToChains.get(cn.topic) || [];
    arr.push(cn.id);
    topicToChains.set(cn.topic, arr);
  }

  const topicToDispatchers = new Map<string, string[]>();
  for (const disp of data.dispatchers) {
    const topics = parseJSON(disp.topics);
    if (Array.isArray(topics)) {
      for (const t of topics) {
        const arr = topicToDispatchers.get(t) || [];
        arr.push(`dispatcher-${disp.id}`);
        topicToDispatchers.set(t, arr);
      }
    }
  }

  // topic -> 查看器节点 ID 列表
  const topicToViewers = new Map<string, string[]>();
  for (const vn of viewerNodes) {
    for (const t of vn.topics) {
      if (!t) continue;
      const arr = topicToViewers.get(t) || [];
      arr.push(vn.id);
      topicToViewers.set(t, arr);
    }
  }

  // 添加边（支持 sourceHandle）
  const addEdgeWithHandle = (source: string, sourceHandle: string | undefined, target: string, label?: string) => {
    const handlePart = sourceHandle ? `-${sourceHandle}` : '';
    const id = `e-${source}${handlePart}-${target}`;
    if (edges.find((e) => e.id === id)) return;
    edges.push({
      id,
      source,
      sourceHandle,
      target,
      label: label || undefined,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: '#b85c00', strokeWidth: 2 },
    });
  };

  const addEdgeSafe = (source: string, target: string, label?: string) => {
    addEdgeWithHandle(source, undefined, target, label);
  };

  // 监听器子项 -> 链/分发器/查看器
  for (const ls of listenerSources) {
    const handleId = ls.standalone ? undefined : `child-${ls.childId}`;
    const chains = topicToChains.get(ls.topic) || [];
    for (const cid of chains) addEdgeWithHandle(ls.parentId, handleId, cid, ls.topic);
    const disps = topicToDispatchers.get(ls.topic) || [];
    for (const did of disps) addEdgeWithHandle(ls.parentId, handleId, did, ls.topic);
    const viewers = topicToViewers.get(ls.topic) || [];
    for (const vid of viewers) addEdgeWithHandle(ls.parentId, handleId, vid, ls.topic);
  }

  // 链 -> 链/分发器/查看器
  for (const cn of chainNodes) {
    const publishTopic = cn.outTopic || cn.topic;
    if (!publishTopic) continue;
    const downstreamChains = topicToChains.get(publishTopic) || [];
    for (const targetChainId of downstreamChains) {
      if (targetChainId === cn.id) continue;
      addEdgeSafe(cn.id, targetChainId, publishTopic);
    }
    const disps = topicToDispatchers.get(publishTopic) || [];
    for (const did of disps) addEdgeSafe(cn.id, did, publishTopic);
    const viewers = topicToViewers.get(publishTopic) || [];
    for (const vid of viewers) addEdgeSafe(cn.id, vid, publishTopic);
  }

  // Mocker -> 链/分发器/查看器（按 topic 匹配）
  for (const mn of mockerNodes) {
    const chains = topicToChains.get(mn.topic) || [];
    for (const cid of chains) addEdgeSafe(mn.id, cid, mn.topic);
    const disps = topicToDispatchers.get(mn.topic) || [];
    for (const did of disps) addEdgeSafe(mn.id, did, mn.topic);
    const viewers = topicToViewers.get(mn.topic) || [];
    for (const vid of viewers) addEdgeSafe(mn.id, vid, mn.topic);
  }

  return { nodes, edges };
};

// ============ 右键新建：类型定义 ============

type CreateKind = 'listenerParent' | 'chain' | 'dispatcher' | 'listenerConn' | 'viewer' | 'mocker';

interface CreateOption {
  key: string;
  label: string;
  kind: CreateKind;
  type: string;
  group: string;
}

const CREATE_OPTIONS: CreateOption[] = [
  // 监听器父容器
  { key: 'parent-http', label: 'HTTP 服务', kind: 'listenerParent', type: 'http_server', group: '监听器父容器' },
  { key: 'parent-mqtt', label: 'MQTT 客户端', kind: 'listenerParent', type: 'mqtt_client', group: '监听器父容器' },
  // 独立监听器（子项连接，parent_id=0）
  { key: 'conn-tcp', label: 'TCP 监听', kind: 'listenerConn', type: 'tcp_conn', group: '独立监听器' },
  { key: 'conn-udp', label: 'UDP 监听', kind: 'listenerConn', type: 'udp_conn', group: '独立监听器' },
  { key: 'conn-serial', label: '串口监听', kind: 'listenerConn', type: 'serial_conn', group: '独立监听器' },
  { key: 'conn-script', label: '脚本监听', kind: 'listenerConn', type: 'script_conn', group: '独立监听器' },
  // 处理器链
  { key: 'chain', label: '处理器链', kind: 'chain', type: 'chain', group: '处理器链' },
  // 分发器
  { key: 'disp-http', label: 'HTTP 分发器', kind: 'dispatcher', type: 'http', group: '分发器' },
  { key: 'disp-mqtt', label: 'MQTT 分发器', kind: 'dispatcher', type: 'mqtt', group: '分发器' },
  { key: 'disp-ws', label: 'WebSocket 分发器', kind: 'dispatcher', type: 'websocket', group: '分发器' },
  { key: 'disp-script', label: '脚本分发器', kind: 'dispatcher', type: 'script', group: '分发器' },
  { key: 'disp-rocketmq', label: 'RocketMQ 分发器', kind: 'dispatcher', type: 'rocketmq', group: '分发器' },
  { key: 'disp-plugin', label: '插件分发器', kind: 'dispatcher', type: 'plugin', group: '分发器' },
  // 订阅查看器
  { key: 'viewer', label: '订阅查看器', kind: 'viewer', type: 'viewer', group: '订阅查看器' },
  // 虚拟数据
  { key: 'mocker', label: '虚拟数据发送器', kind: 'mocker', type: 'mocker', group: '虚拟数据' },
];

// ============ 主组件 ============

const DataFlowCanvasInner: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [search, setSearch] = useState('');
  const [highlightTopic, setHighlightTopic] = useState<string>('');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const saveCbRef = useRef<(() => Promise<void>) | null>(null);
  const savedPositionsRef = useRef<Record<string, XYPosition>>({});

  // 右键新建相关状态
  const [createOption, setCreateOption] = useState<CreateOption | null>(null);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [viewerModalId, setViewerModalId] = useState<number | null>(null);

  const onNodesChange = useCallback((changes: any[]) => {
    onNodesChangeBase(changes);
    const nextPositions = { ...savedPositionsRef.current };
    let changed = false;
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        nextPositions[change.id] = change.position;
        changed = true;
      }
    }
    if (changed) {
      savedPositionsRef.current = nextPositions;
      void saveFlowLayout(nextPositions);
    }
  }, [onNodesChangeBase]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [positions, data] = await Promise.all([
        getFlowLayout(),
        fetchAllFlowData(),
      ]);
      savedPositionsRef.current = positions;
      setFlowData(data);
    } catch (e: any) {
      message.error(e?.message || '获取数据流失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onEdgesChange = useCallback(async (changes: EdgeChange[]) => {
    const removed = changes.filter((change) => change.type === 'remove' && typeof (change as any).id === 'string') as Array<{ id: string; type: 'remove' } & EdgeChange>;
    onEdgesChangeBase(changes);
    if (!removed.length || !flowData) return;

    try {
      for (const change of removed) {
        const edge = edges.find((item) => item.id === change.id);
        if (!edge) continue;
        const topic = String(edge.label || '');
        const [targetKind, targetIdStr] = edge.target.split('-');
        const targetId = parseInt(targetIdStr, 10);

        if (targetKind === 'chain') {
          const chain = flowData.chains.find((item) => item.id === targetId);
          if (chain && chain.topic === topic) {
            await updateProcessorChain({ id: targetId, topic: '' });
          }
        } else if (targetKind === 'dispatcher') {
          const disp = flowData.dispatchers.find((item) => item.id === targetId);
          if (disp) {
            const existing = parseJSON(disp.topics);
            const topicList: string[] = Array.isArray(existing) ? existing : [];
            const nextTopics = topicList.filter((item) => item !== topic);
            if (nextTopics.length !== topicList.length) {
              await updateDispatcher({ id: targetId, topics: JSON.stringify(nextTopics) });
            }
          }
        }
      }
      message.success('已移除连线关系');
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '删除连线失败');
      await fetchData();
    }
  }, [onEdgesChangeBase, flowData, edges, fetchData]);

  // 回调函数
  const handleToggleListenerParent = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleListenerParent(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleToggleListener = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleListenerConn(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleToggleChain = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleProcessorChain(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleToggleDispatcher = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleDispatcher(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleEditListenerParent = useCallback((id: number) => {
    if (!flowData) return;
    const parent = flowData.parents.find((p) => p.id === id);
    if (parent) setEditTarget({ kind: 'listenerParent', data: { ...parent } });
  }, [flowData]);

  const handleCreateListenerChild = useCallback(async (id: number) => {
    if (!flowData) return;
    const parent = flowData.parents.find((p) => p.id === id);
    if (!parent) return;
    try {
      const payload = parent.type === 'http_server'
        ? { parent_id: id, name: `${parent.name}-route`, type: 'http_route', enable: true, topic: '', out_topic: '', config: JSON.stringify({ path: '/', methods: 'GET' }) }
        : { parent_id: id, name: `${parent.name}-sub`, type: 'mqtt_subscription', enable: true, topic: '', out_topic: '', config: JSON.stringify({ sub_topic: '', qos: 0 }) };
      await createListenerConn(payload as any);
      message.success('已新增子项');
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '新增子项失败');
    }
  }, [flowData, fetchData]);

  const handleEditListener = useCallback((id: number) => {
    if (!flowData) return;
    const conn = flowData.conns.find(c => c.id === id);
    if (conn) setEditTarget({ kind: 'listener', data: { ...conn } });
  }, [flowData]);

  const handleDeleteListener = useCallback(async (id: number) => {
    Modal.confirm({
      title: '删除子项连接？',
      content: '删除后不可恢复，相关连线也会移除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteListenerConn(id);
          message.success('已删除');
          await fetchData();
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  }, [fetchData]);

  // 右键画布弹出新建菜单
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setCreateOption(null); // 先显示选择列表
    setCreateMenuOpen(true);
  }, []);

  // 提交创建
  const handleCreateSubmit = useCallback(async () => {
    if (!createOption) return;
    setCreating(true);
    try {
      const values = await createForm.validateFields();
      if (createOption.kind === 'listenerParent') {
        const cfg: any = {};
        if (createOption.type === 'http_server' && values.port) cfg.port = values.port;
        if (createOption.type === 'mqtt_client') {
          if (values.broker) cfg.broker = values.broker;
          if (values.client_id) cfg.client_id = values.client_id;
          if (values.username) cfg.username = values.username;
          if (values.password) cfg.password = values.password;
        }
        await createListenerParent({
          name: values.name,
          type: createOption.type,
          enable: false,
          config: JSON.stringify(cfg),
        } as any);
      } else if (createOption.kind === 'listenerConn') {
        // 独立监听器（子项连接，parent_id=0）
        const cfg: any = {};
        if (createOption.type === 'tcp_conn' || createOption.type === 'udp_conn') {
          if (values.address) cfg.address = values.address;
        } else if (createOption.type === 'serial_conn') {
          if (values.port) cfg.port = values.port;
          if (values.baud_rate) cfg.baud_rate = Number(values.baud_rate);
        } else if (createOption.type === 'script_conn') {
          if (values.content) cfg.content = values.content;
        }
        await createListenerConn({
          parent_id: 0,
          name: values.name,
          type: createOption.type,
          enable: false,
          topic: values.topic || '',
          out_topic: values.out_topic || '',
          config: JSON.stringify(cfg),
        } as any);
      } else if (createOption.kind === 'chain') {
        await createProcessorChain({
          name: values.name,
          topic: values.topic || '',
          out_topic: values.out_topic || '',
          enable: false,
        } as any);
      } else if (createOption.kind === 'dispatcher') {
        const cfg: any = {};
        if (createOption.type === 'http') {
          if (values.url) cfg.url = values.url;
          if (values.method) cfg.method = values.method;
        } else if (createOption.type === 'mqtt') {
          if (values.broker) cfg.broker = values.broker;
          if (values.client_id) cfg.client_id = values.client_id;
          if (values.username) cfg.username = values.username;
          if (values.password) cfg.password = values.password;
          if (values.pub_topic) cfg.pub_topic = values.pub_topic;
        } else if (createOption.type === 'websocket') {
          if (values.address) cfg.address = values.address;
        } else if (createOption.type === 'plugin') {
          if (values.plugin_name) cfg.plugin_name = values.plugin_name;
        }
        const topics = (values.topic_list || '').split(',').map((t: string) => t.trim()).filter(Boolean);
        await createDispatcher({
          name: values.name,
          type: createOption.type,
          enable: false,
          topics: JSON.stringify(topics),
          config: JSON.stringify(cfg),
        } as any);
      } else if (createOption.kind === 'viewer') {
        const topics = (values.topic_list || '').split(',').map((t: string) => t.trim()).filter(Boolean);
        await createViewer({
          name: values.name,
          enable: false,
          topics: JSON.stringify(topics),
        } as any);
      } else if (createOption.kind === 'mocker') {
        await createMocker({
          name: values.name,
          topic: values.topic || '',
          payload: values.payload || '',
          interval: Number(values.interval) || 0,
          enable: false,
        } as any);
      }
      message.success('创建成功');
      setCreateMenuOpen(false);
      setCreateOption(null);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  }, [createOption, createForm, fetchData]);

  // 选择创建类型
  const handleSelectCreateOption = useCallback((opt: CreateOption) => {
    setCreateOption(opt);
    createForm.resetFields();
    createForm.setFieldsValue({ name: `${opt.label.replace('新建 ', '')}-${Date.now().toString().slice(-4)}` });
  }, [createForm]);

  const handleEditChain = useCallback((id: number) => {
    if (!flowData) return;
    const chain = flowData.chains.find(c => c.id === id);
    if (chain) setEditTarget({ kind: 'chain', data: { ...chain } });
  }, [flowData]);

  const handleEditDispatcher = useCallback((id: number) => {
    if (!flowData) return;
    const disp = flowData.dispatchers.find(d => d.id === id);
    if (disp) setEditTarget({ kind: 'dispatcher', data: { ...disp } });
  }, [flowData]);

  const handleToggleViewer = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleViewer(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleEditViewer = useCallback((id: number) => {
    if (!flowData) return;
    const viewer = flowData.viewers?.find(v => v.id === id);
    if (viewer) setEditTarget({ kind: 'viewer', data: { ...viewer } });
  }, [flowData]);

  const handleViewViewer = useCallback((id: number) => {
    setViewerModalId(id);
  }, []);

  const handleToggleMocker = useCallback(async (id: number, enable: boolean) => {
    try {
      await toggleMocker(id, enable);
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }, [fetchData]);

  const handleEditMocker = useCallback((id: number) => {
    if (!flowData) return;
    const mocker = flowData.mockers?.find(m => m.id === id);
    if (mocker) setEditTarget({ kind: 'mocker', data: { ...mocker } });
  }, [flowData]);

  const handleTriggerMocker = useCallback(async (id: number) => {
    try {
      await triggerMocker(id);
      message.success('已触发');
    } catch (e: any) {
      message.error(e?.message || '触发失败');
    }
  }, []);

  const handleDeleteMocker = useCallback(async (id: number) => {
    Modal.confirm({
      title: '删除虚拟数据发送器？',
      content: '删除后将停止其定时任务，不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteMocker(id);
          message.success('已删除');
          await fetchData();
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  }, [fetchData]);

  // 拖拽连线：修改 target 节点的 topic 使其匹配 source 节点的 topic
  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target || !flowData) return;

    // 解析 source：可能是父容器（带 sourceHandle = child-${id}）或链节点
    let sourceTopic = '';
    if (connection.sourceHandle && connection.sourceHandle.startsWith('child-')) {
      // 从父容器的子项 Handle 连接
      const childId = parseInt(connection.sourceHandle.replace('child-', ''), 10);
      const conn = flowData.conns.find(c => c.id === childId);
      sourceTopic = conn?.topic || conn?.out_topic || '';
    } else {
      // 从链节点连接
      const sourceNode = nodes.find(n => n.id === connection.source);
      if (!sourceNode) return;
      const sourceData = sourceNode.data as unknown as FlowNodeData;
      sourceTopic = sourceData.topic || sourceData.outTopic || '';
    }

    if (!sourceTopic) {
      message.warning('源节点没有 topic，无法建立连接');
      return;
    }

    // 解析 target 节点
    const [targetKind, targetIdStr] = connection.target.split('-');
    const targetId = parseInt(targetIdStr, 10);

    try {
      if (targetKind === 'chain') {
        const chain = flowData.chains.find(c => c.id === targetId);
        if (chain) {
          await updateProcessorChain({
            id: targetId,
            name: chain.name,
            topic: sourceTopic,
            out_topic: chain.out_topic,
            processors: chain.processors,
            enable: chain.enable,
          });
          message.success(`已将 ${chain.name} 的订阅 topic 改为 ${sourceTopic}`);
        }
      } else if (targetKind === 'dispatcher') {
        const disp = flowData.dispatchers.find(d => d.id === targetId);
        if (disp) {
          const existing = parseJSON(disp.topics);
          const topicList: string[] = Array.isArray(existing) ? existing : [];
          if (!topicList.includes(sourceTopic)) {
            topicList.push(sourceTopic);
            await updateDispatcher({
              id: targetId,
              name: disp.name,
              type: disp.type,
              enable: disp.enable,
              config: disp.config,
              topics: JSON.stringify(topicList),
            });
            message.success(`已将 ${sourceTopic} 加入 ${disp.name} 的订阅列表`);
          } else {
            message.info(`${disp.name} 已订阅 ${sourceTopic}`);
          }
        }
      } else if (targetKind === 'viewer') {
        const viewer = flowData.viewers?.find(v => v.id === targetId);
        if (viewer) {
          const existing = parseJSON(viewer.topics);
          const topicList: string[] = Array.isArray(existing) ? existing : [];
          if (!topicList.includes(sourceTopic)) {
            topicList.push(sourceTopic);
            await updateViewer({
              id: targetId,
              name: viewer.name,
              enable: viewer.enable,
              topics: JSON.stringify(topicList),
            });
            message.success(`已将 ${sourceTopic} 加入 ${viewer.name} 的订阅列表`);
          } else {
            message.info(`${viewer.name} 已订阅 ${sourceTopic}`);
          }
        }
      } else {
        message.warning('不支持连接到此类型节点');
        return;
      }
      await fetchData();
    } catch (e: any) {
      message.error(e?.message || '连线失败');
    }
  }, [nodes, flowData, fetchData]);

  // 保存回调引用供编辑面板使用
  saveCbRef.current = fetchData;

  // 构建图
  useEffect(() => {
    if (!flowData) return;
    const { nodes: ns, edges: es } = buildGraph(flowData, {
      onToggleListenerParent: handleToggleListenerParent,
      onToggleListener: handleToggleListener,
      onToggleChain: handleToggleChain,
      onToggleDispatcher: handleToggleDispatcher,
      onEditListenerParent: handleEditListenerParent,
      onCreateListenerChild: handleCreateListenerChild,
      onEditListener: handleEditListener,
      onEditChain: handleEditChain,
      onEditDispatcher: handleEditDispatcher,
      onToggleViewer: handleToggleViewer,
      onEditViewer: handleEditViewer,
      onViewViewer: handleViewViewer,
      onToggleMocker: handleToggleMocker,
      onEditMocker: handleEditMocker,
      onTriggerMocker: handleTriggerMocker,
      onDeleteMocker: handleDeleteMocker,
      onDeleteListener: handleDeleteListener,
    }, savedPositionsRef.current);

    // 搜索高亮
    if (search) {
      const q = search.toLowerCase();
      const matchedIds = new Set<string>();
      for (const n of ns) {
        const d = n.data as unknown as FlowNodeData;
        // 检查节点本身
        if (d.name?.toLowerCase().includes(q) || d.topic?.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q)) {
          matchedIds.add(n.id);
        }
        // 检查父容器内的子项
        if (d.children) {
          for (const child of d.children) {
            if (child.name?.toLowerCase().includes(q) || child.topic?.toLowerCase().includes(q) || child.type?.toLowerCase().includes(q)) {
              matchedIds.add(n.id);
              break;
            }
          }
        }
      }
      // 高亮匹配的节点和关联边
      for (const n of ns) {
        n.style = { ...n.style, opacity: matchedIds.has(n.id) ? 1 : 0.25 };
      }
      for (const e of es) {
        e.animated = matchedIds.has(e.source) && matchedIds.has(e.target);
        e.style = (matchedIds.has(e.source) && matchedIds.has(e.target))
          ? { stroke: '#ff7a45', strokeWidth: 3 }
          : { stroke: '#ddd', strokeWidth: 1 };
      }
    } else if (highlightTopic) {
      // 按 topic 高亮
      for (const n of ns) {
        const d = n.data as unknown as FlowNodeData;
        const topics = [d.topic, d.outTopic, ...(d.topics || [])].filter(Boolean);
        // 检查子项的 topic
        if (d.children) {
          for (const child of d.children) {
            topics.push(child.topic, child.outTopic);
          }
        }
        const match = topics.includes(highlightTopic);
        n.style = { ...n.style, opacity: match ? 1 : 0.2 };
      }
      for (const e of es) {
        const match = e.label === highlightTopic;
        e.animated = match;
        e.style = match
          ? { stroke: '#ff7a45', strokeWidth: 3 }
          : { stroke: '#eee', strokeWidth: 1 };
      }
    } else {
      for (const n of ns) {
        const d = n.data as unknown as FlowNodeData;
        // 恢复默认样式（保留 buildGraph 中设置的 width/height）
        if (d.kind === 'listenerParent') {
          n.style = { ...n.style, opacity: 1 };
        } else {
          n.style = { ...n.style, opacity: 1 };
        }
      }
      for (const e of es) {
        e.animated = true;
        e.style = { stroke: '#b85c00', strokeWidth: 2 };
      }
    }

    setNodes(ns);
    setEdges(es);
  }, [flowData, search, highlightTopic, handleToggleListenerParent, handleToggleListener, handleToggleChain, handleToggleDispatcher, handleEditListenerParent, handleCreateListenerChild, handleEditListener, handleEditChain, handleEditDispatcher, handleToggleViewer, handleEditViewer, handleViewViewer, handleToggleMocker, handleEditMocker, handleTriggerMocker, handleDeleteMocker, handleDeleteListener, setNodes, setEdges]);

  // 收集所有 topic 用于筛选
  const allTopics = useMemo(() => {
    if (!flowData) return [];
    const set = new Set<string>();
    for (const c of flowData.conns) { if (c.topic) set.add(c.topic); if (c.out_topic) set.add(c.out_topic); }
    for (const ch of flowData.chains) { if (ch.topic) set.add(ch.topic); }
    for (const d of flowData.dispatchers) {
      const ts = parseJSON(d.topics);
      if (Array.isArray(ts)) ts.forEach((t: string) => set.add(t));
    }
    return Array.from(set).sort();
  }, [flowData]);

  const handleAutoLayout = useCallback(() => {
    // 简单的重新布局：按列重排
    if (!flowData) return;
    const COL_X = { mocker: -260, listener: 80, chain: 420, dispatcher: 760, viewer: 1100 };
    const NODE_GAP_Y = 160;
    let ly = 60, cy = 60, dy = 60, vy = 60, my = 60;
    setNodes((prev) => prev.map(n => {
      const d = n.data as unknown as FlowNodeData;
      let x = 80, y = 60;
      if (d.kind === 'mocker') { x = COL_X.mocker; y = my; my += NODE_GAP_Y; }
      else if (d.kind === 'listener' || d.kind === 'listenerParent') { x = COL_X.listener; y = ly; ly += NODE_GAP_Y; }
      else if (d.kind === 'chain') { x = COL_X.chain; y = cy; cy += NODE_GAP_Y; }
      else if (d.kind === 'viewer') { x = COL_X.viewer; y = vy; vy += NODE_GAP_Y; }
      else { x = COL_X.dispatcher; y = dy; dy += NODE_GAP_Y; }
      return { ...n, position: { x, y } };
    }));
  }, [flowData, setNodes]);

  const stats = useMemo(() => {
    if (!flowData) return { listeners: 0, chains: 0, dispatchers: 0, running: 0 };
    const running = flowData.conns.filter(c => c.running).length;
    return {
      listeners: flowData.conns.length,
      chains: flowData.chains.length,
      dispatchers: flowData.dispatchers.length,
      running,
    };
  }, [flowData]);

  // 每 2s 轮询订阅者繁忙度，按 ownerType-ownerId 映射到节点并注入 data.busyness
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const badges = await fetchBusynessBadges();
        if (cancelled) return;
        const map = new Map<string, BusynessBadgeData>();
        badges.forEach((b) => {
          map.set(`${b.ownerType}-${b.ownerId}`, b);
        });
        setNodes((prev) => prev.map((n) => {
          const d = n.data as unknown as FlowNodeData;
          if (!d || !d.kind) return n;
          // 节点 id 格式：<kind>-<ownerId>，徽章 ownerType 已与 kind 同义
          const key = `${d.kind}-${d.id}`;
          const badge = map.get(key);
          if (!badge) return n;
          return { ...n, data: { ...d, busyness: badge } as unknown as FlowNodeData };
        }));
      } catch {
        // 静默：失败时保留上一次状态
      }
    };
    tick();
    const t = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [setNodes]);

  const selectedEdge = useMemo(() => edges.find((item) => item.id === selectedEdgeId) || null, [edges, selectedEdgeId]);
  const selectedEdgeSource = useMemo(() => nodes.find((item) => item.id === selectedEdge?.source) || null, [nodes, selectedEdge]);
  const selectedEdgeTarget = useMemo(() => nodes.find((item) => item.id === selectedEdge?.target) || null, [nodes, selectedEdge]);

  return (
    <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button icon={<LayoutOutlined />} onClick={handleAutoLayout}>自动布局</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOption(null); setCreateMenuOpen(true); }}>新建</Button>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索节点名/topic"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          {allTopics.length > 0 && (
            <Tooltip title="按 topic 高亮数据链路">
              <select
                value={highlightTopic}
                onChange={(e) => setHighlightTopic(e.target.value)}
                style={{
                  height: 32, padding: '0 8px', borderRadius: 6,
                  border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer',
                }}
              >
                <option value="">全部 topic</option>
                {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Tooltip>
          )}
        </Space>
        <Space size={16}>
          <Tag icon={<ApiOutlined />} color="blue">监听器 {stats.listeners}</Tag>
          <Tag icon={<ThunderboltOutlined />} color="orange">处理器链 {stats.chains}</Tag>
          <Tag icon={<SendOutlined />} color="purple">分发器 {stats.dispatchers}</Tag>
          <Tag color={stats.running > 0 ? 'success' : 'default'}>运行中 {stats.running}</Tag>
        </Space>
      </div>

      {selectedEdge && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #ffe7ba', background: '#fff7e6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space wrap>
            <Tag color="gold">当前连线</Tag>
            <span>{String((selectedEdgeSource?.data as any)?.name || selectedEdge.source)}</span>
            <span>→</span>
            <span>{String((selectedEdgeTarget?.data as any)?.name || selectedEdge.target)}</span>
            <Tag color="orange">topic: {String(selectedEdge.label || '-')}</Tag>
          </Space>
          <Button danger size="small" onClick={() => void onEdgesChange([{ id: selectedEdge.id, type: 'remove' } as EdgeChange])}>删除连线</Button>
        </div>
      )}

      {/* 画布 */}
      <div style={{ flex: 1, position: 'relative', border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden', background: '#fafafa' }}>
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
            <Spin size="large" />
          </div>
        )}
        {!loading && flowData && flowData.conns.length === 0 && flowData.chains.length === 0 && flowData.dispatchers.length === 0 ? (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <Empty description="暂无数据流配置，请先创建监听器、处理器链和分发器" />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, currentNode) => {
               const nextPositions = {
                 ...savedPositionsRef.current,
                 [currentNode.id]: currentNode.position,
               };
               savedPositionsRef.current = nextPositions;
               void saveFlowLayout(nextPositions);
               setNodes((prev) => prev.map((node) => (
                 node.id === currentNode.id ? { ...node, position: currentNode.position } : node
               )));
             }}
            onEdgesChange={onEdgesChange}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onPaneClick={() => setSelectedEdgeId('')}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              Modal.confirm({
                title: '删除这条连线？',
                content: `将解绑 topic：${String(edge.label || '')}`,
                okText: '删除',
                cancelText: '取消',
                onOk: async () => {
                  setSelectedEdgeId(edge.id);
                  await onEdgesChange([{ id: edge.id, type: 'remove' } as EdgeChange]);
                },
              });
            }}
            onConnect={onConnect}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes as NodeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.24, includeHiddenNodes: true, minZoom: 0.35 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e0e0e0" />
            <Controls position="bottom-right" />
            <MiniMap
              position="bottom-left"
              nodeColor={(node) => {
                const d = node.data as unknown as FlowNodeData;
                if (d.kind === 'listener') return '#3a4f7a';
                if (d.kind === 'chain') return '#b85c00';
                return '#7a3a8a';
              }}
              maskColor="rgba(0,0,0,0.05)"
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        )}
      </div>

      {/* 提示 */}
      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
        提示：右键画布空白处可新建容器 · 拖拽节点右侧的连接点到目标节点左侧可建立数据流连接（会自动修改目标节点的订阅 topic）· 点击连线可查看详情 · 右键连线或在详情条中可删除 · 点击节点名称打开编辑面板 · 底部开关可启用/禁用
      </div>

      {/* 右键新建 Modal */}
      <Modal
        title={createOption ? `新建 - ${createOption.label}` : '新建容器'}
        open={createMenuOpen}
        onCancel={() => { setCreateMenuOpen(false); setCreateOption(null); }}
        footer={createOption ? [
          <Button key="back" onClick={() => setCreateOption(null)}>返回选择</Button>,
          <Button key="submit" type="primary" loading={creating} onClick={handleCreateSubmit}>创建</Button>,
        ] : [
          <Button key="cancel" onClick={() => setCreateMenuOpen(false)}>取消</Button>,
        ]}
        width={460}
        destroyOnClose
      >
        {!createOption ? (
          // 阶段1：按分组显示类型列表（平铺方式）
          <div>
            {Array.from(new Set(CREATE_OPTIONS.map((o) => o.group))).map((group) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: 500 }}>{group}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {CREATE_OPTIONS.filter((opt) => opt.group === group).map((opt) => (
                    <Button
                      key={opt.key}
                      icon={<PlusOutlined />}
                      onClick={() => handleSelectCreateOption(opt)}
                      style={{ textAlign: 'left', height: 36 }}
                      block
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 阶段2：填写表单
          <Form form={createForm} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="请输入名称" />
            </Form.Item>

            {createOption.kind === 'chain' && (
              <>
                <Divider orientation="left" plain><Tag color="blue">数据流路由</Tag></Divider>
                <Form.Item name="topic" label="订阅 Topic" tooltip="处理器链订阅此 topic 的消息进行处理">
                  <Input placeholder="例如：device/data" />
                </Form.Item>
                <Form.Item name="out_topic" label="发布 Topic" tooltip="处理完成后默认发布到此 topic">
                  <Input placeholder="例如：device/cleaned" />
                </Form.Item>
              </>
            )}

            {createOption.kind === 'dispatcher' && (
              <>
                <Divider orientation="left" plain><Tag color="blue">数据流路由</Tag></Divider>
                <Form.Item name="topic_list" label="订阅 Topics" tooltip="分发器订阅这些 topic，逗号分隔">
                  <Input placeholder="topic1,topic2" />
                </Form.Item>
              </>
            )}

            {createOption.kind === 'viewer' && (
              <>
                <Divider orientation="left" plain><Tag color="blue">订阅配置</Tag></Divider>
                <Form.Item name="topic_list" label="订阅 Topics" tooltip="查看器订阅这些 topic，逗号分隔">
                  <Input placeholder="topic1,topic2" />
                </Form.Item>
              </>
            )}

            {createOption.kind === 'mocker' && (
              <>
                <Divider orientation="left" plain><Tag color="purple">虚拟数据</Tag></Divider>
                <Form.Item name="topic" label="目标 Topic" rules={[{ required: true, message: '请输入目标 topic' }]} tooltip="虚拟数据将发布到此 topic">
                  <Input placeholder="例如：device/mock" />
                </Form.Item>
                <Form.Item name="payload" label="数据内容" tooltip="发送时原样作为消息 payload">
                  <Input.TextArea rows={4} placeholder={'纯文本或 JSON\n例如：{"value": 1}'} />
                </Form.Item>
                <Form.Item name="interval" label="定时间隔 (ms)" tooltip="0 表示仅手动触发，>0 启用后按此间隔自动发送">
                  <Input type="number" placeholder="0 表示仅手动" />
                </Form.Item>
              </>
            )}

            <Divider orientation="left" plain><Tag color="purple">配置参数</Tag></Divider>

            {createOption.kind === 'listenerParent' && createOption.type === 'http_server' && (
              <Form.Item name="port" label="端口"><Input placeholder="8080" /></Form.Item>
            )}
            {createOption.kind === 'listenerParent' && createOption.type === 'mqtt_client' && (
              <>
                <Form.Item name="broker" label="Broker"><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
                <Form.Item name="client_id" label="Client ID"><Input /></Form.Item>
                <Form.Item name="username" label="用户名"><Input /></Form.Item>
                <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
              </>
            )}

            {createOption.kind === 'dispatcher' && createOption.type === 'http' && (
              <>
                <Form.Item name="url" label="URL"><Input placeholder="http://example.com/api" /></Form.Item>
                <Form.Item name="method" label="方法"><Input placeholder="POST" /></Form.Item>
              </>
            )}
            {createOption.kind === 'dispatcher' && createOption.type === 'mqtt' && (
              <>
                <Form.Item name="broker" label="Broker"><Input placeholder="tcp://127.0.0.1:1883" /></Form.Item>
                <Form.Item name="client_id" label="Client ID"><Input /></Form.Item>
                <Form.Item name="username" label="用户名"><Input /></Form.Item>
                <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
                <Form.Item name="pub_topic" label="发布 Topic"><Input /></Form.Item>
              </>
            )}
            {createOption.kind === 'dispatcher' && createOption.type === 'websocket' && (
              <Form.Item name="address" label="地址"><Input placeholder="ws://127.0.0.1:8080/ws" /></Form.Item>
            )}
            {createOption.kind === 'dispatcher' && createOption.type === 'plugin' && (
              <Form.Item name="plugin_name" label="插件名"><Input /></Form.Item>
            )}

            {createOption.kind === 'listenerConn' && (
              <>
                <Divider orientation="left" plain><Tag color="blue">数据流路由</Tag></Divider>
                <Form.Item name="topic" label="入站 Topic" tooltip="连接收到的数据推送到此 topic">
                  <Input placeholder="例如：device/data" />
                </Form.Item>
                <Form.Item name="out_topic" label="出站 Topic" tooltip="订阅此 topic 的消息推送到连接">
                  <Input placeholder="留空则不订阅出站消息" />
                </Form.Item>
              </>
            )}

            {createOption.kind === 'listenerConn' && (createOption.type === 'tcp_conn' || createOption.type === 'udp_conn') && (
              <Form.Item name="address" label="监听地址" rules={[{ required: true, message: '请输入监听地址' }]}>
                <Input placeholder="0.0.0.0:8080" />
              </Form.Item>
            )}
            {createOption.kind === 'listenerConn' && createOption.type === 'serial_conn' && (
              <>
                <Form.Item name="port" label="串口" rules={[{ required: true, message: '请输入串口' }]}>
                  <Input placeholder="COM3 / /dev/ttyUSB0" />
                </Form.Item>
                <Form.Item name="baud_rate" label="波特率" rules={[{ required: true, message: '请输入波特率' }]}>
                  <Input placeholder="9600" />
                </Form.Item>
              </>
            )}
            {createOption.kind === 'listenerConn' && createOption.type === 'script_conn' && (
              <Form.Item name="content" label="脚本内容" rules={[{ required: true, message: '请输入脚本内容' }]}>
                <Input.TextArea rows={4} placeholder="脚本内容" />
              </Form.Item>
            )}
          </Form>
        )}
      </Modal>

      {/* 编辑面板 */}
      <InlineEditPanel
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => fetchData()}
      />

      {/* 查看器实时数据弹窗 */}
      <ViewerStreamModal
        open={viewerModalId !== null}
        viewerId={viewerModalId}
        initialTopics={(() => {
          const v = flowData?.viewers?.find((x) => x.id === viewerModalId);
          if (!v) return [];
          try {
            const arr = JSON.parse(v.topics);
            return Array.isArray(arr) ? arr : [];
          } catch {
            return [];
          }
        })()}
        onClose={() => setViewerModalId(null)}
      />
    </div>
  );
};

const DataFlowCanvas: React.FC = () => (
  <ReactFlowProvider>
    <DataFlowCanvasInner />
  </ReactFlowProvider>
);

export default DataFlowCanvas;
