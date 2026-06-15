# ReadAny CLI Client Settings

## 入口位置

桌面客户端新增：

```text
设置 -> 外部 AI 访问
```

移动端不作为主入口。移动端后续可以查看状态或确认高风险操作，但不负责安装 CLI、启动 MCP、安装 skill。

## 页面职责

设置页负责图形化管理：

- CLI 安装状态。
- Skill 安装状态。
- MCP 可用状态。
- 当前权限 profile。
- 最近 doctor 结果。
- 最近 agent 操作记录。

设置页不直接实现底层安装逻辑，而是调用 CLI 自身能力：

```bash
readany install
readany uninstall
readany doctor --json
readany skill install
readany skill uninstall
readany skill status --json
```

## 状态卡片

建议分成四块：

### 1. ReadAny CLI

状态：

- 未安装。
- 已安装。
- 版本不匹配。
- PATH 不可用。
- 需要修复。

操作：

- 安装。
- 卸载。
- 修复。
- 诊断。

### 2. External AI Skill

状态：

- 未安装。
- 已安装。
- 需要更新。

操作：

- 安装到通用 agent 目录。
- 卸载。
- 更新。
- 打开所在目录。

### 3. MCP Access

状态：

- 未启用。
- readonly 可用。
- profile 已配置。

操作：

- 复制 MCP 配置。
- 测试连接。
- 切换 profile。

### 4. Activity Log

展示最近：

- Agent 调用。
- 写入 draft。
- 导出。
- 失败。
- 权限拒绝。

## 权限文案

设置页必须清楚区分：

```text
安装 CLI 不等于授权外部 AI。
安装 Skill 不等于开放写权限。
开启 MCP readonly 只允许读取和搜索。
写入、导出、同步需要更高 profile。
```

## 第一阶段客户端验收

第一阶段设置页只需要：

- 能检测 CLI。
- 能安装 / 卸载 skill。
- 能展示 readonly MCP 启动命令。
- 能复制 MCP 配置。
- 能跑 `doctor --json` 并展示结果。

第一阶段不需要：

- 常驻 daemon。
- 后台自动启动 MCP。
- 移动端管理页。
- 高风险操作远程确认。
