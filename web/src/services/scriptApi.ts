import axios from 'axios';

const API_BASE = '/api/v1/scripts';

export interface ScriptNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  content?: string;
  children?: ScriptNode[];
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 获取脚本树
export const getScriptTree = async (path: string = ''): Promise<ScriptNode> => {
  const response = await axios.get<ApiResponse<ScriptNode>>(`${API_BASE}/tree`, {
    params: { path },
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data;
};

// 获取脚本内容
export const getScriptContent = async (path: string): Promise<string> => {
  const response = await axios.get<ApiResponse<{ path: string; content: string }>>(
    `${API_BASE}/content`,
    {
      params: { path },
    }
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
  return response.data.data.content;
};

// 创建脚本或文件夹
export const createScript = async (
  path: string,
  isDir: boolean,
  content: string = ''
): Promise<void> => {
  const response = await axios.post<ApiResponse>(`${API_BASE}/create`, {
    path,
    isDir,
    content,
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};

// 更新脚本内容
export const updateScript = async (path: string, content: string): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${API_BASE}/update`, {
    path,
    content,
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};

// 删除脚本或文件夹
export const deleteScript = async (path: string): Promise<void> => {
  const response = await axios.delete<ApiResponse>(`${API_BASE}/delete`, {
    params: { path },
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};

// 移动或重命名脚本
export const moveScript = async (oldPath: string, newPath: string): Promise<void> => {
  const response = await axios.post<ApiResponse>(`${API_BASE}/move`, {
    oldPath,
    newPath,
  });
  if (response.data.code !== 0) {
    throw new Error(response.data.message);
  }
};

// ---------------- HTTP Listener API ----------------

const LISTEN_HTTP_API = '/api/listen/http';

export interface HttpListener {
  id: number;
  name: string;
  port: number;
  enable: boolean;
}

export const getHttpListeners = async (): Promise<HttpListener[]> => {
  const response = await axios.get<ApiResponse<HttpListener[]>>(`${LISTEN_HTTP_API}/list`);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data || [];
};

export const createHttpListener = async (data: Partial<HttpListener>): Promise<HttpListener> => {
  const response = await axios.post<ApiResponse<HttpListener>>(`${LISTEN_HTTP_API}/create`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const updateHttpListener = async (data: Partial<HttpListener>): Promise<HttpListener> => {
  const response = await axios.put<ApiResponse<HttpListener>>(`${LISTEN_HTTP_API}/update`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const enableHttpListener = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${LISTEN_HTTP_API}/enable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const disableHttpListener = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${LISTEN_HTTP_API}/disable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const deleteHttpListener = async (id: number): Promise<void> => {
  const response = await axios.delete<ApiResponse>(`${LISTEN_HTTP_API}/delete`, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

// ---------------- Push HTTP API ----------------

const PUSH_HTTP_API = '/api/push/http';

export interface PushHttp {
  id: number;
  name: string;
  url: string;
  method: string;
  header: string;
  enable: boolean;
}

export const getPushHttps = async (): Promise<PushHttp[]> => {
  const response = await axios.get<ApiResponse<PushHttp[]>>(`${PUSH_HTTP_API}/list`);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data || [];
};

export const createPushHttp = async (data: Partial<PushHttp>): Promise<PushHttp> => {
  const response = await axios.post<ApiResponse<PushHttp>>(`${PUSH_HTTP_API}/create`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const updatePushHttp = async (data: Partial<PushHttp>): Promise<PushHttp> => {
  const response = await axios.put<ApiResponse<PushHttp>>(`${PUSH_HTTP_API}/update`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const enablePushHttp = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_HTTP_API}/enable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const disablePushHttp = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_HTTP_API}/disable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const deletePushHttp = async (id: number): Promise<void> => {
  const response = await axios.delete<ApiResponse>(`${PUSH_HTTP_API}/delete`, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

// ---------------- Push MQTT API ----------------

const PUSH_MQTT_API = '/api/push/mqtt';

export interface PushMqtt {
  id: number;
  name: string;
  broker: string;
  clientId: string;
  username?: string;
  password?: string;
  topic: string;
  qos: number;
  enable: boolean;
}

export const getPushMqtts = async (): Promise<PushMqtt[]> => {
  const response = await axios.get<ApiResponse<PushMqtt[]>>(`${PUSH_MQTT_API}/list`);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data || [];
};

export const createPushMqtt = async (data: Partial<PushMqtt>): Promise<PushMqtt> => {
  const response = await axios.post<ApiResponse<PushMqtt>>(`${PUSH_MQTT_API}/create`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const updatePushMqtt = async (data: Partial<PushMqtt>): Promise<PushMqtt> => {
  const response = await axios.put<ApiResponse<PushMqtt>>(`${PUSH_MQTT_API}/update`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const enablePushMqtt = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_MQTT_API}/enable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const disablePushMqtt = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_MQTT_API}/disable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const deletePushMqtt = async (id: number): Promise<void> => {
  const response = await axios.delete<ApiResponse>(`${PUSH_MQTT_API}/delete`, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

// ---------------- Push Script API ----------------

const PUSH_SCRIPT_API = '/api/push/script';

export interface PushScript {
  id: number;
  name: string;
  content: string;
  enable: boolean;
}

export const getPushScripts = async (): Promise<PushScript[]> => {
  const response = await axios.get<ApiResponse<PushScript[]>>(`${PUSH_SCRIPT_API}/list`);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data || [];
};

export const createPushScript = async (data: Partial<PushScript>): Promise<PushScript> => {
  const response = await axios.post<ApiResponse<PushScript>>(`${PUSH_SCRIPT_API}/create`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const updatePushScript = async (data: Partial<PushScript>): Promise<PushScript> => {
  const response = await axios.put<ApiResponse<PushScript>>(`${PUSH_SCRIPT_API}/update`, data);
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
  return response.data.data;
};

export const enablePushScript = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_SCRIPT_API}/enable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const disablePushScript = async (id: number): Promise<void> => {
  const response = await axios.put<ApiResponse>(`${PUSH_SCRIPT_API}/disable`, null, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};

export const deletePushScript = async (id: number): Promise<void> => {
  const response = await axios.delete<ApiResponse>(`${PUSH_SCRIPT_API}/delete`, { params: { id } });
  if (response.data.code !== 0 && response.data.code !== 200) {
    throw new Error(response.data.message || 'Request failed');
  }
};
