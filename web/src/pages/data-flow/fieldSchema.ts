// 字段渲染机制 - 声明式 schema 驱动
// 横切阶段只填 listener 全类型，其余模块后续阶段补

export type FieldType =
  | 'string' | 'number' | 'select' | 'switch' | 'password'
  | 'textarea' | 'script' | 'pluginParams';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  tooltip?: string;
  placeholder?: string;
  default?: any;
  options?: string[];
  min?: number; max?: number;
  scriptLang?: 'go';
  pluginType?: string;
  fromConfig?: boolean;
}

export type NodeKind =
  | 'listenerParent' | 'listener' | 'chain'
  | 'dispatcher' | 'viewer' | 'mocker';

export interface NodeFieldSchema {
  nodeKind: NodeKind;
  nodeType?: string;
  fields: FieldSpec[];
}

// script_conn 的 content 字段默认模板：仅保留必需的顶级函数骨架
export const DEFAULT_SCRIPT_CONTENT = `package main

func Run() error {
	return nil
}

func Close() error {
	return nil
}

func Read() ([]byte, error) {
	return nil, nil
}
`;

const nameField = (label = '名称'): FieldSpec => ({
  key: 'name', label, type: 'string', required: true,
});

const topicField = (key: string, label: string, tooltip?: string, required = false): FieldSpec => ({
  key, label, type: 'string', tooltip, required,
});

const listenerParentSchemas: NodeFieldSchema[] = [
  {
    nodeKind: 'listenerParent',
    nodeType: 'http_server',
    fields: [
      nameField(),
      { key: 'port', label: '监听端口', type: 'number', required: true, min: 1, max: 65535, fromConfig: true },
    ],
  },
  {
    nodeKind: 'listenerParent',
    nodeType: 'mqtt_client',
    fields: [
      nameField(),
      { key: 'broker', label: 'Broker', type: 'string', placeholder: 'tcp://127.0.0.1:1883', fromConfig: true },
      { key: 'client_id', label: 'Client ID', type: 'string', fromConfig: true },
      { key: 'username', label: '用户名', type: 'string', fromConfig: true },
      { key: 'password', label: '密码', type: 'password', fromConfig: true },
    ],
  },
];

const listenerConnSchemas: NodeFieldSchema[] = [
  {
    nodeKind: 'listener',
    nodeType: 'http_route',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic', '连接收到的数据推送到此 topic'),
      topicField('out_topic', '出站 Topic', '订阅此 topic 的消息推送到连接'),
      { key: 'path', label: '路径', type: 'string', placeholder: '/api/data', fromConfig: true },
      { key: 'methods', label: '方法', type: 'select', options: ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'], fromConfig: true },
    ],
  },
  {
    nodeKind: 'listener',
    nodeType: 'mqtt_subscription',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'sub_topic', label: '订阅 Topic', type: 'string', fromConfig: true },
      { key: 'qos', label: 'QoS', type: 'number', min: 0, max: 2, fromConfig: true },
    ],
  },
  {
    nodeKind: 'listener',
    nodeType: 'tcp_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'address', label: '监听地址', type: 'string', placeholder: '0.0.0.0:8080', fromConfig: true },
    ],
  },
  {
    nodeKind: 'listener',
    nodeType: 'udp_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'address', label: '监听地址', type: 'string', placeholder: '0.0.0.0:8080', fromConfig: true },
    ],
  },
  {
    nodeKind: 'listener',
    nodeType: 'serial_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'port', label: '串口', type: 'string', placeholder: 'COM3 / /dev/ttyUSB0', fromConfig: true },
      { key: 'baud_rate', label: '波特率', type: 'number', default: 9600, fromConfig: true },
    ],
  },
  {
    nodeKind: 'listener',
    nodeType: 'script_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'content', label: '监听器脚本', type: 'script', scriptLang: 'go', fromConfig: true, default: DEFAULT_SCRIPT_CONTENT, tooltip: '定义顶级 Run（启用）/Close（禁用使 Run 退出）/Read（入站）/Write（出站可选）函数 + 包级变量持有状态' },
    ],
  },
];

export const NODE_FIELD_SCHEMAS: NodeFieldSchema[] = [
  ...listenerParentSchemas,
  ...listenerConnSchemas,
];

export const getSchema = (kind: NodeKind, type?: string): NodeFieldSchema | undefined =>
  NODE_FIELD_SCHEMAS.find(s => s.nodeKind === kind && s.nodeType === type);

const parseJSON = (s?: string): any => {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
};

export const flattenToForm = (kind: NodeKind, type: string, node: any): Record<string, any> => {
  const schema = getSchema(kind, type);
  if (!schema) return {};
  const cfg = parseJSON(node?.config);
  const vals: Record<string, any> = {};
  for (const f of schema.fields) {
    if (f.fromConfig) vals[f.key] = cfg[f.key] ?? node?.[f.key] ?? f.default;
    else vals[f.key] = node?.[f.key] ?? f.default;
  }
  return vals;
};

export const buildFromForm = (kind: NodeKind, type: string, formVals: Record<string, any>, base: any): Record<string, any> => {
  const schema = getSchema(kind, type);
  const out: Record<string, any> = { ...base };
  const cfg: Record<string, any> = {};
  if (schema) {
    for (const f of schema.fields) {
      const v = formVals[f.key];
      if (f.fromConfig) {
        if (v !== undefined && v !== '' && v !== null) cfg[f.key] = v;
      } else {
        out[f.key] = v;
      }
    }
  }
  out.config = JSON.stringify(cfg);
  return out;
};