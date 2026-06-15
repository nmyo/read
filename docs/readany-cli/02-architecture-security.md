# ReadAny CLI Architecture and Security

## 总体结构

建议把外部 AI 访问拆成四层：

```text
core        -> 领域能力
cli         -> 命令行入口
mcp server  -> 外部 AI 访问入口
skill       -> 外部 AI 的使用说明与调用模板
```

## 代码组织建议

```text
packages/core
packages/cli
packages/app
packages/app-expo
```

其中：

- `packages/core` 放共享业务能力。
- `packages/cli` 放 `readany` 命令行入口。
- `packages/app` 提供图形设置页和本地管理入口。
- `packages/app-expo` 只做轻量查看或确认，不承担 CLI 安装职责。

`packages/cli` 应该是 monorepo 内的一等 package，有自己的 `package.json`、测试、构建和 `bin` 字段。桌面客户端可以随包携带 CLI，也可以调用同一份构建产物完成安装和卸载。

## CLI 角色

CLI 是人类、脚本和 agent 的统一入口，承担：

- 安装和卸载自身。
- 启动本地 MCP server。
- 诊断本地环境。
- 导入、搜索、读取、导出。
- 创建 draft、应用 patch、执行导出。
- 安装和卸载 skill 到通用 agent 目录。

CLI 不应该直接实现业务逻辑。业务逻辑优先沉到 `@readany/core`，CLI 只做：

- 参数解析。
- 权限检查。
- 平台路径解析。
- 调用 core 能力。
- 输出结构化结果。
- 记录审计日志。

## Skill 角色

Skill 不存数据，不持密钥，只描述“如何使用 ReadAny”。

Skill 的职责：

- 告诉 agent 可用能力。
- 告诉 agent 约束。
- 告诉 agent 如何调用 `readany mcp serve` 或 CLI 子命令。

Skill 的存放位置应该是通用 agent home，不属于 ReadAny 私有目录。

建议默认位置：

```text
~/.agent/skills/readany/SKILL.md
```

如果用户设置了 `AGENT_HOME`，优先使用：

```text
$AGENT_HOME/skills/readany/SKILL.md
```

ReadAny 只管理自己安装的 skill，不扫描或修改其他 skill。

## MCP 角色

MCP 是面向外部 AI 的主接口。

它应该：

- 暴露资源和工具。
- 支持只读和可写 profile。
- 支持分页和限流。
- 支持审计日志。

MCP server 默认使用 stdio，便于 Codex、Claude Desktop、Cursor 等本地 agent 启动：

```bash
readany mcp serve --profile readonly
```

如果未来需要常驻后台服务，再增加：

```bash
readany daemon start
readany daemon stop
```

## 安全模型

### 默认规则

- 只读优先。
- 不暴露任意 SQL。
- 不暴露任意 shell。
- 不暴露任意文件系统根。
- 只允许 workspace 范围访问。

### 写入规则

写操作必须落到 draft 或受控对象上：

- 先生成 plan。
- 再应用到 draft。
- 最后用户确认导出或提交。

### 权限分层

建议至少分成：

- `read`
- `analyze`
- `draft`
- `export`
- `admin`

更细的 scope 建议：

```text
book.read
book.import
book.metadata.write
content.read
note.read
note.write
knowledge.read
knowledge.write
rag.search
epub.inspect
epub.draft
epub.export
stats.read
sync.status
sync.run
admin.backup
```

### 高风险操作

以下动作必须确认：

- 删除书籍。
- 覆盖原文件。
- 批量修改书库。
- 修改同步配置。
- 读凭证。

## 运行模式

建议支持：

```text
readonly
assistant
editor
publisher
admin
```

Profile 到 scope 的映射：

```text
readonly:
  book.read, content.read, note.read, knowledge.read, rag.search, stats.read

assistant:
  readonly + note.write, knowledge.write

editor:
  assistant + epub.inspect, epub.draft, book.metadata.write

publisher:
  editor + epub.export

admin:
  publisher + book.import, sync.status, sync.run, admin.backup
```

默认 profile 必须是 `readonly`。

## 本地状态

CLI 需要能识别：

- 书库根目录。
- 当前配置档案。
- 当前 MCP 监听地址。
- skill 安装状态。
- 审计日志位置。

## 审计日志

写操作、导出操作、同步操作必须记录：

- 时间。
- 调用来源。
- profile。
- tool name。
- 输入摘要。
- 输出摘要。
- 影响对象。
- 成功或失败。

日志不应该记录完整正文、API key、同步密码等敏感数据。
