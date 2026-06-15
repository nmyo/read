# ReadAny CLI Testing and Acceptance

## 测试目标

这套测试不是只看“命令能跑”，而是看：

- 权限边界是否正确。
- 外部 AI 是否只能看到它该看到的内容。
- 写操作是否都落在 draft 上。
- 安装和卸载是否可逆。
- 导出结果是否可复用。

## 测试层级

### 1. 单元测试

覆盖：

- 命令解析。
- profile 解析。
- path 解析。
- skill 安装路径。
- 工具 schema 校验。
- draft 操作记录。

建议文件：

```text
packages/cli/src/__tests__/commands.test.ts
packages/cli/src/__tests__/profiles.test.ts
packages/cli/src/__tests__/skill-install.test.ts
packages/cli/src/__tests__/tool-registry.test.ts
```

### 2. 集成测试

覆盖：

- CLI 调 core 能力。
- MCP server 能启动并响应。
- 只读 profile 不能执行写操作。
- editor profile 可以写 draft，但不能碰原文件。

集成测试必须使用临时 ReadAny 数据目录，不允许读写开发者真实书库。

### 3. E2E 测试

覆盖：

- 安装。
- 卸载。
- doctor。
- mcp serve。
- 读书库。
- 搜索。
- 创建草稿。
- 导出。

建议增加 fixture：

```text
packages/cli/fixtures/library/
packages/cli/fixtures/books/sample.epub
packages/cli/fixtures/books/sample.pdf
```

### 4. 手工验证

覆盖：

- macOS。
- Windows。
- Linux。
- 一个外部 agent。
- 一个本地图形客户端。

外部 agent 第一阶段至少验证一个，优先 Codex 或 Claude Desktop。

## 推荐测试矩阵

```text
平台     安装   卸载   doctor   MCP   只读   写草稿   导出
macOS    ✓      ✓      ✓        ✓     ✓      ✓       ✓
Windows  ✓      ✓      ✓        ✓     ✓      ✓       ✓
Linux    ✓      ✓      ✓        ✓     ✓      ✓       ✓
```

## 验收标准

### CLI 安装

- `readany install` 成功。
- `readany uninstall` 可逆。
- `readany doctor` 能定位问题。
- 客户端设置页能显示 CLI 已安装。
- 客户端设置页能触发修复。

### 外部 AI 访问

- 能列书、搜书、读内容。
- 能读笔记、读高亮、读知识文档。
- 能创建 draft。
- 能导出新文件。
- MCP tool list 中能看到 ReadAny 工具说明。
- Skill 中能指导 agent 正确调用 ReadAny。

### 安全边界

- 默认只读。
- 不允许任意 shell。
- 不允许任意 SQL。
- 不允许越过 workspace。
- 不允许直接覆盖原始 EPUB。
- `readonly` profile 调写工具必须失败。
- 未授权 export profile 时不能导出文件。

### 可观察性

- 每次写操作都有日志。
- 每次导出都有记录。
- 每次失败都有明确错误信息。
- `readany doctor --json` 能输出 machine-readable 诊断结果。

## 必须通过的命令

第一阶段：

```bash
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
readany --version
readany doctor --json
readany skill status --json
readany mcp serve --profile readonly
```

后续阶段：

```bash
readany books list --json
readany books search "keyword" --json
readany notes search "keyword" --json
readany epub draft create <book-id> --json
readany epub export <draft-id> --json
```

## 验收边界

第一阶段结束时，不要求：

- 支持 EPUB 精排写入。
- 支持导出 EPUB。
- 支持同步和备份。
- 支持移动端安装 CLI。

第一阶段必须做到：

- CLI package 存在。
- CLI 能安装和卸载 skill。
- CLI 能启动 readonly MCP。
- 外部 AI 可以发现 ReadAny 工具。
- 只读查询链路跑通。

## Done 的定义

这件事做到“可交付”的最低线是：

1. CLI 独立 package 可安装、可卸载。
2. MCP server 可对外提供只读访问。
3. 至少一组 draft 写入工具可用。
4. 至少一组导出工具可用。
5. skill 可装到通用 agent 目录。
6. 桌面客户端能管理 CLI 和 skill。
7. 全部核心路径都有测试。

做到“完整可用”的线是：

1. 读、搜、整理、精排、导出闭环跑通。
2. 权限 profile 可以切换。
3. 审计日志可追踪。
4. macOS / Windows / Linux 三端安装体验都稳定。
