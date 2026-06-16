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
```

## 验收结果

```text
通过 / 不通过：部分通过
```

M3/M4 的代码级实现和本地自动化 smoke 可以作为当前进展证据；完整产品验收仍缺真实样本、外部 agent 和多平台打包产物证据。

## 证据摘要

- Tauri allowlist：`packages/app/src-tauri/src/readany_cli.rs` 固定 `epub_export` 为 `readany epub export <draft-id> --output <path> --profile publisher --json`。
- Tauri capability：`packages/app/src-tauri/capabilities/default.json` 增加 `dialog:allow-save`，导出路径来自保存面板。
- Draft workspace：`packages/app/src/components/epub-draft/EpubDraftWorkspace.tsx` 已提供 export 操作，validate 失败时阻止导出，导出前确认，source EPUB 不覆盖。
- CLI check：`pnpm --filter @readany/cli check` 通过。
- CLI test：`pnpm --filter @readany/cli test` 通过，7 个 test files / 92 tests。
- CLI build：`pnpm --filter @readany/cli build` 通过。
- Runtime smoke：`packages/cli/src/build-smoke.test.ts` 阻断 `better-sqlite3` 加载后验证 `--version`、`doctor --json`、`tools list --json`、`skill status/install/uninstall --json` 可以运行。
- Documentation：`README.md`、`00-overview-and-acceptance.md`、`04-testing-acceptance.md`、`06-client-settings.md`、`11-implementation-issue.md`、`12-delivery-blueprint.md` 已同步当前状态。

## 安全边界证据

- readonly 写入拒绝：由 CLI/MCP 单测覆盖，仍需在真实外部 agent 验收中复测。
- 原始 EPUB hash 不变：由 CLI/core draft/export 测试覆盖，仍需真实样本验收记录补证据。
- export 不覆盖源文件：CLI `epub.export` 设计和 tests 覆盖，桌面端仅选择新输出路径。
- export 不覆盖已有文件：CLI 默认拒绝覆盖；桌面端不提供 overwrite。
- Tauri allowlist：前端只能传 `outputPath`，Rust bridge 只拼受控 action，不接受任意 CLI args。
- MCP tools/list 与真实实现一致：CLI/MCP tests 覆盖当前 27 个工具。
- audit 不含完整正文 / 密钥 / 同步凭证：CLI/MCP audit tests 覆盖摘要读取，仍需真实链路验收记录补证据。

## 当前可对外说明

- ReadAny CLI / MCP 已有 draft-first EPUB 精排工具链。
- 外部 AI 在 editor profile 下可以创建 draft、读/改章节、改 metadata、重建 EPUB3 nav、看 history/diff、undo/discard。
- 外部 AI 在 publisher profile 下可以 validate 并 export active valid draft 为新 EPUB。
- 桌面 draft 工作区已接入章节编辑、metadata、history、diff、validate、undo、discard 和 export。
- CLI 管理命令路径不加载 `better-sqlite3`，便于桌面端安装/诊断/Skill 管理。

## 当前不能对外宣称

- CLI 已经是完全无 Node/runtime 依赖的 native binary。
- 真实 EPUB/PDF/RAG 样本的引用回跳端到端验收已经完成。
- macOS / Windows / Linux 打包产物中 CLI、Skill、MCP、draft export 全矩阵已经完成。
- 至少两个外部 agent 已经验收通过。

## 已知问题

- CLI 数据能力仍依赖 Node 和 `better-sqlite3` 运行时。
- 当前 acceptance 仍是实现级和本地 smoke 记录，不是完整 M5 验收。
- `epub.diff` 仍是 entry-level diff，不是内容级 diff。

## 是否允许进入下一阶段

- [x] 是，允许继续补真实样本、外部 agent、多平台打包和 native/runtime 验收。
- [ ] 否

原因：M3/M4 主要能力已经实现并有本地自动化证据，但完整目标仍未完成。
