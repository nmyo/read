# ReadAny CLI Implementation Roadmap

## Phase 0 - 定义边界

目标：

- 冻结命令形态。
- 冻结权限模型。
- 冻结 skill 安装位置。
- 冻结 MCP 资源和工具边界。

输出：

- CLI 命令清单。
- tool registry 草案。
- profile 草案。

完成标准：

- 命令清单进入文档。
- 第一批 MCP tool 进入文档。
- 第一批 scope 和 profile 进入文档。

## Phase 1 - 最小 CLI

目标：

- `readany doctor`
- `readany install`
- `readany uninstall`
- `readany --version`

要求：

- 能自检。
- 能显示安装路径。
- 能显示当前 profile。

建议实现：

- 新建 `packages/cli`。
- 增加 `bin.readany`。
- 使用 TypeScript 实现入口。
- 输出默认支持文本和 JSON。

可验收命令：

```bash
pnpm --filter @readany/cli build
pnpm --filter @readany/cli test
readany --version
readany doctor --json
```

## Phase 2 - 本地读取能力

目标：

- 列书。
- 搜书。
- 读书。
- 读笔记。
- 读高亮。

要求：

- 默认只读。
- 所有结果可分页。
- 支持结构化输出。

优先工具：

- `books.list`
- `books.search`
- `books.get`
- `chapters.list`
- `chapters.get`
- `notes.search`
- `highlights.search`

可验收命令：

```bash
readany books list --json
readany books search "agent" --json
readany book get <book-id> --json
```

实现要点：

- CLI 通过 Node 平台服务复用 `@readany/core` 的数据库 query 层。
- 只读命令先打通书、笔记、高亮、书签、技能等核心数据对象。
- 章节内容读取后续再接 EPUB/资源解析链路，不在这一阶段硬造假数据。

## Phase 3 - MCP Server

目标：

- `readany mcp serve`
- 外部 AI 可发现 ReadAny。
- 能调用基础只读工具。

要求：

- 支持 profile。
- 支持审计。
- 支持 workspace 限制。

可验收：

- 外部 MCP client 能列出 tools。
- `readonly` profile 能调用只读工具。
- `readonly` profile 调写工具返回权限错误。
- MCP 输出不泄露本地绝对路径，除非工具明确需要并被授权。

## Phase 4 - Draft / Edit

目标：

- 创建草稿。
- 修改章节。
- 修改元数据。
- 修改目录。
- 修改 CSS。

要求：

- 原文件不动。
- 所有改动可回放。
- 支持撤销和 diff。

优先工具：

- `epub.draft.create`
- `epub.inspect`
- `epub.chapter.read`
- `epub.chapter.patch`
- `epub.metadata.patch`
- `epub.toc.rebuild`

可验收：

- AI 可以修改 draft 中的章节。
- 原 EPUB hash 不变。
- draft operation history 可查看。

## Phase 5 - Export / Publish

目标：

- 导出 EPUB。
- 导出笔记。
- 导出 Obsidian。
- 导出报告。

要求：

- 导出前校验。
- 导出后可重新导入。
- 导出记录可追踪。

优先工具：

- `epub.validate`
- `epub.export`
- `notes.export`
- `knowledge.export`

可验收：

- 导出的 EPUB 可以被 ReadAny 重新导入。
- 导出路径在 workspace 或用户授权目录内。
- 导出记录写入审计日志。

## Phase 6 - Skill 管理

目标：

- 安装 skill。
- 卸载 skill。
- 更新 skill。
- 复制给通用 agent 目录。

要求：

- 不绑定单一 agent。
- 支持多 agent 共用。

命令：

```bash
readany skill install
readany skill uninstall
readany skill status
readany skill update
```

可验收：

- skill 安装到 `~/.agent/skills/readany` 或 `$AGENT_HOME/skills/readany`。
- 卸载只删除 ReadAny 管理的文件。
- `doctor` 可以识别 skill 状态。

## Phase 7 - 客户端集成

目标：

- 桌面客户端设置页提供一键管理。
- 展示安装、卸载、修复、诊断。

要求：

- 只做客户端侧入口。
- 不把移动端当主入口。

设置页需要展示：

- CLI 状态。
- MCP 状态。
- Skill 状态。
- 当前 profile。
- 最近一次 doctor 结果。
- 最近 agent 操作记录。
