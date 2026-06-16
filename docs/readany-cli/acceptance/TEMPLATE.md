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

## 已知问题

- 

## 是否允许进入下一阶段

- [ ] 是
- [ ] 否

原因：
