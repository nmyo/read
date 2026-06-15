# ReadAny CLI Implementation Roadmap

## 阶段原则

每一阶段都必须做到：

- 文档先写清楚能力边界。
- registry 只注册真实实现的工具。
- 测试使用临时 `READANY_HOME` / `AGENT_HOME`。
- 默认只读，写入能力必须通过 profile 和 scope。
- 不破坏原始 EPUB、原始数据库和同步配置。

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
- README 明确当前已实现能力和未实现能力。

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
pnpm --filter @readany/cli check
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

当前已实现命令：

```text
readany books list
readany books search <query>
readany book get <book-id>
readany notes search <query>
readany highlights search <query>
readany bookmarks list <book-id>
readany skills list
```

未完成但属于本阶段尾巴：

```text
readany chapters list <book-id>
readany chapter get <book-id> <chapter-id>
```

章节命令必须接入真实 EPUB/资源解析链路后再开放。

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

实现要点：

- 先实现 stdio JSON-RPC 入口，支持 `initialize`、`tools/list`、`tools/call`。
- MCP 只暴露已经真实接线的工具；章节、RAG、EPUB draft/export 在接通前不出现在 `tools/list`。
- MCP 返回 ReadAny 标准 `CommandResult` JSON，便于外部 agent 可靠解析。

当前 MCP 已实现工具：

```text
books.list
books.search
books.get
notes.search
highlights.search
```

Phase 3 完整通过还需要补齐：

- MCP profile 权限测试覆盖。
- MCP stdio smoke 脚本或 fixture。
- 审计日志最小记录。
- 客户端可复制的 MCP 配置片段。

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
- `readonly` profile 调 draft 工具返回 `permission_denied`。
- 每次 patch 都能生成 diff。
- 用户可以丢弃 draft，原书不受影响。

建议实现顺序：

1. `epub.inspect`：解析 EPUB 结构、spine、toc、metadata、manifest。
2. `epub.draft.create`：复制受控资源到 draft workspace。
3. `epub.chapter.read`：读取 draft 或原书章节。
4. `epub.chapter.patch`：只对 draft 章节应用 patch。
5. `epub.metadata.patch`：只对 draft metadata 应用 patch。
6. `epub.toc.rebuild`：基于真实章节结构重建 toc。
7. `epub.diff`：展示 draft 和原书差异。

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
- 导出前 `epub.validate` 必须通过。
- 导出产物和原始 EPUB hash 不同，原始 EPUB hash 不变。
- 导出失败有明确错误码和可操作提示。

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
- skill 内容列出安全规则、默认 readonly、draft-first、MCP 启动命令。
- 如果目录里已有非 ReadAny 管理文件，不能误删。

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

Phase 7 完成标准：

- 设置页能显示 CLI binary 状态和版本。
- 设置页能运行 `doctor --json` 并渲染检查项。
- 设置页能安装、卸载、更新 skill。
- 设置页能复制外部 agent 的 MCP 配置。
- 设置页能解释“安装 CLI / 安装 Skill / 开启 MCP / 提升 profile”的区别。
- 第一版不需要后台 daemon，不需要移动端安装入口。

当前已落地：

- `设置 -> 外部 AI 访问` tab。
- 受限 Tauri command：只允许调用 ReadAny CLI allowlist 动作，不开放任意 shell。
- CLI version / doctor / tools list / skill status 展示。
- Skill install / uninstall。
- readonly MCP 配置复制。

当前缺口：

- 设置页 install / uninstall 仍依赖 PATH 中已有 `readany`，还没有从桌面安装包内置 CLI binary 完成“未安装也能安装”的闭环。
- 审计日志浏览 UI 未接入。

## 里程碑定义

更细的执行顺序、验收证据和 issue 拆分见 [07-delivery-playbook.md](07-delivery-playbook.md)。

### M1 - 只读外部 AI 入口

完成：

- CLI package。
- doctor/install/uninstall。
- skill install/uninstall/status。
- readonly MCP。
- 书、笔记、高亮只读工具。
- 单元测试、构建、类型检查通过。

不包含：

- 章节正文。
- RAG。
- draft。
- export。

### M2 - 读内容和知识检索

完成：

- 章节目录和正文读取。
- 当前书 / 当前章 / 选区上下文资源。
- RAG 搜索。
- 引用定位。

### M3 - AI 编辑 EPUB

完成：

- EPUB inspect。
- draft create。
- chapter patch。
- metadata patch。
- toc rebuild。
- diff / undo。

### M4 - 导出和客户端集成

完成：

- EPUB validate/export。
- notes / knowledge export。
- 设置页管理 CLI、Skill、MCP、profile。
- 审计日志浏览。

### M5 - 完整可用

完成：

- 读、搜、整理、精排、导出闭环跑通。
- macOS / Windows / Linux 三端验证。
- 外部 agent 至少验证 Codex 和 Claude Desktop 或 Cursor 中的一个。
