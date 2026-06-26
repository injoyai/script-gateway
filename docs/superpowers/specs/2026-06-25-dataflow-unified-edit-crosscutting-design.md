# 数据流统一编辑能力 - 横切基础设施设计

日期：2026-06-25
范围：阶段1 横切基础设施（后续阶段按模块逐个补全）

## 1. 背景与目标

当前 `data-flow` 页面与多套旧列表管理页并存：

- 旧列表页：`data-listener/*`（HTTP/MQTT/TCP/UDP/Serial/Script/Parser 共 7）、`data-forwarding/*`（3）、`unified/*`（ProcessorChain/Dispatcher 2）、`data-collection/*`（3）
- 数据流页：`data-flow/DataFlowCanvas`（节点 + 连线 + 轻量 `InlineEditPanel` Drawer）

目标：在 `data-flow` 上对齐旧列表页的全部功能，逐步废弃列表页。**保留 `data-flow` 现有架构、数据流逻辑、`buildGraph`、API 契约不变**，只在"编辑入口"层做横切基础设施。

迁移分多阶段：
1. **阶段1 横切基础设施**（本设计）：建脚本编辑器接入、字段渲染机制统一、插件 spec 动态渲染、新建/编辑表单统一。
2. 阶段2+：按模块逐个补全（监听器 → 转发器 → 链 → 采集），每模块独立 spec。

## 2. 架构与组件分层

不动 `data-flow` 节点 / 连线 / `buildGraph` / API 契约。只加编辑入口层。

### 两层编辑入口

| 层 | 组件 | 内容 | 触发 |
|---|---|---|---|
| 轻量层 | 现有 `InlineEditPanel`（Drawer） | name、enable 开关、topic 路由（in/out/topics）、状态、摘要 | 点节点名 / 点卡片 |
| 完整层 | **新建** `NodeEditModal`（Modal） | 全部配置字段（按 FieldSchema）+ 脚本（ScriptFormField）+ 插件 spec（PluginParamRenderer） | 节点卡片"高级编辑"按钮；右键新建也打开它（create 模式） |

### 横切基础组件

- `FieldSchema` 声明机制：每类节点声明字段 spec，统一渲染。替代当前 InlineEditPanel 硬编码 `Form.Item`。
- `PluginParamRenderer`：从 `ProcessorChainManager` 抽取 `renderPluginParamInput`，复用后端 `pluginApi.listPluginsByType`，给 chain 的 processor 配置用。
- `ScriptFormField`：直接复用现有组件。

### 新建/编辑统一

右键 `CreateKind` 不再用简表单，直接打开 `NodeEditModal`（create 模式 = 空表单 + schema 默认值）。编辑也打开同一个 Modal。`InlineEditPanel` Drawer 内新增"高级编辑"按钮跳 Modal。

## 3. 字段渲染机制

### FieldSchema 声明结构

```ts
interface FieldSpec {
  key: string;            // port / broker / path / pre_script ...
  label: string;
  type: 'string' | 'number' | 'select' | 'switch' | 'password'
       | 'textarea' | 'script' | 'pluginParams';
  required?: boolean;
  tooltip?: string;
  placeholder?: string;
  default?: any;
  options?: string[];      // select 用
  min?: number; max?: number;
  scriptLang?: 'go';      // script 类型，复用 ScriptFormField
  pluginType?: string;    // pluginParams 用，调 listPluginsByType
  fromConfig?: boolean;   // 该字段来自 config JSON（保存时组装回 config）
}

interface NodeFieldSchema {
  nodeKind: 'listenerParent' | 'listener' | 'chain' | 'dispatcher' | 'viewer' | 'mocker';
  nodeType?: string;      // http_server / mqtt_client / tcp_server ...
  fields: FieldSpec[];
}
```

### 渲染机制

- `FieldRenderer`：纯函数，按 `FieldSpec.type` 渲染对应 `Form.Item` + 控件。`script` → 复用 `ScriptFormField`；`pluginParams` → 复用 `PluginParamRenderer` 调后端 spec。
- `NODE_FIELD_SCHEMAS`：schema 注册表，按 `nodeKind + nodeType` 索引。**横切阶段先填 listener 全部类型**（http/mqtt/tcp/udp/serial/script + parent）作为首批验证，其余模块后续阶段填。
- `NodeEditModal`：读 schema → flat 设置表单字段，保存时按 schema 拆装回 `config` JSON / 独立列。复用 InlineEditPanel 现有 `parseJSON` / 字段平铺逻辑，改由 schema 驱动。

### chain 的特殊性

chain 的完整编辑是 processor 链编排（多 processor 子项 + 每个 processor 动态字段），是"子项列表 + 插件 spec"的复合，比纯字段复杂。**横切阶段只建机制**，chain 的 processor 编排实现放到"链模块阶段"用这套机制做，避免横切阶段过载。

### 字段来源

parent / conn 的独立列（port/broker/path/methods/pre_script...）直接映射；config JSON 内字段（通过 parseJSON 平铺）由 schema 声明 `fromConfig`。

## 4. 保存流程与数据流

### 表单值 → 节点数据拆装

- `NodeEditModal` 内部表单 flat 存所有字段。
- 保存时按 `FieldSpec` 拆装：独立列字段直接映射；config JSON 内字段（`fromConfig`）组装回 `config` 字符串。
- 复用 InlineEditPanel 现有 `parseJSON` / 平铺逻辑，改为 schema 驱动。

### 新建 vs 编辑

- Modal 接收 `mode: 'create' | 'edit'` + `target`。
- `create`：空表单 + schema 默认值 → 调 `createListenerParent` / `createListenerConn` 等（已有 service）。
- `edit`：加载现有节点 → 调 `updateListenerParent` / `updateListenerConn` 等（已有 service）。

### 与 Drawer 的关系

- `NodeEditModal` 状态提升到 `DataFlowCanvas`（与 `editTarget` 同层管理）。
- `InlineEditPanel` Drawer 内新增"高级编辑"按钮 → 关闭 Drawer、打开 Modal（edit 模式，传同节点）。
- 右键 `CreateKind` → 直接打开 Modal（create 模式，传 kind + 默认 type）。

### 数据流不动

保存成功 → 复用现有 `onSaved` / `reloadFlowData` 回调刷新 `flowData`，`buildGraph` 重建节点。不新增数据流路径，不改 API 契约。

### 错误处理

- 保存失败显示后端 `msg`（复用现有 `message.error`）。
- schema 缺失该类型时降级：Modal 显示"该类型暂不支持高级编辑，请用轻量 Drawer"，不阻断 Drawer 使用。

## 5. 文件结构

```
web/src/pages/data-flow/
  FlowNodes.tsx               # 不动（节点渲染）
  DataFlowCanvas.tsx          # 接入 NodeEditModal 状态（新增 modalTarget/createTarget）
  InlineEditPanel.tsx         # Drawer 加"高级编辑"按钮；schema 缺失类型仍用现有硬编码逻辑
  NodeEditModal.tsx           # 新建：完整编辑 Modal
  fieldSchema.ts              # 新建：FieldSpec / NodeFieldSchema 类型 + NODE_FIELD_SCHEMAS 注册表
  FieldRenderer.tsx           # 新建：按 FieldSpec 渲染控件
web/src/components/
  PluginParamRenderer.tsx     # 新建：从 ProcessorChainManager 抽取的插件 spec 渲染
  ScriptFormField.tsx         # 复用现有
```

## 6. 横切阶段交付清单

- [ ] `fieldSchema.ts`：类型定义 + listener 全类型 schema（http_server/http_route/mqtt_client/mqtt_route/tcp_server/.../parent）
- [ ] `FieldRenderer.tsx`：按 FieldSpec 渲染
- [ ] `PluginParamRenderer.tsx`：抽取并复用 pluginApi
- [ ] `NodeEditModal.tsx`：schema 驱动表单 + 拆装保存 + create/edit 模式
- [ ] `DataFlowCanvas.tsx`：接入 Modal 状态；CreateKind 改打开 Modal
- [ ] `InlineEditPanel.tsx`：加"高级编辑"按钮
- [ ] listener 模块可在 Modal 完整编辑（含 pre_script）

## 7. 非目标（本阶段不做）

- chain 的 processor 链编排（留链模块阶段）
- dispatcher/viewer/mocker/forward 的完整字段（留各自模块阶段）
- 旧列表页删除（功能对齐后逐步废弃，本阶段不删）
- 数据流逻辑、buildGraph、API 契约变更
