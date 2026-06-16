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
- [ ] 桌面设置页
- [ ] 外部 agent 接入

## 本次明确不验收

-

## 执行命令

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
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

## 安全边界证据

- readonly 写入拒绝：
- 原始 EPUB hash 不变：
- export 不覆盖源文件：
- export 不覆盖已有文件：
- Tauri allowlist：
- MCP tools/list 与真实实现一致：
- audit 不含完整正文 / 密钥 / 同步凭证：

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
