# ReadAny CLI Implementation Issue

这份文档可以直接作为 `feat/readany-cli` 后续工程 issue 的正文使用。它把我们要做什么、怎么做、怎么测试、怎么验收、做到什么程度为止写成执行清单。

## 背景

ReadAny 需要把本地阅读能力开放给外部 AI agent，但开放的是受控业务工具，不是裸数据库、任意文件系统或任意 shell。

目标链路：

```text
安装 CLI
  -> 安装 Skill
  -> 外部 AI 通过 MCP 发现 ReadAny
  -> 读取书库 / 章节 / 笔记 / 高亮 / RAG
  -> 创建 EPUB draft
  -> AI 修改本章或全书
  -> 用户在 draft 工作区继续编辑
  -> 查看 history / diff
  -> validate
  -> export 新 EPUB
  -> 审计可追踪
```

核心原则：

- 默认 readonly。
- 写入必须 draft-first。
- 导出默认生成新文件，不覆盖原书。
- MCP `tools/list` 只暴露真实实现、测试通过、文档同步的工具。
- Skill 安装到通用 agent 目录：`$AGENT_HOME/skills/readany` 或 `~/.agent/skills/readany`。
- 桌面设置页只管 CLI、Skill、MCP、profile 和诊断；用户精排入口在书籍详情、Reader AI 和 draft 工作区。

## 当前已实现

当前分支：`feat/readany-cli`。

已实现能力：

- `packages/cli` 独立 package。
- `readany doctor/install/uninstall/tools list`。
- `readany skill install/uninstall/status`。
- 只读书库、笔记、高亮、书签、skills 查询。
- indexed chunks 章节读取。
- BM25 RAG over chunks。
- stdio MCP：`initialize`、`tools/list`、`tools/call`。
- EPUB draft 链路：`inspect`、`draft create`、`draft discard`、`chapter read`、`chapter patch`、`metadata patch`、`toc rebuild`、`history`、`diff`、`validate`、`export`。
- notes export：单本书 notes/highlights 导出为 Markdown、JSON、Obsidian 或 Notion 文件。
- 桌面端 `设置 -> 外部 AI 访问` 入口，可管理 CLI / Skill / readonly MCP 配置。

当前 MCP 可以暴露：

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
notes.export
highlights.search
rag.search
epub.inspect
epub.draft.create
epub.draft.discard
epub.chapter.read
epub.chapter.patch
epub.metadata.patch
epub.toc.rebuild
epub.history
epub.diff
epub.validate
epub.export
```

当前还不能对外宣称：

- 未索引 EPUB/PDF fallback 章节解析已经完成。
- vector / hybrid RAG 已经完成。
- knowledge export 已经完成。
- 用户 draft 工作区完整 UI 已经完成。
- CLI 已经是完全无 Node/runtime 依赖的 native binary。

## 功能范围

### 1. CLI 和安装能力

需要：

- `readany --version`
- `readany doctor --json`
- `readany install`
- `readany uninstall`
- `readany tools list --json`
- 用户安装桌面客户端后，客户端能安装、卸载或修复 CLI。
- CLI 自己可以安装自己、卸载自己，桌面端只是调用入口。

不做：

- 不把 CLI 绑定成只能由桌面端启动。
- 不自动授权 editor / publisher profile。
- 不让外部 AI 直接执行任意 shell。

验收：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
node packages/cli/dist/bin/readany.js --version
node packages/cli/dist/bin/readany.js doctor --json
node packages/cli/dist/bin/readany.js tools list --json
```

### 2. Skill 和 MCP 发现能力

需要：

- `readany skill install`
- `readany skill uninstall`
- `readany skill status --json`
- `readany mcp serve --profile readonly`
- Skill 明确告诉外部 AI：默认 readonly、写入走 draft、不要请求任意 SQL/shell/path。
- 设置页能复制 readonly MCP 配置。

不做：

- 不把 Skill 安装到项目目录。
- 不让安装 Skill 等于授权写入。
- 不在 Skill 里暗示外部 AI 可以访问裸数据库。

验收：

```bash
AGENT_HOME="$(mktemp -d)" node packages/cli/dist/bin/readany.js skill install --json
AGENT_HOME="$(mktemp -d)" node packages/cli/dist/bin/readany.js skill status --json
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | node packages/cli/dist/bin/readany.js mcp serve --profile readonly
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node packages/cli/dist/bin/readany.js mcp serve --profile readonly
```

### 3. 只读数据能力

需要：

- 书籍列表、搜索、详情。
- 章节目录和范围读取。
- 笔记、高亮、书签、skills 查询。
- BM25 / vector / hybrid RAG。
- 当前书、当前章、选区上下文资源。

当前边界：

- `chapters.*` 当前是 indexed chunks 视图。
- `rag.search` 当前是 BM25 over chunks。
- 未索引 EPUB/PDF fallback 和 vector / hybrid 是后续交付。

验收：

```bash
node packages/cli/dist/bin/readany.js books list --json
node packages/cli/dist/bin/readany.js books search "keyword" --json
node packages/cli/dist/bin/readany.js book get <book-id> --json
node packages/cli/dist/bin/readany.js chapters list <book-id> --json
node packages/cli/dist/bin/readany.js chapter get <book-id> <chapter-id> --chunk-start 1 --chunk-count 20 --json
node packages/cli/dist/bin/readany.js notes search "keyword" --json
node packages/cli/dist/bin/readany.js highlights search "keyword" --json
node packages/cli/dist/bin/readany.js rag search "keyword" --book <book-id> --json
```

### 4. EPUB draft 和精排能力

需要：

- `epub.inspect`
- `epub.draft.create`
- `epub.draft.discard`
- `epub.chapter.read`
- `epub.chapter.patch`
- `epub.metadata.patch`
- `epub.toc.rebuild`
- `epub.history`
- `epub.diff`
- `epub.undo` 或等价可回滚能力。
- AI 可以修本章、指定章节范围或全书。
- Reader AI 可以生成封面、见解、元数据、目录、全书修复建议。
- 用户可以在 draft 工作区手动编辑，并继续交给 AI 修改。

当前边界：

- `epub.toc.rebuild` 只重建 EPUB3 nav 目录，不重建 NCX，也不生成内容级 diff。
- `epub.chapter.patch` 当前只替换 draft 内单个 XHTML 章节资源。
- `epub.diff` 当前只比较 EPUB entry 的 hash 和 size，不返回完整正文。

验收：

```bash
ORIGINAL_HASH="$(shasum -a 256 sample.epub | awk '{print $1}')"
node packages/cli/dist/bin/readany.js epub draft create <book-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub chapter read <draft-id> <chapter-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub chapter patch <draft-id> <chapter-id> --xhtml chapter.xhtml --profile editor --json
node packages/cli/dist/bin/readany.js epub metadata patch <draft-id> --patch metadata.json --profile editor --json
node packages/cli/dist/bin/readany.js epub history <draft-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub diff <draft-id> --profile editor --json
test "$ORIGINAL_HASH" = "$(shasum -a 256 sample.epub | awk '{print $1}')"
```

### 5. Validate 和 Export

需要：

- `epub.validate`
- `epub.export`
- `notes.export`
- knowledge export。
- 导出审计。
- publisher profile 或等价明确授权。

当前边界：

- `epub.validate` 已实现为结构和资源引用校验，不自动修复。
- `epub.export` 已实现为 validate 后导出新 EPUB，默认不覆盖已有文件、不覆盖原书。
- `notes.export` 已实现为单本书 notes/highlights 文件导出，默认不覆盖已有文件。
- knowledge export 后续交付。

验收：

```bash
node packages/cli/dist/bin/readany.js epub validate <draft-id> --profile publisher --json
node packages/cli/dist/bin/readany.js epub export <draft-id> --output exported.epub --profile publisher --json
node packages/cli/dist/bin/readany.js notes export <book-id> --output notes.md --profile publisher --json
test -f exported.epub
```

必须确认：

- validate 失败时 export 失败。
- export 默认不覆盖已有文件。
- readonly / editor profile 不能 export。
- 导出不修改原始 EPUB。
- 导出产物能重新导入 ReadAny，或至少能被标准 EPUB 工具打开。

### 6. 桌面端入口

设置页：

```text
设置 -> 外部 AI 访问
```

负责：

- CLI 安装 / 卸载 / 修复。
- Skill 安装 / 卸载 / 状态。
- readonly MCP 配置复制。
- doctor 诊断展示。
- profile 状态展示。
- 审计日志浏览。

精排入口：

```text
书籍详情 -> 创建精排草稿
Reader AI -> 修本章 / 修全书 / 生成建议
Draft 工作区 -> 用户编辑 / diff / history / validate / export
```

验收：

- 用户不用命令行也能安装 CLI 和 Skill。
- 用户能复制 readonly MCP 配置给外部 agent。
- 设置页明确说明：安装 CLI 不等于授权写入。
- 设置页明确说明：安装 Skill 不等于开放 editor / publisher。
- 正文编辑不放在设置页。

## 工程落点

`packages/core`：

- 数据查询。
- RAG。
- EPUB 解析。
- draft workspace。
- history / diff。
- validate / export。

`packages/cli`：

- 命令解析。
- profile / scope。
- tool registry。
- MCP server。
- Skill 安装器。
- JSON / text 输出。
- 审计日志写入。

桌面客户端：

- 调 CLI。
- 展示状态。
- 复制配置。
- 发起 draft 编辑动作。
- 展示 diff / history。
- 确认 export。

## 测试要求

提交前基础命令：

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

触碰桌面客户端或 Tauri bridge 时补跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

测试硬要求：

- 使用临时 `READANY_HOME`。
- 使用临时 `AGENT_HOME`。
- 不读写开发者真实书库。
- MCP `tools/list` 不出现规划中但未实现的工具。
- readonly profile 调写入工具必须失败。
- 写入工具必须证明原始 EPUB hash 不变。

## Definition of Done

每个新增 CLI command / MCP tool 必须满足：

```text
[ ] 有真实实现，不是 mock
[ ] 有 CLI 命令或 MCP tool schema
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
[ ] inputSchema 有 required
[ ] inputSchema 有 additionalProperties: false
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
[ ] 审计日志记录导出
```

## Milestone 停止线

M1：

```text
外部 AI 能发现 ReadAny，并在 readonly 下读取书库、笔记、高亮、已索引章节和 BM25 RAG。
```

M2：

```text
外部 AI 能读取未索引 EPUB/PDF 内容，并获得可回跳引用；RAG 支持 vector / hybrid。
```

M3：

```text
AI 和用户都可以在 draft 上编辑 EPUB，本章和全书修改都受控可追踪，原书不变。
```

M4：

```text
用户可以 validate 并 export AI / 用户共同编辑后的 EPUB 新文件。
```

M5：

```text
普通用户可以通过桌面端完成外部 AI 接入；高级用户可以通过 CLI/MCP 跑完整读、搜、精排、导出闭环。
```

## 不通过条件

出现任一情况，本阶段不能算完成：

- 文档写了工具，但 registry 没有真实实现。
- MCP `tools/list` 暴露规划中工具。
- readonly profile 能写入、导出或同步。
- 测试读写真实用户目录。
- patch 直接修改原始 EPUB。
- export 默认覆盖原文件。
- Skill 安装后让用户误以为已经授权写入。
- 设置页承担正文编辑入口。
- 审计日志记录完整正文、密钥或同步凭证。

## 验收记录

每个 milestone 完成时，复制模板：

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
- 权限拒绝证据。
- 原始 EPUB hash 证据。
- 外部 agent 验证结果。
- 已知问题。
- 是否允许进入下一阶段。
