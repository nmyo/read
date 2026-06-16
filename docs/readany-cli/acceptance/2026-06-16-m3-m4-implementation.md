# ReadAny CLI M3/M4 Implementation Acceptance

## 基本信息

- 日期：2026-06-16
- Milestone：M3 / M4 implementation smoke
- 分支：`feat/readany-cli`
- Baseline commit：`9560fb49`
- 验收人：Codex
- 操作系统：macOS
- Node 版本：`v20.19.3`
- pnpm 版本：`9.15.0`
- ReadAny CLI 版本：`0.1.0`

## 本次验收范围

- [x] Tauri bridge allowlist for EPUB draft export
- [x] Draft workspace export UI wiring
- [x] EPUB draft workspace docs/status alignment
- [x] Built CLI management-command runtime smoke
- [x] EPUB draft batch chapter patch through shared history path
- [x] MCP nested inputSchema validation for batch patch and metadata patch
- [ ] Real EPUB/PDF/RAG sample end-to-end acceptance
- [ ] macOS / Windows / Linux packaged app matrix
- [ ] Native binary or full runtime bundle acceptance

## 本次明确不验收

- 不宣称 CLI 已经是完全无 Node/runtime 依赖的 native binary。
- 不宣称真实 EPUB/PDF/RAG 样本的引用回跳端到端验收已经完成。
- 不宣称 macOS / Windows / Linux 打包产物中的 CLI、Skill、MCP、draft export 全矩阵已经完成。
- 不宣称 `epub.diff` 已经是内容级 diff；当前仍是 source/draft EPUB entry hash/size diff。

## 执行命令

```bash
git diff --check
rustfmt --edition 2021 --check src/readany_cli.rs
cargo test readany_cli::tests -- --nocapture
cargo check
pnpm --filter app build
```

本记录新增后已执行：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
```

## 验收结果

```text
通过 / 不通过：部分通过
```

M3/M4 的代码级实现和本地自动化 smoke 可以作为当前进展证据；完整产品验收仍缺真实样本、外部 agent 和多平台打包产物证据。

## 证据摘要

- Tauri allowlist：`packages/app/src-tauri/src/readany_cli.rs` 固定 `epub_export` 为 `readany epub export <draft-id> --output <path> --profile publisher --json`。
- Tauri MCP config allowlist：设置页复制 MCP 配置时通过 `mcp_config` action 固定调用 `readany mcp config --profile readonly|editor|publisher --json`，非法 profile 在 Rust bridge 层拒绝。
- Tauri capability：`packages/app/src-tauri/capabilities/default.json` 增加 `dialog:allow-save`，导出路径来自保存面板。
- Draft workspace：`packages/app/src/components/epub-draft/EpubDraftWorkspace.tsx` 已提供 export 操作，validate 失败时阻止导出，导出前确认，source EPUB 不覆盖。
- CLI check：`pnpm --filter @readany/cli check` 通过。
- CLI test：`pnpm --filter @readany/cli test` 通过，7 个 test files / 102 tests。
- CLI build：`pnpm --filter @readany/cli build` 通过。
- MCP config generation：`readany mcp config --profile readonly --json` / `--profile publisher` 覆盖在 `packages/cli/src/commands.test.ts`、built CLI smoke 和 Tauri allowlist tests 中，非法 profile 返回错误；该命令只生成外部 agent 配置片段，不出现在 MCP `tools/list`。
- External agent smoke：`pnpm --filter @readany/cli smoke:agent` 通过，使用 built CLI stdio MCP 跑 readonly 发现/搜索、readonly 写入拒绝、editor draft 批量章节修改、publisher validate/export、MCP audit 导出记录和原 EPUB hash 不变检查。
- Batch chapter patch：`packages/cli/src/commands.test.ts` 和 `packages/cli/src/mcp.test.ts` 覆盖 `epub.chapters.patch` / `readany epub chapters patch` 在 readonly 下拒绝、editor 下批量替换两个 draft 章节、原 EPUB 不变，并验证 history 中仍写入普通 `epub.chapter.patch` 记录。
- MCP nested schema：`packages/cli/src/mcp.test.ts` 覆盖非 object arguments、空 batch、batch item 额外字段、metadata 非 object、metadata 额外字段均返回 `invalid_tool_arguments`。
- Runtime smoke：`packages/cli/src/build-smoke.test.ts` 阻断 `better-sqlite3` 加载后验证 `--version`、`doctor --json`、`mcp config --json`、`tools list --json`、`skill status/install/uninstall --json` 可以运行；构建后 stdio MCP 可响应 `initialize`、`tools/list`、readonly `books.list`，并拒绝 readonly `epub.export`；同时调用 `scripts/agent-smoke.mjs` 验证外部 agent MCP 闭环。
- CLI install safety：`packages/cli/src/install.test.ts` 覆盖 install / uninstall 遇到非 ReadAny 托管的用户命令时拒绝覆盖或删除。
- Skill install safety：`packages/cli/src/skill.test.ts` 覆盖 install 遇到非 ReadAny 托管 `SKILL.md` 时拒绝覆盖，uninstall 只移除托管 `SKILL.md` 并保留目录内用户文件。
- Draft export audit：`packages/cli/src/commands.test.ts` 和 `packages/cli/src/mcp.test.ts` 在真实 fixture EPUB draft export 流程中验证成功导出、覆盖失败和权限拒绝都会进入 audit 摘要，且 audit 不包含 draft id 或输出路径。
- Documentation：`README.md`、`00-overview-and-acceptance.md`、`04-testing-acceptance.md`、`06-client-settings.md`、`11-implementation-issue.md`、`12-delivery-blueprint.md` 已同步当前状态。

## 安全边界证据

- readonly 写入拒绝：由 CLI/MCP 单测覆盖；构建后 stdio MCP smoke 覆盖 readonly `epub.export` 返回 `permission_denied`。真实外部 agent 和打包产物链路仍需复测。
- 原始 EPUB hash 不变：由 CLI/core draft/export 测试覆盖，仍需真实样本验收记录补证据。
- export 不覆盖源文件：CLI `epub.export` 设计和 tests 覆盖，桌面端仅选择新输出路径。
- export 不覆盖已有文件：CLI 默认拒绝覆盖；桌面端不提供 overwrite。
- install / uninstall 不误伤用户文件：CLI install / uninstall 测试覆盖非托管 `readany` 命令保留。
- Skill install / uninstall 不误伤用户文件：CLI skill tests 覆盖非托管 `SKILL.md` 保留，以及托管 skill 卸载时保留同目录用户文件。
- Tauri allowlist：前端只能传受控 action options，Rust bridge 只拼固定命令；MCP config、EPUB export、draft 编辑等路径都不接受任意 CLI args。
- MCP tools/list 与真实实现一致：CLI/MCP tests 覆盖当前 28 个工具。
- 外部 agent 自动 smoke：`scripts/agent-smoke.mjs` 覆盖 readonly profile 发现/搜索和写入拒绝、editor profile draft 创建和批量章节 patch、publisher profile validate/export、MCP audit 记录、原始 EPUB hash 不变。
- audit 不含完整正文 / 密钥 / 同步凭证：CLI/MCP audit tests 覆盖摘要读取；CLI 和 MCP fixture draft export 流程覆盖导出审计摘要不泄漏 draft id / output path。真实外部 agent 和打包产物链路仍需补验收记录。

## 当前可对外说明

- ReadAny CLI / MCP 已有 draft-first EPUB 精排工具链。
- 外部 AI 在 editor profile 下可以创建 draft、读/改章节、按受限计划批量改章节、改 metadata、重建 EPUB3 nav、看 history/diff、undo/discard。
- 外部 AI 在 publisher profile 下可以 validate 并 export active valid draft 为新 EPUB。
- 桌面 draft 工作区已接入章节编辑、metadata、history、diff、validate、undo、discard 和 export。
- CLI 管理命令路径不加载 `better-sqlite3`，便于桌面端安装/诊断/Skill 管理。

## 当前不能对外宣称

- CLI 已经是完全无 Node/runtime 依赖的 native binary。
- 真实 EPUB/PDF/RAG 样本的引用回跳端到端验收已经完成。
- macOS / Windows / Linux 打包产物中 CLI、Skill、MCP、draft export 全矩阵已经完成。
- 至少两个外部 agent 已经验收通过。
- 自动 smoke 通过不等于 Codex / Claude Desktop / Cursor 真实客户端已完成手工验收。

## 已知问题

- CLI 数据能力仍依赖 Node 和 `better-sqlite3` 运行时。
- 当前 acceptance 仍是实现级和本地 smoke 记录，不是完整 M5 验收。
- `epub.diff` 仍是 entry-level diff，不是内容级 diff。

## 是否允许进入下一阶段

- [x] 是，允许继续补真实样本、外部 agent、多平台打包和 native/runtime 验收。
- [ ] 否

原因：M3/M4 主要能力已经实现并有本地自动化证据，但完整目标仍未完成。
