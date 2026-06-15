# ReadAny CLI / External AI Access

这组文档定义 ReadAny 的本地 CLI、MCP 服务、Skill 安装器，以及桌面客户端中的外部 AI 访问入口。

目标是把 ReadAny 的本地能力开放给外部 AI，但开放的是受控工具，不是裸数据、裸数据库、任意文件系统或任意 shell。

文档目录：

- [08-execution-guide.md](08-execution-guide.md)
- [01-product-scope.md](01-product-scope.md)
- [02-architecture-security.md](02-architecture-security.md)
- [03-implementation-roadmap.md](03-implementation-roadmap.md)
- [04-testing-acceptance.md](04-testing-acceptance.md)
- [05-command-and-tool-spec.md](05-command-and-tool-spec.md)
- [06-client-settings.md](06-client-settings.md)
- [07-delivery-playbook.md](07-delivery-playbook.md)

## 当前状态

分支：`feat/readany-cli`

已落地的最小能力：

- `packages/cli` 是独立 package。
- CLI 可构建、可测试，并提供 `readany` bin。
- 已支持 `doctor`、`install`、`uninstall`、`skill install/uninstall/status`。
- 已支持只读库查询：书籍、笔记、高亮、书签、skills。
- 已支持 indexed chapter view：基于已有 chunks 索引的 `readany chapters list`、`readany chapter get` 和 MCP `chapters.*`。
- 已支持 BM25 RAG 检索：基于已有 chunks 索引的 `readany rag search --book <book-id>` 和 MCP `rag.search`。
- 已支持 stdio MCP：`initialize`、`tools/list`、`tools/call`。
- MCP 当前只暴露真实实现的只读工具：`books.list`、`books.search`、`books.get`、`chapters.list`、`chapters.get`、`notes.search`、`highlights.search`、`rag.search`。
- 桌面客户端已增加 `设置 -> 外部 AI 访问`，可检测 CLI、运行 doctor、管理 Skill、复制 readonly MCP 配置。

尚未落地的能力不能出现在 MCP `tools/list` 中：

- 原始 EPUB/PDF fallback 章节解析。
- Vector / hybrid RAG 检索。
- EPUB draft/edit/export。
- 随桌面安装包携带并注册 CLI binary。
- 审计日志浏览 UI。
- 审计日志的完整写入链路。

## 设计原则

- 暂不实现任意 shell 执行。
- 暂不开放裸数据库直连给外部 AI。
- 默认只读，写入必须走 draft / profile / confirmation。
- MCP 工具清单必须诚实，只暴露已经真实接线的能力。
- 原始书籍、数据库、同步配置和凭证不会被默认写入或暴露。

## 最终交付线

- 用户安装桌面客户端后，可以通过设置页安装、卸载、修复 CLI。
- CLI 可以独立运行 `doctor`、`mcp serve`、`skill install`、`skill uninstall`。
- 外部 AI 可以通过 MCP 读取书库、内容、笔记和知识库。
- 外部 AI 可以在授权 profile 下创建 draft、修改 draft、导出新文件。
- 所有写入、导出、同步类动作都有权限、确认和审计。

## 本轮文档要回答的问题

1. 我们要做哪些功能。
2. 每个功能该放在哪一层做。
3. 每一阶段怎么实现。
4. 每一阶段怎么测试。
5. 到什么程度算验收通过。

如果只读一份执行文档，先读 [08-execution-guide.md](08-execution-guide.md)。它把功能范围、实现顺序、测试策略、验收证据和完成标准放在一起。
