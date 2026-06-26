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
  options?: string[];       // select 用
  min?: number; max?: number;
  scriptLang?: 'go';       // script 用，复用 ScriptFormField
  pluginType?: string;     // pluginParams 用，调 listPluginsByType
  fromConfig?: boolean;    // true=该字段存于 config JSON；false/省略=独立列
}

export type NodeKind =
  | 'listenerParent' | 'listener' | 'chain'
  | 'dispatcher' | 'viewer' | 'mocker';

export interface NodeFieldSchema {
  nodeKind: NodeKind;
  nodeType?: string;
  fields: FieldSpec[];
}

// listener pre_script 默认模板（对齐 pre_processor.go，所有 listener 共用的入站预处理）
export const DEFAULT_PRE_SCRIPT = `package main

func Process(payload []byte, topic string, metadata map[string]any) ([]byte, string, map[string]any, bool, error) {
	return payload, topic, metadata, true, nil
}
`;

// script_conn 的 content 字段默认模板（对象式：New + Run/Close/Read/Write 函数字段）
// 用户脚本定义带函数字段的对象，框架 reflect 取字段调用管理生命周期
export const DEFAULT_SCRIPT_CONTENT = `package main

import (
	"context"
	"time"
)

type myListener struct {
	// 用户状态字段，跨调用持有（如连接、server 实例）

	// 生命周期方法（函数字段，在 New 中赋值）
	Run   func(context.Context) error
	Close func() error
	Read  func(context.Context) ([]byte, error)
	Write func([]byte) error  // 可选
}

// New 工厂函数：框架调用此函数创建监听器对象实例
func New() *myListener {
	s := &myListener{}

	// Run 启用：初始化资源（建连接/开端口等）。ctx 取消时必须返回。
	s.Run = func(ctx context.Context) error {
		// 示例：在此开启你的服务，数据通过 Read 读取
		<-ctx.Done()
		return nil
	}

	// Close 禁用：释放资源。Run 后调用。
	s.Close = func() error { return nil }

	// Read 入站：阻塞读取一条数据。ctx 取消时返回 (nil, ctx.Err())。
	s.Read = func(ctx context.Context) ([]byte, error) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
		return []byte("hello"), nil
	}

	// Write 出站：写入数据到连接。可选，不实现则忽略出站。
	s.Write = func(p []byte) error { return nil }

	return s
}
`;

const nameField = (label = '名称'): FieldSpec => ({
  key: 'name', label, type: 'string', required: true,
});

const topicField = (key: string, label: string, tooltip?: string, required = false): FieldSpec => ({
  key, label, type: 'string', tooltip, required,
});

// listenerParent schemas
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

// listener conn schemas
const listenerConnSchemas: NodeFieldSchema[] = [
  // http_route
  {
    nodeKind: 'listener',
    nodeType: 'http_route',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic', '连接收到的数据推送到此 topic'),
      topicField('out_topic', '出站 Topic', '订阅此 topic 的消息推送到连接'),
      { key: 'path', label: '路径', type: 'string', placeholder: '/api/data', fromConfig: true },
      { key: 'methods', label: '方法', type: 'select', options: ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'], fromConfig: true },
      { key: 'pre_script', label: '预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT },
    ],
  },
  // mqtt_subscription
  {
    nodeKind: 'listener',
    nodeType: 'mqtt_subscription',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'sub_topic', label: '订阅 Topic', type: 'string', fromConfig: true },
      { key: 'qos', label: 'QoS', type: 'number', min: 0, max: 2, fromConfig: true },
      { key: 'pre_script', label: '预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT },
    ],
  },
  // tcp_conn / udp_conn
  {
    nodeKind: 'listener',
    nodeType: 'tcp_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'address', label: '监听地址', type: 'string', placeholder: '0.0.0.0:8080', fromConfig: true },
      { key: 'pre_script', label: '预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT },
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
      { key: 'pre_script', label: '预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT },
    ],
  },
  // serial_conn
  {
    nodeKind: 'listener',
    nodeType: 'serial_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'port', label: '串口', type: 'string', placeholder: 'COM3 / /dev/ttyUSB0', fromConfig: true },
      { key: 'baud_rate', label: '波特率', type: 'number', default: 9600, fromConfig: true },
      { key: 'pre_script', label: '预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT },
    ],
  },
  // script_conn
  {
    nodeKind: 'listener',
    nodeType: 'script_conn',
    fields: [
      nameField(),
      topicField('topic', '入站 Topic'),
      topicField('out_topic', '出站 Topic'),
      { key: 'content', label: '监听器脚本', type: 'script', scriptLang: 'go', fromConfig: true, default: DEFAULT_SCRIPT_CONTENT, tooltip: '脚本监听器本体脚本，定义 New + Run（启用）/Close（禁用）/Read（入站）/Write（出站，可选）函数字段的对象' },
      { key: 'pre_script', label: '入站预处理脚本', type: 'script', scriptLang: 'go', default: DEFAULT_PRE_SCRIPT, tooltip: '入站消息预处理，所有 listener 共用，定义顶级 Process 函数' },
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

// 把节点数据平铺到表单值
export const flattenToForm = (kind: NodeKind, type: string, node: any): Record<string, any> => {
  const schema = getSchema(kind, type);
  if (!schema) return {};
  const cfg = parseJSON(node?.config);
  const vals: Record<string, any> = {};
  for (const f of schema.fields) {
    if (f.key === 'pre_script') {
      // pre_script 是独立列
      vals[f.key] = node?.[f.key] ?? f.default ?? '';
    } else if (f.fromConfig) {
      vals[f.key] = cfg[f.key] ?? node?.[f.key] ?? f.default;
    } else {
      vals[f.key] = node?.[f.key] ?? f.default;
    }
  }
  return vals;
};

// 把表单值组装回节点 payload（用于 create/update）
export const buildFromForm = (kind: NodeKind, type: string, formVals: Record<string, any>, base: any): Record<string, any> => {
  const schema = getSchema(kind, type);
  const out: Record<string, any> = { ...base };
  const cfg: Record<string, any> = {};
  if (schema) {
    for (const f of schema.fields) {
      const v = formVals[f.key];
      if (f.key === 'pre_script') {
        out.pre_script = v ?? '';
      } else if (f.fromConfig) {
        if (v !== undefined && v !== '' && v !== null) cfg[f.key] = v;
      } else {
        out[f.key] = v;
      }
    }
  }
  out.config = JSON.stringify(cfg);
  return out;
};
