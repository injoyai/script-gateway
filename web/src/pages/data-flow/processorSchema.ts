// 内置处理器配置 schema
// 一个处理器容器只选一个内置处理器，多个处理通过数据流串联多个容器实现
// 与后端 internal/decode/decode_interface.go 的 All() 和 internal/pipeline/manager.go 的 createPipeline switch 保持同步
// 注意：script 类型不在此处，脚本链走另一个入口

export interface ProcessorFieldSpec {
  key: string;
  label: string;
  type: 'string' | 'switch' | 'textarea' | 'json';
  required?: boolean;
  tooltip?: string;
  placeholder?: string;
  default?: any;
}

export interface ProcessorTypeSpec {
  key: string;
  name: string;
  fields: ProcessorFieldSpec[];
}

// 内置处理器类型列表（按后端 decode.All() 顺序，排除 script）
export const PROCESSOR_TYPES: ProcessorTypeSpec[] = [
  {
    key: 'json_format',
    name: 'JSON格式化',
    fields: [
      { key: 'pretty', label: '美化输出', type: 'switch', default: false, tooltip: '开启后输出缩进格式化的 JSON' },
    ],
  },
  {
    key: 'json_extract',
    name: 'JSON提取',
    fields: [
      { key: 'path', label: '提取路径', type: 'string', required: true, placeholder: '例如：data.value' },
    ],
  },
  {
    key: 'json_filter',
    name: 'JSON过滤',
    fields: [
      { key: 'path', label: '判断路径', type: 'string', required: true, placeholder: '例如：data.type' },
      { key: 'equals', label: '等于值', type: 'string', required: true, placeholder: '匹配值' },
    ],
  },
  {
    key: 'text_replace',
    name: '文本替换',
    fields: [
      { key: 'from', label: '查找', type: 'string', required: true },
      { key: 'to', label: '替换为', type: 'string', required: true },
    ],
  },
  {
    key: 'text_regex_filter',
    name: '正则过滤',
    fields: [
      { key: 'pattern', label: '正则表达式', type: 'string', required: true, placeholder: '例如：^device/' },
    ],
  },
  {
    key: 'field_map',
    name: '字段映射',
    fields: [
      { key: 'mapping', label: '映射表 JSON', type: 'json', required: true, tooltip: '形如 {"old_key":"new_key"}', placeholder: '{"a":"b"}' },
    ],
  },
  { key: 'dlt645', name: 'DLT645协议', fields: [] },
  { key: 'modbus_rtu', name: 'Modbus RTU协议', fields: [] },
  { key: 'pass', name: '忽略', fields: [] },
];

// 按 key 查找处理器类型定义
export const findProcessorType = (key: string): ProcessorTypeSpec | undefined =>
  PROCESSOR_TYPES.find((p) => p.key === key);

// 构造某个处理器类型的默认 config 对象
export const buildDefaultConfig = (key: string): Record<string, any> => {
  const spec = findProcessorType(key);
  if (!spec) return {};
  const cfg: Record<string, any> = {};
  for (const f of spec.fields) {
    if (f.default !== undefined) {
      cfg[f.key] = f.default;
    } else if (f.type === 'switch') {
      cfg[f.key] = false;
    } else if (f.type === 'json') {
      cfg[f.key] = {};
    } else {
      cfg[f.key] = '';
    }
  }
  return cfg;
};

// 解析 processors JSON：返回第一个处理器的 key 和 config
// 处理器只允许一个处理器，多于一个时也只取第一个
export const parseSingleProcessor = (processorsRaw?: string): { key: string; config: Record<string, any> } | null => {
  try {
    const arr = JSON.parse(processorsRaw || '[]');
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const item = arr[0];
    if (!item || typeof item.key !== 'string') return null;
    const cfg = typeof item.config === 'string' ? safeParseJSON(item.config) : (item.config || {});
    return { key: item.key, config: cfg };
  } catch {
    return null;
  }
};

// 序列化：单处理器 → processors JSON
export const serializeSingleProcessor = (key: string, config: Record<string, any>): string =>
  JSON.stringify([{ key, config: JSON.stringify(config) }]);

const safeParseJSON = (s: string): Record<string, any> => {
  try { return JSON.parse(s) || {}; } catch { return {}; }
};
