# ReadAny CLI 总说明与验收线

这是一份给产品、工程、测试和外部 AI 都能共用的总说明。

它回答五个问题：

1. 这件事到底要做什么。
2. 功能要放在哪一层做。
3. 怎么实现。
4. 怎么测试。
5. 到什么程度算完成，什么情况还不能算完成。

如果只读一份文档，先读这一份。

## 1. 目标

ReadAny CLI 不是一个给人类敲命令的小工具，而是 ReadAny 的本地能力网关。

它要把本地书库、笔记、高亮、章节、RAG、EPUB 精排、导出和诊断能力，安全地开放给外部 AI 和高级用户。

核心原则只有一句话：

> 开放能力，不开放裸数据库、任意文件系统、任意 shell。

## 2. 我们需要什么功能

### 2.1 CLI 基础

- `readany --version`
- `readany doctor --json`
- `readany install`
- `readany uninstall`
- `readany tools list --json`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status --json`

### 2.2 只读数据

- 书籍列表、搜索、详情
- 笔记搜索
- 高亮搜索
- 书签
- skills
- 章节目录和章节内容
- RAG 检索

章节读取要支持：

- indexed chunks 优先
- 未索引 EPUB fallback 到 spine / manifest
- 未索引 PDF fallback 到 page text

### 2.3 外部 AI 入口

- `readany mcp serve --profile readonly`
- `initialize`
- `tools/list`
- `tools/call`
- 审计日志
- profile 权限控制
- Skill 安装到通用 agent 目录
- readonly MCP 配置复制

### 2.4 EPUB 精排

精排不是一个按钮，而是一组受控能力：

```text
inspect -> draft create -> chapter read -> patch -> metadata patch -> toc rebuild -> diff -> validate -> export
```

AI 可以：

- 修改当前章
- 修改指定章节范围
- 修改全书
- 生成封面、见解、元数据、目录、结构修复建议

用户可以：

- 在 draft 工作区手动改章节
- 改 metadata
- 看 diff
- 看 history
- validate
- export

### 2.5 桌面端入口

- `设置 -> 外部 AI 访问`
- CLI 安装 / 卸载 / 修复
- Skill 安装 / 卸载 / 状态
- readonly MCP 配置复制
- doctor 诊断展示

用户精排入口不放在设置页，而放在：

- 书籍详情页
- draft 工作区

设置页只负责接入和权限管理。

## 3. 怎么做

### 3.1 分层

- `@readany/core` 放真正的领域能力
- `@readany/cli` 放命令入口、权限、协议和安装器
- MCP 放外部 AI 访问面
- Skill 放使用说明和调用模板
- 桌面端放图形化管理入口

### 3.2 实现顺序

#### M1

先做只读外部 AI 入口：

- CLI package
- doctor / install / uninstall
- skill 管理
- books / notes / highlights / bookshelves 只读查询
- indexed chapters
- BM25 RAG
- readonly MCP
- 最小审计

#### M2

再补内容理解能力：

- 未索引 EPUB/PDF fallback
- 当前书 / 当前章 / 选区上下文
- vector / hybrid RAG
- 引用回跳

#### M3

再做精排编辑：

- EPUB inspect
- draft create
- chapter patch
- metadata patch
- toc rebuild
- history / diff
- 用户 draft 编辑入口

#### M4

再做校验和导出：

- validate
- export
- notes export
- knowledge export
- 客户端完整管理入口

#### M5

最后把闭环跑通：

- 读
- 搜
- 整理
- 精排
- 导出
- 审计

## 4. 怎么测试

### 4.1 单元测试

覆盖：

- 命令解析
- profile 解析
- path 解析
- skill 安装路径
- tool schema
- draft 规则

### 4.2 集成测试

覆盖：

- CLI 走 core 能力
- MCP server 启动并响应
- readonly profile 不能写
- editor / publisher profile 只能做各自允许的事
- 测试必须用临时 `READANY_HOME` / `AGENT_HOME`

### 4.3 Smoke 测试

必须有：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
git diff --check
```

MCP smoke：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | readany mcp serve --profile readonly
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | readany mcp serve --profile readonly
```

### 4.4 手工验证

至少要看：

- macOS / Windows / Linux 的安装体验
- 一个外部 agent 是否能发现 ReadAny
- 桌面端是否能管理 CLI / Skill / MCP

## 5. 验收标准

### 5.1 已完成时必须满足

- 外部 AI 能发现 ReadAny
- 外部 AI 能读书库、笔记、高亮、章节、RAG
- 外部 AI 能在授权 profile 下操作 draft
- 用户能在 draft 工作区手动编辑
- 用户能导出新文件
- 所有写入和导出都有权限、确认和审计

### 5.2 不能算完成的情况

- 文档写了工具，但 registry 没有真实实现
- MCP `tools/list` 暴露规划中工具
- readonly profile 能写入或导出
- 测试读写真实用户书库
- patch 直接改原始 EPUB
- export 默认覆盖原文件
- 设置页把“安装 Skill”误导成“已经开放写权限”

## 6. 停止线

做到下面这些，可以先停下来验收：

- CLI package 存在
- readonly MCP 可用
- 只读链路跑通
- draft 链路跑通
- validate / export 跑通
- 桌面端入口清楚
- 测试不依赖真实用户数据

没做到下面这些，不能称为完整：

- 当前书 / 当前章 / 选区上下文资源没有真实接通
- user edit / AI edit 没有共用 draft / history / diff
- export 不可控
- 权限边界不清楚
- tools/list 和实际实现不一致

## 7. 建议的 issue 切法

1. CLI 基础命令和安装器
2. Skill 安装器
3. readonly MCP server 和 tool registry
4. 只读书库、笔记、高亮查询
5. 章节 fallback 和 RAG
6. EPUB inspect 和 draft create
7. EPUB chapter patch / metadata patch
8. EPUB history / diff / toc rebuild
9. EPUB validate / export
10. 桌面设置页
11. 书籍详情和 draft 工作区
12. 审计日志和 profile 管理

## 8. 验收记录

每次 milestone 验收后，都要在 `docs/readany-cli/acceptance/` 下补一份记录。

模板见：[acceptance/TEMPLATE.md](acceptance/TEMPLATE.md)
