import axios from 'axios';

const API_BASE = '/api/plugin';

export interface ApiResponse<T = any> {
  code: number;
  message?: string;
  msg?: string;
  data: T;
}

export interface PluginParamSpec {
  key: string;
  label?: string;
  type: string;
  default?: any;
  required?: boolean;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface PluginInfo {
  name: string;
  display?: string;
  version?: string;
  type: string;
  description?: string;
  dir?: string;
  params?: PluginParamSpec[];
  running?: boolean;
  error?: string;
}

export interface PluginLoadError {
  Type: string;
  Name: string;
  Dir: string;
  Err: string;
}

export interface PluginGroup {
  loaded: PluginInfo[];
  failed: PluginLoadError[];
}

export type PluginGroups = Record<string, PluginGroup>;

export const PLUGIN_TYPES = [
  { value: 'listener', label: '监听器' },
  { value: 'decoder', label: '解码器' },
  { value: 'processor', label: '处理器' },
  { value: 'pusher', label: '推送器' },
  { value: 'task', label: '后台任务' },
];

const handle = async <T>(p: Promise<{ data: ApiResponse<T> }>): Promise<T> => {
  const res = await p;
  if (res.data.code !== 0 && res.data.code !== 200) {
    throw new Error(res.data.message || res.data.msg || '请求失败');
  }
  return res.data.data;
};

// List 列出所有插件（按类型分组）
export const listPlugins = (): Promise<PluginGroups> =>
  handle(axios.get(`${API_BASE}/list`));

// ListByType 列出某类型的插件
export const listPluginsByType = (type: string): Promise<PluginInfo[]> =>
  handle(axios.get(`${API_BASE}/list_by_type`, { params: { type } }));

// ReloadAll 重新加载所有插件
export const reloadAllPlugins = (): Promise<boolean> =>
  handle(axios.put(`${API_BASE}/reload_all`));

// ReloadType 重载某类型的所有插件
export const reloadTypePlugins = (type: string): Promise<boolean> =>
  handle(axios.put(`${API_BASE}/reload_type`, null, { params: { type } }));

// ReloadOne 重载单个插件
export const reloadOnePlugin = (type: string, name: string): Promise<boolean> =>
  handle(axios.put(`${API_BASE}/reload_one`, null, { params: { type, name } }));

// StartTask 启动 task 插件
export const startTaskPlugin = (name: string): Promise<boolean> =>
  handle(axios.put(`${API_BASE}/start_task`, null, { params: { name } }));

// StopTask 停止 task 插件
export const stopTaskPlugin = (name: string): Promise<boolean> =>
  handle(axios.put(`${API_BASE}/stop_task`, null, { params: { name } }));

// SaveTaskConfig 保存 task 插件参数配置
export const saveTaskConfig = (name: string, params: Record<string, any>, enable: boolean): Promise<boolean> =>
  handle(axios.post(`${API_BASE}/save_task_config`, { name, params, enable }));

// GetTaskConfig 获取 task 插件参数配置
export const getTaskConfig = (name: string): Promise<{ name: string; params: Record<string, any>; enable: boolean }> =>
  handle(axios.get(`${API_BASE}/get_task_config`, { params: { name } }));

// ListTaskConfig 列出所有 task 插件配置
export const listTaskConfig = (): Promise<Array<{ name: string; params: Record<string, any>; enable: boolean }>> =>
  handle(axios.get(`${API_BASE}/list_task_config`));

// Types 返回所有插件类型
export const getPluginTypes = (): Promise<string[]> =>
  handle(axios.get(`${API_BASE}/types`));
