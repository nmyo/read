# ReadAny CLI Command and Tool Spec

## CLI 命令

### 基础命令

```bash
readany --version
readany doctor [--json]
readany install [--global | --user]
readany uninstall [--global | --user]
```

`install` 和 `uninstall` 用于安装或卸载全局 CLI shim。客户端随包携带 CLI binary，但全局命令由 CLI 自己管理。

### MCP 命令

```bash
readany mcp serve --profile readonly
readany mcp serve --profile assistant
readany mcp serve --profile editor
readany mcp serve --profile publisher
```

默认使用 stdio。第一阶段不要求 daemon。

### Skill 命令

```bash
readany skill install
readany skill uninstall
readany skill status [--json]
readany skill update
```

默认安装到：

```text
$AGENT_HOME/skills/readany
~/.agent/skills/readany
```

### 只读数据命令

```bash
readany books list [--limit 50] [--cursor <cursor>] [--json]
readany books search <query> [--json]
readany book get <book-id> [--json]
readany chapters list <book-id> [--json]
readany chapter get <book-id> <chapter-id> [--json]
readany notes search <query> [--book <book-id>] [--json]
readany highlights search <query> [--book <book-id>] [--json]
```

### Draft 和导出命令

后续阶段支持：

```bash
readany epub inspect <book-id> [--json]
readany epub draft create <book-id> [--json]
readany epub chapter patch <draft-id> <chapter-id> --patch <file>
readany epub metadata patch <draft-id> --patch <file>
readany epub validate <draft-id> [--json]
readany epub export <draft-id> --output <path> [--json]
```

## MCP Tool 命名

Tool 命名使用资源域前缀：

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
highlights.search
knowledge.search
rag.search
epub.inspect
epub.draft.create
epub.chapter.patch
epub.metadata.patch
epub.validate
epub.export
```

## Tool 输出规则

所有工具输出都必须：

- 可 JSON 序列化。
- 明确 success / error。
- 大结果分页。
- 不输出敏感配置。
- 不默认输出超大正文。

建议响应结构：

```ts
type ToolResult<T> = {
  ok: true;
  data: T;
  cursor?: string;
  warnings?: string[];
} | {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

## Tool Registry

每个 tool 必须声明：

```ts
type ReadAnyTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  scopes: string[];
  risk: "low" | "medium" | "high";
};
```

风险等级：

- `low`：只读。
- `medium`：写 draft、创建笔记、修改知识库。
- `high`：导出、同步、备份、批量修改。

## 第一批 Tool

第一阶段只做：

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
highlights.search
rag.search
```

第一阶段不做：

```text
epub.chapter.patch
epub.export
sync.run
admin.backup
```
