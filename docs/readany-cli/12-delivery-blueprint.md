# ReadAny CLI Delivery Blueprint

这份文档是 ReadAny CLI / External AI Access 的主执行蓝图。它把“要做什么、怎么做、怎么测试、怎么验收、做到什么程度为止”放在同一处，方便开 issue、拆任务、写测试和做阶段验收。

## 1. 目标和边界

ReadAny CLI 是 ReadAny 的本地能力网关，不是单纯给人类敲命令的小工具。

目标链路：

```text
安装 CLI
  -> 安装 Skill
  -> 外部 AI 通过 MCP 发现 ReadAny
  -> 读取书库 / 章节 / 当前上下文 / 笔记 / 高亮 / RAG
  -> 创建 EPUB draft
  -> AI 修改本章、章节范围或全书
  -> 用户在 draft 工作区继续编辑
  -> 查看 history / diff
  -> validate
  -> export 新 EPUB
  -> audit 可追踪
```

安全边界：

- 开放业务能力，不开放裸数据库。
- 开放受控文件操作，不开放任意文件系统。
- 开放工具调用，不开放任意 shell。
- 默认 `readonly`。
- 写入必须 draft-first。
- 导出默认生成新文件，不覆盖原书。
- MCP `tools/list` 只展示已经真实实现、测试通过、文档同步的工具。
- Skill 安装不等于授权写入；CLI 安装不等于开放 editor / publisher。

## 2. 需要什么功能

### 2.1 CLI 和安装

必须提供：

```bash
readany --version
readany doctor --json
readany install
readany uninstall
readany tools list --json
```

完成线：

- CLI 是独立 package。
- 构建产物能独立启动。
- `doctor --json` 输出机器可读诊断。
- `install` / `uninstall` 可逆。
- 桌面客户端能调用 CLI 自己完成安装、卸载、修复。

当前限制：

- 当前 CLI 仍是 Node bundle；完整无 Node/runtime 依赖体验需要 native binary 或完整 runtime 打包。

### 2.2 Skill 和外部 AI 发现

必须提供：

```bash
readany skill install
readany skill uninstall
readany skill status --json
readany mcp serve --profile readonly
```

Skill 安装位置：

```text
$AGENT_HOME/skills/readany
~/.agent/skills/readany
```

Skill 必须说明：

- 默认使用 `readany mcp serve --profile readonly`。
- `readonly` 只能读取和搜索。
- 写入必须走 draft。
- editor / publisher profile 需要用户显式开启。
- 不请求任意 shell、任意 SQL、任意本地路径。

完成线：

- 外部 agent 能通过 Skill 知道 ReadAny 的存在。
- 外部 agent 能拿到 readonly MCP 配置。
- Skill 卸载只删除 ReadAny 管理的文件。

### 2.3 只读数据和当前上下文

必须提供：

```bash
readany books list --json
readany books search <query> --json
readany book get <book-id> --json
readany chapters list <book-id> --json
readany chapter get <book-id> <chapter-id> --chunk-start 1 --chunk-count 20 --json
readany context get --json
readany notes search <query> --json
readany highlights search <query> --json
readany bookmarks list <book-id> --json
readany skills list --json
readany rag search <query> --book <book-id> --mode bm25 --json
readany rag search <query> --book <book-id> --mode hybrid --json
readany rag search <query> --book <book-id> --mode vector --json
```

MCP tools：

```text
books.list
books.search
books.get
chapters.list
chapters.get
context.get
notes.search
highlights.search
rag.search
audit.list
```

完成线：

- 默认 profile 是 `readonly`。
- 大正文有 `limit`、`cursor`、`chunk-start`、`chunk-count` 或等价范围限制。
- 结果不暴露同步凭证、数据库路径、密钥。
- 章节结果能返回可回跳引用，例如 book / chapter / chunk / page / cfi。
- `context.get` 只读桌面端写入的 reader context snapshot，不读取裸 UI 内存，不修改阅读状态。
- `rag.search` 支持 BM25、hybrid、vector；BM25 总是可用，hybrid 可回退，vector 需要 embedding 配置。

### 2.4 EPUB Draft 和精排

精排不是一个按钮，而是一组 draft-first 工具：

```text
inspect -> draft create -> chapter read -> patch -> metadata patch -> toc rebuild -> diff -> validate -> export
```

必须提供：

```bash
readany epub inspect <book-id> --profile editor --json
readany epub draft create <book-id> --profile editor --json
readany epub draft discard <draft-id> --profile editor --json
readany epub chapter read <draft-id> <chapter-id> --profile editor --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor --json
readany epub metadata patch <draft-id> --patch <file> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
```

AI 必须能做：

- 修当前章。
- 修指定章节范围。
- 修全书。
- 修 metadata。
- 修 toc。
- 修 CSS / 样式。
- 生成封面、见解、元数据、目录、章节结构、全书修复建议。

用户必须能做：

- 从书籍详情创建 draft。
- 在 draft 工作区编辑章节。
- 编辑 metadata。
- 查看 AI 修改。
- 查看 diff 和 history。
- 撤销或丢弃 draft。
- validate。
- export。

完成线：

- 原始 EPUB hash 不变。
- 所有写入只落在 draft workspace。
- 用户编辑和 AI 编辑共用同一套 draft / history / diff。
- 每次写入有 operation history。
- patch 失败不会留下半写状态。
- `readonly` profile 不能创建 draft、patch、discard、export。

### 2.5 Validate 和 Export

必须提供：

```bash
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --profile publisher --output <path> --json
readany notes export <book-id> --output <path> --profile publisher --format markdown --json
```

后续提供：

```bash
readany knowledge export --format obsidian --json
```

完成线：

- export 前必须 validate。
- export 默认不覆盖已有文件。
- export 不覆盖源 EPUB。
- 输出路径受控或由用户明确授权。
- 导出 EPUB 能重新导入 ReadAny，或至少能被标准 EPUB 工具打开。
- 导出写入 audit。

### 2.6 桌面客户端入口

设置页入口：

```text
设置 -> 外部 AI 访问
```

设置页负责：

- CLI 安装 / 卸载 / 修复。
- Skill 安装 / 卸载 / 状态。
- readonly MCP 配置复制。
- doctor 结果展示。
- profile 状态展示。
- audit log 浏览。

精排入口：

```text
书籍详情 -> 创建精排草稿
Reader AI -> 修本章 / 修全书 / 生成建议
Draft 工作区 -> 用户编辑 / diff / history / validate / export
```

设置页不负责正文编辑。正文编辑属于书籍详情、Reader AI 和 draft 工作区。

完成线：

- 用户不用命令行也能安装 CLI 和 Skill。
- 用户能复制 readonly MCP 配置给外部 agent。
- 用户知道安装 CLI 不等于授权写入。
- 用户知道安装 Skill 不等于开放 editor / publisher。

## 3. 怎么做

每个新增能力按同一条流水线交付：

```text
需求边界
  -> core / domain service
  -> CLI 命令
  -> JSON/text 输出
  -> tool registry
  -> MCP tools/list 和 tools/call
  -> profile / scope / audit
  -> Skill 使用说明
  -> 桌面端入口或状态展示
  -> 测试
  -> 文档
  -> 验收记录
```

### 3.1 需求边界

实现前写清：

- 用户或外部 AI 要完成什么任务。
- 输入参数是什么。
- 输出结构是什么。
- profile / scope 是什么。
- risk 是 `low`、`medium` 还是 `high`。
- 是否写入。
- 是否影响原始文件。
- 是否需要用户确认。
- 大结果如何分页、限流或范围读取。
- 错误码是什么。

### 3.2 `@readany/core`

放真实业务能力：

- 数据查询。
- 章节读取。
- reader context snapshot 写入。
- RAG。
- EPUB 解析。
- draft workspace。
- history / diff。
- validate / export。

规则：

- CLI 不直接实现复杂 EPUB 逻辑。
- CLI 不绕过 core 直接读写业务状态。
- core 返回稳定结构，CLI 负责展示和协议适配。

### 3.3 `@readany/cli`

放入口和协议：

- 命令解析。
- profile / scope。
- tool registry。
- MCP server。
- Skill 安装器。
- JSON / text 输出。
- audit log 写入。

规则：

- 新 MCP tool 必须先进入 registry。
- registry 只放真实工具。
- 每个 tool 必须有 `name`、`description`、`inputSchema`、`scopes`、`risk`。
- `inputSchema` 必须运行时校验。
- `tools/list` 是对外承诺，不放规划中的工具。

### 3.4 MCP

MCP 只做：

- `initialize`。
- `tools/list`。
- `tools/call`。
- profile 权限检查。
- 参数 schema 校验。
- 标准 JSON-RPC 错误。
- ReadAny `CommandResult` JSON 输出。

MCP 不做：

- 隐藏工具。
- 任意 shell。
- 任意 SQL。
- 任意本地路径读写。
- 绕过 CLI / service 的业务调用。

### 3.5 Skill

Skill 只负责告诉外部 AI：

- ReadAny 有什么工具。
- 什么时候用 MCP。
- 什么时候用 CLI。
- 默认 readonly。
- 写入必须 draft-first。
- 不要请求任意 shell、任意 SQL、任意本地路径。
- 失败时先看 `doctor` 和 `audit.list`。

### 3.6 桌面客户端

桌面客户端负责 UI 和确认：

- 调 CLI。
- 展示状态。
- 复制配置。
- 发起 draft 编辑动作。
- 展示 diff / history。
- 确认 export。

规则：

- 不复制 CLI 的业务逻辑。
- 不直接改 EPUB 源文件。
- 不把正文编辑入口放进设置页。
- 高风险 profile 必须解释影响。

## 4. 怎么测试

### 4.1 提交前基础命令

CLI 相关改动必须跑：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
git diff --check
```

触碰 core EPUB 能力时补跑：

```bash
pnpm --filter @readany/core test -- src/epub/inspect.test.ts src/epub/draft.test.ts src/epub/chapter.test.ts src/epub/metadata.test.ts src/epub/diff.test.ts src/epub/validate.test.ts src/epub/export.test.ts
```

触碰 reader context 时补跑：

```bash
pnpm --filter @readany/core test -- src/ai/reading-context-service.test.ts
pnpm --filter @readany/cli test -- src/commands.test.ts src/mcp.test.ts
```

触碰桌面客户端或 Tauri bridge 时补跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

触碰打包资源、安装器或设置页时补跑：

```bash
pnpm --filter @readany/cli build
pnpm --filter app tauri info
```

### 4.2 单元测试

必须覆盖：

- 命令解析。
- JSON 输出。
- text 输出。
- profile / scope。
- path 解析。
- tool registry。
- input schema 校验。
- skill install / uninstall。
- audit log 摘要。
- reader context snapshot 写入、读取、清理。
- draft history。
- 原始 EPUB hash 不变。

### 4.3 集成测试

必须覆盖：

- 临时 `READANY_HOME` seed 数据。
- 临时 `AGENT_HOME` skill 安装。
- CLI 读书库。
- MCP `initialize`。
- MCP `tools/list`。
- MCP `tools/call`。
- readonly 拒绝写工具。
- editor 只能写 draft。
- publisher 才能 export。
- 构建后 CLI 的 MCP stdio smoke。

### 4.4 E2E 和手工验收

必须覆盖：

- macOS。
- Windows。
- Linux。
- 至少一个外部 agent，优先 Codex、Claude Desktop 或 Cursor。
- 桌面客户端设置页。
- 一条完整 draft 编辑链路。
- 一条 export 链路。

外部 agent 验收：

```text
复制 MCP 配置
  -> agent 启动 readany mcp serve --profile readonly
  -> tools/list 可见
  -> books.list 成功
  -> context.get 可返回 snapshot 或 empty
  -> readonly 写工具被拒绝
  -> audit.list 可看到调用摘要
```

### 4.5 测试硬要求

- 使用临时 `READANY_HOME`。
- 使用临时 `AGENT_HOME`。
- 不读写开发者真实书库。
- 不依赖真实用户阅读上下文。
- MCP `tools/list` 不出现规划中但未实现的工具。
- readonly profile 调写入工具必须失败。
- 写入工具必须证明原始 EPUB hash 不变。
- audit log 不记录完整正文、密钥、同步凭证或完整工具参数。

## 5. 怎么验收

### 5.1 单功能 Definition of Done

每个功能完成前必须满足：

```text
[ ] 有真实实现，不是 mock
[ ] 有 CLI 命令或 MCP tool
[ ] 有 JSON 输出
[ ] 有 text 输出或明确说明不需要
[ ] 有 profile / scope
[ ] 有稳定错误码
[ ] 有输出大小控制
[ ] 有成功测试
[ ] 有失败测试
[ ] 有权限测试
[ ] 有文档
[ ] README / help / tools/list 状态一致
[ ] 测试使用临时 READANY_HOME / AGENT_HOME
```

MCP tool 额外要求：

```text
[ ] inputSchema 声明 required
[ ] inputSchema 声明 additionalProperties: false
[ ] 运行时拒绝未声明参数
[ ] 运行时校验 minLength / minimum / maximum / enum
[ ] tools/list 只展示已实现工具
[ ] 输出不包含密钥、同步配置、任意本地路径
```

写入工具额外要求：

```text
[ ] readonly profile 调用失败
[ ] 写入目标是 draft 或受控对象
[ ] 原始文件 hash 不变
[ ] history 有记录
[ ] diff 或 summary 可查看
[ ] 失败不会留下半写状态
[ ] 有 undo、rollback 或 discard 路径
```

导出工具额外要求：

```text
[ ] validate 先于 export
[ ] 默认不覆盖原文件
[ ] 输出路径受控或用户授权
[ ] publisher profile 或确认机制生效
[ ] 导出产物可重新导入或被标准工具打开
[ ] audit log 记录导出
```

### 5.2 Milestone 停止线

M1 停止线：

```text
外部 AI 能发现 ReadAny，并在 readonly 下读取书库、笔记、高亮、已索引章节和 RAG。
```

必须满足：

- CLI check / test / build 全过。
- `readany doctor --json` 可解析。
- `readany skill status --json` 可解析。
- `readany tools list --json` 只列真实工具。
- readonly MCP 可 `initialize`、`tools/list`、`tools/call`。
- 构建后 CLI 的 MCP stdio smoke 通过。
- readonly 写工具返回 `permission_denied`。

M2 停止线：

```text
外部 AI 能读取未索引 EPUB/PDF 内容，能读取当前 reader context snapshot，并获得可回跳引用；RAG 支持 vector / hybrid。
```

必须满足：

- 已索引书籍和未索引 EPUB/PDF 都有可用内容读取路径。
- 大正文支持范围读取。
- `context.get` 只读 snapshot，清理阅读状态后 snapshot 被清理或返回 empty。
- RAG 结果包含可回跳引用。
- vector / hybrid 模式有配置、回退和测试。

M3 停止线：

```text
AI 和用户都可以在 draft 上编辑 EPUB，本章和全书修改都受控可追踪，原书不变。
```

必须满足：

- AI 可以创建 draft。
- AI 可以修改本章。
- AI 可以按章节范围或全书计划批量修改 draft。
- 用户可以查看 diff、手动编辑、撤销或丢弃。
- `epub.undo` 和 `epub.draft.discard` 都有验收证据。
- 原始 EPUB hash 不变。
- patch 失败不会留下破坏性状态。

M4 停止线：

```text
用户可以 validate 并 export AI / 用户共同编辑后的 EPUB 新文件。
```

必须满足：

- draft validate 可发现结构错误。
- export 默认输出新文件。
- 导出 EPUB 可重新导入 ReadAny，或至少能被标准 EPUB 工具打开。
- publisher profile 或等价授权生效。
- 导出有 audit 记录。

M5 停止线：

```text
普通用户可以通过桌面端完成外部 AI 接入；高级用户可以通过 CLI/MCP 跑完整读、搜、精排、导出闭环。
```

必须满足：

- 用户从桌面设置页完成 CLI / Skill / MCP 配置。
- 至少两个外部 agent 验证通过，其中一个使用 MCP。
- macOS / Windows / Linux 基本安装和 doctor 行为通过。
- 完整链路跑通：

```text
找书 -> 读内容 -> 读笔记/高亮 -> RAG 检索 -> 创建 draft -> AI 修改 -> 用户编辑 -> 校验 -> 导出 -> 审计
```

## 6. 当前可以对外说明的程度

可以说：

- ReadAny 有独立 CLI package。
- ReadAny 有 readonly MCP 入口。
- 外部 AI 可以读取书籍、笔记、高亮、章节和 RAG 检索结果。
- `chapters.*` 支持 indexed chunks 优先，未索引 EPUB/PDF fallback。
- `context.get` 可以读取桌面端写入的 reader context snapshot。
- `rag.search` 支持 BM25、hybrid、vector；hybrid 可回退，vector 需要 embedding 配置。
- 外部 AI 在 editor profile 下可以检查 EPUB、创建 draft、读取/替换 draft 章节、修改 metadata、重建 EPUB3 nav、查看 history 和 entry diff，并撤销已记录的 draft patch。
- 外部 AI 在 publisher profile 下可以 validate 并 export active draft 为新 EPUB。
- 桌面端有 `设置 -> 外部 AI 访问` 入口。

必须同时说明：

- 当前 CLI 仍是 Node bundle，不等同于完整 native binary 安装体验。
- `context.get` 只读 snapshot，不读裸 UI 内存。
- `epub.diff` 当前是 source/draft EPUB entry 的 hash 和 size 差异，不是完整内容级 diff。
- `epub.toc.rebuild` 当前只重建 EPUB3 nav，不保证 NCX。
- `notes.export` 只导出单本书 notes/highlights，不是全知识库导出。
- knowledge export 尚未完成。
- `epub.undo` 当前只撤销已记录且资源未被后续改动覆盖的 draft patch；不做任意历史分支合并。
- 用户 draft 工作区完整 UI 仍需后续验收。

## 7. 不通过条件

出现任一情况，本阶段不能算完成：

- 文档写了工具，但 registry 没有真实实现。
- MCP `tools/list` 暴露规划中工具。
- readonly profile 能写入、导出或同步。
- 测试读写真实用户目录。
- patch 直接修改原始 EPUB。
- export 默认覆盖原文件。
- Skill 安装后让用户误以为已经授权写入。
- 设置页承担正文编辑入口。
- audit log 记录完整正文、密钥或同步凭证。

## 8. 验收记录

每个 milestone 完成时，复制：

```text
docs/readany-cli/acceptance/TEMPLATE.md
```

保存为：

```text
docs/readany-cli/acceptance/YYYY-MM-DD-Mx.md
```

记录：

- 日期、分支、commit。
- OS、Node、pnpm 版本。
- 执行命令。
- MCP `tools/list` 摘要。
- readonly 权限拒绝证据。
- reader context snapshot 证据。
- 原始 EPUB hash 证据。
- export 产物证据。
- 外部 agent 验证结果。
- 已知问题。
- 是否允许进入下一阶段。
