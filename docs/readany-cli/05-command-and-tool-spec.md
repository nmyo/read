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
readany chapter get <book-id> <chapter-id> [--chunk-start 1] [--chunk-count 20] [--limit 12000] [--json]
readany notes search <query> [--book <book-id>] [--json]
readany highlights search <query> [--book <book-id>] [--json]
readany bookmarks list <book-id> [--json]
readany skills list [--json]
readany rag search <query> --book <book-id> [--mode bm25] [--limit 5] [--json]
readany epub inspect <book-id> [--profile editor] [--json]
readany epub draft create <book-id> [--profile editor] [--json]
readany epub chapter read <draft-id> <chapter-id> [--profile editor] [--limit 12000] [--json]
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> [--profile editor] [--json]
readany epub metadata patch <draft-id> --patch <file> [--profile editor] [--json]
readany epub toc rebuild <draft-id> [--profile editor] [--json]
readany epub history <draft-id> [--profile editor] [--json]
readany epub diff <draft-id> [--profile editor] [--json]
readany epub validate <draft-id> [--profile publisher] [--json]
readany epub export <draft-id> --output <path> [--profile publisher] [--overwrite] [--json]
```

当前 `chapters.*` 优先基于 indexed chunks 返回章节视图；没有 chunks 且书籍是 EPUB 时，会 fallback 到真实 EPUB spine/manifest。indexed 章节支持 chunk range 和 content limit；EPUB fallback 章节支持 content limit，避免一次返回超大正文。`epub inspect` 是只读结构检查，需要 `editor` profile 或更高权限；`epub draft create` 只复制原 EPUB 到受控 draft workspace，写入 manifest/history，不修改章节、不导出文件；`epub chapter read` 只读取 draft 章节文本。PDF fallback 章节解析仍属于后续能力。

### Draft 编辑命令

已实现：

```bash
readany epub draft create <book-id> [--profile editor] [--json]
readany epub chapter read <draft-id> <chapter-id> [--profile editor] [--limit 12000] [--json]
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> [--profile editor] [--json]
readany epub metadata patch <draft-id> --patch <file> [--profile editor] [--json]
readany epub toc rebuild <draft-id> [--profile editor] [--json]
readany epub history <draft-id> [--profile editor] [--json]
readany epub diff <draft-id> [--profile editor] [--json]
readany epub validate <draft-id> [--profile publisher] [--json]
readany epub export <draft-id> --output <path> [--profile publisher] [--overwrite] [--json]
```

后续阶段支持：

```bash
readany epub undo <draft-id> <operation-id> [--json]
```

补充约定：

- `epub.chapter.patch` 只修改 draft 中的单个章节资源，不能直接改原始书文件。
- `epub.metadata.patch` 只修改 draft 中的 metadata。
- `epub.toc.rebuild` 只修改 draft 中的 EPUB3 nav 目录，基于 spine XHTML 章节生成一级目录。
- `epub.history` 只读取 draft 的 operation history，不修改文件。
- `epub.diff` 只比较 source/draft EPUB entry 的 hash 和 size，不返回完整正文。
- `epub.validate` 只做结构和引用校验，不自动修改内容。
- `epub.export` 默认生成新文件，不覆盖源 EPUB。
- 用户编辑入口和 AI 编辑入口使用同一套 draft/history/diff。
- 用户编辑入口应该在书籍详情或 draft 工作区；AI 编辑入口通过 MCP / CLI tool 调用。

## MCP Tool 命名

Tool 命名使用资源域前缀：

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
notes.export
highlights.search
knowledge.search
rag.search
audit.list
epub.inspect
epub.draft.create
epub.chapter.patch
epub.metadata.patch
epub.toc.rebuild
epub.history
epub.diff
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
notes.export
highlights.search
rag.search
audit.list
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

`audit.list` 当前已经可用，但它只读取最近 CLI/MCP 审计元数据，不返回工具参数正文、密钥或大内容。`notes.export` 当前已经可用，但它只导出单本书 notes/highlights 文件，默认不覆盖已有文件，也不把完整导出内容塞进 MCP 响应。`epub.inspect` 当前已经可用，但它只是只读结构检查。`epub.draft.create` 当前已经可用，但它只创建受控 draft workspace。`epub.draft.discard` 当前已经可用，但它只标记 draft inactive。`epub.chapter.read` 当前已经可用，但它只读取 draft XHTML 章节文本。`epub.chapter.patch` 当前已经可用，但它只替换 draft 内单个 XHTML 章节资源。`epub.metadata.patch` 当前已经可用，但它只修改 draft OPF metadata。`epub.toc.rebuild` 当前已经可用，但它只重建 EPUB3 nav 目录。`epub.history` 当前已经可用，但它只读取 draft operation history。`epub.diff` 当前已经可用，但它只比较 source/draft EPUB entry 的 hash 和 size，不返回完整正文、不执行 undo。`epub.validate` 当前已经可用，但它只校验 active draft 的结构和引用，不自动修改。`epub.export` 当前已经可用，但它只在 validate 通过后导出新 EPUB，默认不覆盖已有文件、不覆盖源 EPUB。其余 `epub.*` 写入工具接入真实实现前只能保留在设计文档里。`chapters.*` 当前已支持 indexed chunks 优先和未索引 EPUB fallback；PDF fallback 解析后续接入。`rag.search` 当前只开放 BM25 over chunks；vector / hybrid 模式在 embedding 服务和测试补齐前不能注册。

未来补齐时，`tools/list` 仍然要遵循一个原则：先完成真实实现、权限、测试和文档，再把工具放进列表。不能为了“让 AI 知道能力存在”而提前注册。

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
notes.export
highlights.search
rag.search
audit.list
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

M2 再做：

```text
chapters.list/get PDF fallback coverage
knowledge.search
```

M3 / M4 再做：

```text
knowledge.export
```

用户精排入口不在 MCP tool list 里，它在客户端 UI 和 draft 工作区里；MCP 只负责让外部 AI 通过受控工具修改 draft。

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
