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

