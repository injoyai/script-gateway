# 项目 AI 协作约定

本文件用于约束 AI 助手在本仓库内所有改动必须遵守的硬性规则。每次会话开始前都应阅读本文件，禁止跨过本文件中的约定提出"重构""简化""统一"等修改建议。

---

## 1. 脚本处理器链（script_chain / processor_chain 中的 `script` 节点）

- 函数名固定 `Deal`
- 签名：`func Deal(payload []byte) (map[string]any, error)`
- 返回值约定：
  - `map 不为空, nil`：通过；key 为 topic，value 为消息内容
    - `value` 为 `[]byte` 时直接透传
    - 其他类型框架自动 JSON 序列化
    - `key == ""` 表示沿用入站 topic
  - `nil / 空 map, nil`：丢弃该消息
  - `_, err`：报错，框架降级使用原消息
- 默认模板必须保持最简骨架，不允许塞示例 import、示例业务逻辑、多余注释
- `script` 处理器节点上的 `topic / out_topic` 字段已废弃，禁止再加回

默认模板（前后端必须一致）：

```go
package main

func Deal(payload []byte) (map[string]any, error) {
    return map[string]any{
        "": payload,
    }, nil
}
```

---

## 2. 脚本监听器（script_conn）

- 顶级函数（按需实现）：
  - `Run() error`：启用时调用，阻塞，直到 `Close` 使其返回
  - `Close() error`：禁用时调用，释放资源
  - `Read() ([]byte, error)`：入站数据来源
  - `Write(p []byte) error`：可选，出站
- 默认模板必须保持最简骨架，不允许塞 `fmt.Println` 等示例代码

默认模板（前后端必须一致）：

```go
package main

func Run() error {
	return nil
}

func Close() error {
	return nil
}

func Read() ([]byte, error) {
	return nil, nil
}

func Write(p []byte) error {
	return nil
}
```

---

## 2.1 脚本分发器（dispatcher 中的 `script` 类型）

- 函数名固定 `Forward`
- 签名：`func Forward(payload any) error`
- 返回值约定：
  - `nil`：分发成功
  - `error`：分发失败
- 默认模板必须保持最简骨架，不允许塞示例 import、示例业务逻辑、多余注释

默认模板（前后端必须一致）：

```go
package main

func Forward(payload any) error {
	return nil
}
```

---

## 3. 节点新建 / 编辑的统一交互标准

- **新建弹窗**：只填基础属性（名称、订阅 Topic、发布 Topic、目标 Topic 等,如果是脚本类型,需要有「编辑脚本」按钮）
- **弹窗形态**：新建/编辑一律使用居中 Modal，禁止使用侧边 Drawer
- **脚本编辑按钮**：所有脚本类型容器（脚本监听器 `script_conn` / 脚本处理器链 `script_chain` / 脚本分发器 `script`）的新建弹窗和编辑弹窗都必须提供「编辑脚本」按钮，通过脚本编辑器抽屉修改脚本
- **禁止内嵌脚本编辑器**
- **修改脚本**：一律通过「编辑脚本」按钮，在脚本编辑器抽屉里修改
- 不允许为某一类节点单独搞一套"新建即写脚本"的非标流程

---

## 4. 删除交互

- 所有可删除节点必须二次确认（当前实现为 `window.confirm`）
- 父容器删除时级联清理其下子项
- 已对接删除接口的类型：
  - `listener-parent`
  - `listener-conn`
  - `processor_chain`
  - `dispatcher`
  - `viewer`
  - `mocker`

---

## 5. 已废弃，禁止再加回

- `pre_script` / `PreScript` / `NewPreProcessor`：入站预处理已统一由处理器链取代
- `internal/script/pre_processor.go`：已删除，禁止重建
- `listener_conn.pre_script` 在前端和后端均已移除
- `script` 处理器函数名 `Process`：必须使用 `Deal`
- `script` 处理器返回 `[]byte`：必须使用 `map[string]any` 以支持多 topic 输出

---

## 6. 工程约定

- 后端语言：Go；前端框架：CRA + AntD + React Flow（`@xyflow/react`）
- 后端验证：`go build ./...` 与 `go test ./internal/...` 必须通过
- 命令操作：禁止 `git add -A`、禁止 `git push --force`、禁止未授权的破坏性 git 操作
- 改动范围：仅做用户明确要求的事，不要顺手"重构""清理""加错误处理""加注释"
- **数据流可视化与数据管理（管理页）的配置改动必须双向同步**：
  - 在「数据流可视化」（DataFlowCanvas）上能新建 / 编辑 / 删除的所有容器类型，对应「数据管理」侧边栏中的管理页（数据监听 / 数据处理 / 数据转发等）必须支持相同的容器类型、相同的配置字段、相同的默认值与校验
  - 反之亦然：在管理页可新建 / 编辑的容器，画布上必须能渲染为节点并支持就地编辑（含 InlineEditPanel）
  - 当新增 / 修改某种容器类型（如新的 listener / processor / pusher 子类、参数 schema）时，必须同时改两侧；禁止"只改一侧"
  - 共享配置 schema 应抽取到公共模块（如 `processorSchema.ts`），两侧引用同一份定义

---

## 7. 标准变更流程

如果对本文件中的某条标准有调整意图：

1. 先把变更点列出来与用户对齐
2. 用户确认后，**同步更新本文件**
3. 再去改代码
4. 禁止私自修改AGENTS.md文件, 仅在用户主动提出修改后进行修改

禁止"先改代码再口头通知"的做法。
