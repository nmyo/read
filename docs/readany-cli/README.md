# ReadAny CLI / External AI Access Design

这组文档用于定义 ReadAny 的 `readany cli`、本地 `MCP` 服务、`skill` 安装器，以及外部 AI 访问能力的产品与工程边界。

目标不是先写实现，而是先把下面几件事定清楚：

1. ReadAny CLI 要对外开放什么能力。
2. 哪些能力可以给外部 AI，哪些必须收口。
3. CLI、MCP、Skill、客户端设置页各自承担什么职责。
4. 怎么安装、怎么卸载、怎么测试、怎么验收。

文档目录：

- [01-product-scope.md](01-product-scope.md)
- [02-architecture-security.md](02-architecture-security.md)
- [03-implementation-roadmap.md](03-implementation-roadmap.md)
- [04-testing-acceptance.md](04-testing-acceptance.md)
- [05-command-and-tool-spec.md](05-command-and-tool-spec.md)
- [06-client-settings.md](06-client-settings.md)

当前约束：

- 暂不实现任意 shell 执行。
- 暂不开放裸数据库直连给外部 AI。
- 默认只读，写入必须走 draft / profile / confirmation。
- 先把 CLI、MCP、Skill 的边界冻结，再进入代码。

最终交付线：

- 用户安装桌面客户端后，可以通过设置页安装、卸载、修复 CLI。
- CLI 可以独立运行 `doctor`、`mcp serve`、`skill install`、`skill uninstall`。
- 外部 AI 可以通过 MCP 读取书库、内容、笔记和知识库。
- 外部 AI 可以在授权 profile 下创建 draft、修改 draft、导出新文件。
- 原始书籍、数据库、同步配置和凭证不会被默认写入或暴露。
