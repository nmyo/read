# ReadAny CLI Command and Tool Spec

## CLI 命令

命令分为三类：

- 已实现：可以写入 README、help、测试和用户文档。
- 规划中：只写在设计文档，不进入 CLI help 和 MCP `tools/list`。
- 禁止类：不设计、不实现，例如任意 shell、任意 SQL。

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

已实现：

```bash
readany tools list [--json]
readany books list [--limit 50] [--json]
readany books search <query> [--json]
readany book get <book-id> [--json]
readany chapters list <book-id> [--json]
readany chapter get <book-id> <chapter-id> [--json]
readany notes search <query> [--book <book-id>] [--json]
readany highlights search <query> [--book <book-id>] [--json]
readany bookmarks list <book-id> [--json]
readany skills list [--json]
readany rag search <query> --book <book-id> [--mode bm25] [--limit 5] [--json]
```

当前 `chapters.*` 基于 indexed chunks 返回章节视图；原始 EPUB/PDF fallback 章节解析仍属于后续能力。

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

当前 `tools/list` 只允许返回：

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

`epub.*` 接入真实实现前只能保留在设计文档里。`chapters.*` 当前只开放 indexed chunks 视图；原始 EPUB/PDF fallback 解析后续接入。`rag.search` 当前只开放 BM25 over chunks；vector / hybrid 模式在 embedding 服务和测试补齐前不能注册。

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

MCP `tools/call` 返回 MCP content：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"data\":{}}"
    }
  ],
  "isError": false
}
```

其中 `text` 内容是 ReadAny `CommandResult` JSON。

## Tool Registry

每个 tool 必须声明：

```ts
type ReadAnyTool = {
  name: string;
  description: string;
  scopes: string[];
  risk: "low" | "medium" | "high";
};
```

风险等级：

- `low`：只读。
- `medium`：写 draft、创建笔记、修改知识库。
- `high`：导出、同步、备份、批量修改。

## 第一批 Tool

当前已实现：

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

M2 再做：

```text
chapters.fallback
knowledge.search
```

M3 / M4 再做：

```text
epub.inspect
epub.draft.create
epub.chapter.read
epub.chapter.patch
epub.metadata.patch
epub.toc.rebuild
epub.validate
epub.export
notes.export
knowledge.export
```

不做：

```text
shell.exec
sql.query
filesystem.read.any
filesystem.write.any
sync.run
admin.backup
```

`sync.run` 和 `admin.backup` 不是永远不做，而是不进入默认外部 AI 能力；未来只能放进 `admin` profile，并且必须用户确认。
