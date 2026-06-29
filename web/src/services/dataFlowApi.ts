// 数据流可视化页面 - 聚合 API 服务
// 复用现有的 listener-parent / listener-conn / processor_chain / dispatcher 接口

const API_BASE = '/api';

// ============ 类型定义 ============

export interface ListenerParentItem {
  id: number;
  name: string;
  type: string; // http_server / mqtt_client
  enable: boolean;
  config: string; // JSON
  // 平铺字段
  port?: number;
  broker?: string;
  client_id?: string;
  username?: string;
  password?: string;
  // 运行时
  error_info?: string;
  running?: boolean;
}

export interface ListenerConnItem {
  id: number;
  parent_id: number;
  name: string;
  type: string; // tcp_conn / udp_conn / serial_conn / script_conn / http_route / mqtt_subscription
  enable: boolean;
  topic: string; // 入站 topic
  out_topic: string; // 出站 topic
  pre_script: string;
  config: string;
  extra: string;
  // 平铺字段
  address?: string;
  port?: string;
  baud_rate?: number;
  content?: string;
  path?: string;
  methods?: string;
  sub_topic?: string;
  qos?: number;
  // 运行时
  error_info?: string;
  running?: boolean;
}

export interface ProcessorChainItem {
  id: number;
  name: string;
  topic: string; // 订阅的 topic
  out_topic: string; // 发布的 topic
  processors: string; // JSON 数组
  enable: boolean;
  running?: boolean; // 运行时
}

export interface DispatcherItem {
  id: number;
  name: string;
  type: string; // http / mqtt / script / websocket / rocketmq / plugin
  enable: boolean;
  topics: string; // JSON 数组，订阅的 topic 列表
  config: string; // JSON
  running?: boolean; // 运行时
}

export interface ViewerItem {
  id: number;
  name: string;
  topics: string; // JSON 数组，订阅的 topic 列表
  enable: boolean;
}

export interface MockerItem {
  id: number;
  name: string;
  topic: string;    // 目标 topic
  payload: string;  // 数据内容（原样发送）
  interval: number; // 定时间隔（毫秒，0=不定时）
  enable: boolean;
}

// ============ API 调用 ============

const jsonHeaders = { 'Content-Type': 'application/json' };

// ---- ListenerParent ----
export const listListenerParents = async (): Promise<ListenerParentItem[]> => {
  const res = await fetch(`${API_BASE}/listener-parent/list`);
  const data = await res.json();
  return data.data || [];
};

export const createListenerParent = async (payload: Partial<ListenerParentItem>): Promise<void> => {
  await fetch(`${API_BASE}/listener-parent/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const toggleListenerParent = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/listener-parent/enable` : `${API_BASE}/listener-parent/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const updateListenerParent = async (payload: Partial<ListenerParentItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/listener-parent/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteListenerParent = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/listener-parent/delete`, {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
};

// ---- ListenerConn ----
export const listListenerConns = async (): Promise<ListenerConnItem[]> => {
  const res = await fetch(`${API_BASE}/listener-conn/list`);
  const data = await res.json();
  return data.data || [];
};

export const toggleListenerConn = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/listener-conn/enable` : `${API_BASE}/listener-conn/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const createListenerConn = async (payload: Partial<ListenerConnItem>): Promise<void> => {
  await fetch(`${API_BASE}/listener-conn/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const updateListenerConn = async (payload: Partial<ListenerConnItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/listener-conn/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteListenerConn = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/listener-conn/delete`, {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
};

// ---- ProcessorChain ----
export const listProcessorChains = async (): Promise<ProcessorChainItem[]> => {
  const res = await fetch(`${API_BASE}/processor_chain/list`);
  const data = await res.json();
  return data.data || [];
};

export const createProcessorChain = async (payload: Partial<ProcessorChainItem>): Promise<void> => {
  await fetch(`${API_BASE}/processor_chain/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const toggleProcessorChain = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/processor_chain/enable` : `${API_BASE}/processor_chain/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const updateProcessorChain = async (payload: Partial<ProcessorChainItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/processor_chain/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteProcessorChain = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/processor_chain/delete`, {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
};

// ---- Dispatcher ----
export const listDispatchers = async (): Promise<DispatcherItem[]> => {
  const res = await fetch(`${API_BASE}/dispatcher/list`);
  const data = await res.json();
  return data.data || [];
};

export const createDispatcher = async (payload: Partial<DispatcherItem>): Promise<void> => {
  await fetch(`${API_BASE}/dispatcher/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const toggleDispatcher = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/dispatcher/enable` : `${API_BASE}/dispatcher/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const updateDispatcher = async (payload: Partial<DispatcherItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/dispatcher/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteDispatcher = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/dispatcher/delete`, {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
};

// ---- Viewer ----
export const listViewers = async (): Promise<ViewerItem[]> => {
  const res = await fetch(`${API_BASE}/viewer/list`);
  const data = await res.json();
  return data.data || [];
};

export const createViewer = async (payload: Partial<ViewerItem>): Promise<void> => {
  await fetch(`${API_BASE}/viewer/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const toggleViewer = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/viewer/enable` : `${API_BASE}/viewer/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const updateViewer = async (payload: Partial<ViewerItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/viewer/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteViewer = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/viewer/delete`, {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
};

export const listTopics = async (): Promise<{ topic: string; depth: number }[]> => {
  const res = await fetch(`${API_BASE}/viewer/topics`);
  const data = await res.json();
  return data.data || [];
};

// ---- Mocker ----
export const listMockers = async (): Promise<MockerItem[]> => {
  const res = await fetch(`${API_BASE}/mocker/list`);
  const data = await res.json();
  return data.data || [];
};

export const createMocker = async (payload: Partial<MockerItem>): Promise<void> => {
  await fetch(`${API_BASE}/mocker/create`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const toggleMocker = async (id: number, enable: boolean): Promise<void> => {
  const url = enable ? `${API_BASE}/mocker/enable` : `${API_BASE}/mocker/disable`;
  await fetch(url, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id }) });
};

export const updateMocker = async (payload: Partial<MockerItem> & { id: number }): Promise<void> => {
  await fetch(`${API_BASE}/mocker/update`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const deleteMocker = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/mocker/delete?id=${id}`, { method: 'DELETE' });
};

export const triggerMocker = async (id: number): Promise<void> => {
  await fetch(`${API_BASE}/mocker/trigger?id=${id}`, { method: 'POST' });
};

// ============ 聚合获取 ============

export interface FlowLayoutPositions {
  [nodeId: string]: { x: number; y: number };
}

export interface FlowData {
  parents: ListenerParentItem[];
  conns: ListenerConnItem[];
  chains: ProcessorChainItem[];
  dispatchers: DispatcherItem[];
  viewers: ViewerItem[];
  mockers: MockerItem[];
}

export const getFlowLayout = async (): Promise<FlowLayoutPositions> => {
  const res = await fetch(`${API_BASE}/flow-layout/get`);
  const data = await res.json();
  return data.data?.positions || {};
};

export const saveFlowLayout = async (positions: FlowLayoutPositions): Promise<void> => {
  await fetch(`${API_BASE}/flow-layout/save`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ positions }),
  });
};

export const fetchAllFlowData = async (): Promise<FlowData> => {
  const [parents, conns, chains, dispatchers, viewers, mockers] = await Promise.all([
    listListenerParents(),
    listListenerConns(),
    listProcessorChains(),
    listDispatchers(),
    listViewers(),
    listMockers(),
  ]);
  return { parents, conns, chains, dispatchers, viewers, mockers };
};
