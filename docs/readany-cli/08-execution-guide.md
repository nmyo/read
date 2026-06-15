# ReadAny CLI 执行总纲

这份文档把 ReadAny 的外部 AI 访问能力一次讲清楚：

- 我们要做什么。
- 能力放在哪一层做。
- 怎么实现。
- 怎么测试。
- 到什么程度算完成。

如果只读一份文档，就读这一份。

## 1. 这件事的目标

ReadAny CLI 不是给人手敲命令玩的独立小工具，而是 ReadAny 的本地能力网关。

它要把本地书库、笔记、高亮、知识检索、EPUB 精排、导出等能力，安全地开放给外部 AI 和高级用户。

核心原则只有一句话：

> 开放能力，不开放裸数据库、任意文件系统、任意 shell。

## 2. 我们需要什么功能

### 第一类：CLI 自身

- `readany --version`
- `readany doctor`
- `readany install`
- `readany uninstall`
- `readany tools list`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status`

### 第二类：只读数据能力

- 书籍列表和搜索
- 单本书元数据
- 笔记搜索
- 高亮搜索
- 书签列表
- skills 列表

### 第三类：外部 AI 入口

- `readany mcp serve --profile readonly`
- `tools/list`
- `tools/call`
- 审计日志
- profile 权限控制

### 第四类：后续编辑能力

- 章节读取
- RAG 检索
- draft 创建
- 章节 patch
- 元数据 patch
- TOC 重建
- 校验
- 导出

### 第五类：客户端入口

- 桌面端 `设置 -> 外部 AI 访问`
- CLI 安装 / 卸载 / 修复
- Skill 安装 / 卸载
- readonly MCP 配置复制
- doctor 诊断展示

## 3. 这些能力放在哪一层做

### `@readany/core`

放真正的业务能力：

- 数据查询
- RAG
- EPUB 解析
- draft 规则
- 导出规则
- 审计结构

### `@readany/cli`

放命令入口和协议层：

- 参数解析
- profile 解析
- tool registry
- MCP server
- 命令输出格式
- 安装器
- skill 管理
- 审计写入

### 桌面客户端

只做图形化管理，不直接造新能力：

- 调 CLI
- 展示状态
- 复制 MCP 配置
- 处理用户确认

### Skill

只做说明书和调用模板，不存业务数据。

## 4. 推荐实现顺序

### M1

先把外部 AI 的只读入口做稳：

- CLI package
- doctor
- install / uninstall
- skill 管理
- books / notes / highlights / bookmarks / skills 查询
- readonly MCP
- 审计日志最小闭环

### M2

再补内容理解能力：

- chapters list
- chapter get
- rag search

### M3

再做精排编辑：

- epub inspect
- draft create
- chapter patch
- metadata patch
- toc rebuild

### M4

再做导出和客户端整合：

- validate
- export
- 设置页完整管理入口
- profile 切换

### M5

最后做完整闭环：

- 读
- 搜
- 整理
- 精排
- 导出
- 审计

## 5. 怎么实现

### 实现原则

- 先有 core，再有 CLI。
- 先有真实能力，再进 registry。
- 先有测试，再放到 `tools/list`。
- 默认只读。
- 写操作必须落到 draft。
- 未实现工具绝不提前注册。

### 命令实现方式

每个命令都走同一条链路：

```text
CLI 参数 -> 命令分发 -> data / service 层 -> core -> 结构化结果
```

### MCP 实现方式

MCP 只做三件事：

- 返回工具列表
- 校验 profile
- 调用已经真实实现的能力

### Skill 实现方式

Skill 只负责告诉外部 AI：

- 读什么
- 怎么读
- 能做什么
- 不能做什么
- 该怎么调用 MCP 或 CLI

### 客户端实现方式

设置页不要复制业务逻辑，只调用 CLI：

- `readany doctor --json`
- `readany skill install`
- `readany skill uninstall`
- `readany mcp serve --profile readonly`

## 6. 怎么测试

### 单元测试

测这些：

- 命令解析
- profile 解析
- path 解析
- tool registry
- skill 安装
- MCP 权限拒绝

### 集成测试

测这些：

- CLI 是否能读临时库
- MCP 是否能列出真实工具
- MCP 是否只返回已实现工具
- readonly profile 是否会拒绝写操作

### E2E 测试

测这些：

- 安装
- 卸载
- doctor
- skill 管理
- MCP 启动
- 只读查询

### 手工验收

测这些：

- 桌面端设置页
- 外部 AI 客户端接入
- Mac / Windows / Linux 的基本行为

### 测试硬要求

- 必须使用临时 `READANY_HOME`
- 必须使用临时 `AGENT_HOME`
- 不能读写开发者真实书库
- 不能把规划中的工具写进 `tools/list`

## 7. 怎么验收

### M1 验收

满足下面这些就算 M1 通过：

- `readany --version`
- `readany doctor --json`
- `readany skill status --json`
- `readany tools list --json`
- `readany books list --json`
- `readany books search "keyword" --json`
- `readany notes search "keyword" --json`
- `readany highlights search "keyword" --json`
- `readany mcp serve --profile readonly`
- `tools/list` 只返回真实实现的工具

### M2 验收

- `readany chapters list <book-id> --json`
- `readany chapter get <book-id> <chapter-id> --json`
- `readany rag search "keyword" --json`

### M3 验收

- `readany epub draft create <book-id> --json`
- `readany epub chapter patch ... --json`
- `readany epub metadata patch ... --json`
- `readany epub toc rebuild ... --json`
- 原始 EPUB hash 不变

### M4 验收

- `readany epub validate <draft-id> --json`
- `readany epub export <draft-id> --output <path> --json`
- 桌面端设置页能完整管理 CLI / Skill / MCP

### 完整验收

只有当下面这条闭环跑通，才能说 ReadAny CLI 完整可用：

```text
找书 -> 读内容 -> 读笔记/高亮 -> 检索知识 -> 创建 draft -> 修改 -> 校验 -> 导出 -> 审计
```

## 8. 到什么程度为止

### 现在能对外说什么

- ReadAny 已经有独立 CLI。
- ReadAny 已经有 readonly MCP。
- ReadAny 已经能让外部 AI 读书库、笔记、高亮。
- ReadAny 已经有桌面端外部 AI 访问入口。

### 现在不能对外说什么

- 不能说已经支持 EPUB 精排写入。
- 不能说已经支持导出闭环。
- 不能说已经开放章节正文和 RAG。
- 不能说 MCP 已经暴露全部计划中的工具。

### 完成标准

只有同时满足下面这些，才算这条线完成：

- 文档、代码、测试口径一致
- `tools/list` 只展示真实工具
- 默认只读
- 写操作都在 draft 上
- 测试全隔离
- 桌面端可管理
- 外部 AI 可安全接入

