# ReadAny CLI Acceptance Record Template

## 基本信息

- 日期：
- Milestone：
- 分支：
- Commit：
- 验收人：
- 操作系统：
- Node 版本：
- pnpm 版本：
- ReadAny CLI 版本：
- 样本数据位置：
- 样本数据 hash：
- 外部 agent 客户端：
- 桌面包来源：

## 本次验收范围

- [ ] CLI 基础命令
- [ ] Skill 安装 / 卸载
- [ ] readonly MCP
- [ ] 只读书库查询
- [ ] indexed chapters
- [ ] reader context snapshot
- [ ] RAG search
- [ ] EPUB draft
- [ ] EPUB export
- [ ] exported EPUB reimport / open
- [ ] 桌面设置页
- [ ] 外部 agent 接入
- [ ] macOS / Windows / Linux install matrix
- [ ] native binary / runtime bundle

## 本次明确不验收

-

## 执行命令

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
git diff --check
```

补充命令：

```bash
readany --version
readany doctor --json
readany skill status --json
readany tools list --json
readany mcp serve --profile readonly
```

桌面端 / Tauri bridge 相关：

```bash
cd packages/app/src-tauri && cargo test readany_cli --lib
cd packages/app/src-tauri && cargo check
pnpm --filter app build
```

EPUB draft / export 相关：

```bash
readany epub inspect <book-id> --profile editor --json
readany epub draft create <book-id> --profile editor --json
readany epub chapter read <draft-id> <chapter-id> --profile editor --format xhtml --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <fixture.xhtml> --profile editor --json
readany epub metadata patch <draft-id> --patch <fixture.json> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
readany epub undo <draft-id> <operation-id> --profile editor --json
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --profile publisher --output <tmp-output.epub> --json
readany epub draft discard <draft-id> --profile editor --reason "acceptance cleanup" --json
```

真实样本端到端相关：

```bash
readany books search "<sample-title>" --json
readany chapters list <epub-book-id> --json
readany chapter get <epub-book-id> <chapter-id> --json
readany chapters list <pdf-book-id> --json
readany chapter get <pdf-book-id> page-1 --json
readany rag search "<query>" --book <book-id> --mode bm25 --json
readany rag search "<query>" --book <book-id> --mode hybrid --json
readany audit list --source mcp --json
```

可选采证脚本：

```bash
pnpm --filter @readany/cli build
pnpm --filter @readany/cli acceptance:real -- \
  --readany-home <real-readany-home> \
  --book <book-id> \
  --epub-book <epub-book-id> \
  --pdf-book <pdf-book-id> \
  --rag-query "<query>" \
  --draft-export \
  --export-dir <tmp-export-dir> \
  --evidence <evidence-json>
pnpm --filter @readany/cli acceptance:validate -- \
  --record <acceptance-record.md> \
  --evidence <evidence-json> \
  --strict-m5
```

`acceptance:real` 默认只读；只有加 `--draft-export --export-dir <dir>` 才会创建 EPUB draft、validate、export、inspect 导出 EPUB，并默认 discard draft 清理验收工作区。需要保留 draft 手工检查时可额外传 `--keep-draft`。该脚本会在 stdout 输出脱敏摘要，并写入完整 JSON 证据；证据会自动记录 environment（平台、Node、pnpm、CLI version、git commit/branch）、`doctor --json` 诊断、样本书文件路径、字节数、SHA-256、可回跳 citation targets 和 `manualAcceptanceRequired` 清单。每个 `manualAcceptanceRequired` 项都带 `evidence` 和 `commands`，用于指导后续人工补证，但不能替代样本来源、真实外部 agent 和打包产物记录。

`acceptance:validate` 用来检查验收记录和 `acceptance:real` evidence 的结构。最终 M5 记录必须使用 `--strict-m5`，确保没有未勾选验收范围、结果不是“部分通过”，没有仍不能对外宣称的能力，并且外部 agent 表格至少有 Codex + Claude/Cursor 两条完整记录、打包矩阵包含 macOS / Windows / Linux 三平台完整记录。

## 验收结果

```text
通过 / 不通过：
```

## 证据摘要

- CLI check：
- CLI test：
- CLI build：
- MCP tools/list：
- reader context snapshot：
- readonly 权限拒绝：
- draft discard / rollback：
- 原始 EPUB hash：
- audit log：
- 外部 agent：
- 桌面设置页：
- exported EPUB reimport/open：
- PDF fallback：
- RAG 引用回跳：
- packaged app install：
- runtime / native bundle：

## 安全边界证据

- readonly 写入拒绝：
- 原始 EPUB hash 不变：
- export 不覆盖源文件：
- export 不覆盖已有文件：
- Tauri allowlist：
- MCP tools/list 与真实实现一致：
- audit 不含完整正文 / 密钥 / 同步凭证：

## 真实样本证据

样本清单：

| 类型 | 标题 / 文件 | 来源 | SHA-256 | 是否可公开 | 用途 |
| --- | --- | --- | --- | --- | --- |
| EPUB |  |  |  |  | inspect / draft / export |
| PDF |  |  |  |  | page fallback / citation |
| RAG index |  |  |  |  | bm25 / hybrid / vector |

端到端结果：

- EPUB inspect：
- EPUB draft edit：
- EPUB validate：
- EPUB export：
- 导出 EPUB 重新导入或标准 EPUB 工具打开：
- PDF `chapters.list/get` fallback：
- RAG result 引用字段：
- 桌面端引用点击回跳：

## 外部 Agent 证据

| 客户端 | 版本 | MCP 配置 profile | tools/list | read flow | draft/export flow | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex |  |  |  |  |  |  |
| Claude Desktop / Cursor |  |  |  |  |  |  |

必须附：

- MCP config 片段，不含密钥。
- `tools/list` 是否只包含真实实现工具。
- readonly 写入拒绝截图或日志摘要。
- editor draft 修改摘要。
- publisher validate/export 摘要。
- audit 摘要。

## 打包 / 安装矩阵

| 平台 | 包来源 | 安装 | `readany doctor --json` | Skill install/status | MCP initialize/tools/list | Draft export | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| macOS |  |  |  |  |  |  |  |
| Windows |  |  |  |  |  |  |  |
| Linux |  |  |  |  |  |  |  |

## 当前可对外说明

-

## 当前不能对外宣称

-

## 已知问题

- 

## 是否允许进入下一阶段

- [ ] 是
- [ ] 否

原因：
