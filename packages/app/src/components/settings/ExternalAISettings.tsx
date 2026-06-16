import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getPlatformService } from "@readany/core/services";
import { invoke } from "@tauri-apps/api/core";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  FileCheck2,
  History,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CliAction =
  | "version"
  | "install"
  | "uninstall"
  | "doctor"
  | "mcp_config"
  | "tools_list"
  | "audit_list"
  | "skill_status"
  | "skill_install"
  | "skill_update"
  | "skill_uninstall";

type CliRunResult = {
  ok: boolean;
  action: string;
  command: string;
  command_source?: string;
  args: string[];
  status?: number | null;
  stdout: string;
  stderr: string;
};

type CliRunOptions = {
  mcpProfile?: McpProfile;
  mcpClient?: McpClient;
  auditSource?: "cli" | "mcp";
  auditFailedOnly?: boolean;
  auditActionPrefix?: string;
  auditDate?: string;
  auditLimit?: number;
};

type McpProfile = "readonly" | "editor" | "publisher";
type McpClient = "generic" | "codex" | "claude" | "cursor";

type CommandResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type DoctorReport = {
  version: string;
  profile: string;
  tools: { count: number };
  mcp?: {
    defaultProfile: string;
    serveArgs: string[];
    supportedProfiles: string[];
    supportedClients: string[];
    toolCount: number;
  };
  checks: Array<{ name: string; ok: boolean; message: string }>;
};

type SkillStatus = {
  installed: boolean;
  path: string;
  version?: string;
};

type AuditEntry = {
  timestamp: string;
  source: "cli" | "mcp";
  action: string;
  profile?: string;
  ok: boolean;
  code?: string;
};

type AuditList = {
  entries: AuditEntry[];
  limit: number;
};

const PROFILE_DESCRIPTIONS: Record<McpProfile, string> = {
  readonly: "只读访问：书库、章节、笔记、高亮、RAG、审计读取。",
  editor: "编辑访问：包含 readonly，并允许创建 EPUB draft 和修改 draft 内容。",
  publisher: "发布访问：包含 editor，并允许 validate / export / notes export / knowledge export。",
};

const MCP_CLIENT_LABELS: Record<McpClient, string> = {
  generic: "通用 JSON",
  codex: "Codex TOML",
  claude: "Claude Desktop",
  cursor: "Cursor",
};

function createMcpConfig(profile: McpProfile, client: McpClient) {
  if (client === "codex") {
    return [
      "[mcp_servers.readany]",
      'command = "readany"',
      `args = ["mcp","serve","--profile","${profile}"]`,
    ].join("\n");
  }

  return JSON.stringify(
    {
      mcpServers: {
        readany: {
          command: "readany",
          args: ["mcp", "serve", "--profile", profile],
        },
      },
    },
    null,
    2,
  );
}

function parseCliJson<T>(result?: CliRunResult): CommandResult<T> | undefined {
  if (!result) return undefined;
  const text = result.stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as CommandResult<T>;
  } catch {
    return undefined;
  }
}

function statusLabel(ok: boolean, yes: string, no: string) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ok ? yes : no}
    </span>
  );
}

function outputSummary(result?: CliRunResult, parsed?: CommandResult) {
  if (!result) return "尚未运行。";
  if (parsed?.ok === false) return parsed.error.message;
  if (result.ok) return "命令执行成功。";
  return result.stderr.trim() || result.stdout.trim() || `命令退出码 ${result.status ?? "unknown"}`;
}

export function ExternalAISettings() {
  const [loadingAction, setLoadingAction] = useState<CliAction | null>(null);
  const [versionResult, setVersionResult] = useState<CliRunResult>();
  const [doctorResult, setDoctorResult] = useState<CliRunResult>();
  const [skillResult, setSkillResult] = useState<CliRunResult>();
  const [toolsResult, setToolsResult] = useState<CliRunResult>();
  const [auditResult, setAuditResult] = useState<CliRunResult>();
  const [lastActionResult, setLastActionResult] = useState<CliRunResult>();
  const [copied, setCopied] = useState(false);
  const [auditSource, setAuditSource] = useState<"all" | "cli" | "mcp">("all");
  const [auditStatus, setAuditStatus] = useState<"all" | "failed">("all");
  const [auditActionPrefix, setAuditActionPrefix] = useState("");
  const [auditDate, setAuditDate] = useState("");
  const [auditLimit, setAuditLimit] = useState("8");
  const [mcpProfile, setMcpProfile] = useState<McpProfile>("readonly");
  const [mcpClient, setMcpClient] = useState<McpClient>("generic");
  const [profileRiskConfirmed, setProfileRiskConfirmed] = useState(false);

  const doctor = useMemo(() => parseCliJson<DoctorReport>(doctorResult), [doctorResult]);
  const skill = useMemo(() => parseCliJson<SkillStatus>(skillResult), [skillResult]);
  const tools = useMemo(
    () => parseCliJson<{ tools: Array<{ name: string; risk: string }> }>(toolsResult),
    [toolsResult],
  );
  const audit = useMemo(() => parseCliJson<{ audit: AuditList }>(auditResult), [auditResult]);

  const cliAvailable = Boolean(versionResult?.ok);
  const cliVersion = versionResult?.ok ? versionResult.stdout.trim() : "";
  const skillInstalled = skill?.ok ? skill.data.installed : false;
  const readonlyToolNames = tools?.ok ? tools.data.tools.map((tool) => tool.name) : [];
  const auditOptions = useMemo<CliRunOptions>(
    () => ({
      auditSource: auditSource === "all" ? undefined : auditSource,
      auditFailedOnly: auditStatus === "failed",
      auditActionPrefix: auditActionPrefix.trim() || undefined,
      auditDate: auditDate || undefined,
      auditLimit: Math.min(50, Math.max(1, Number.parseInt(auditLimit, 10) || 8)),
    }),
    [auditActionPrefix, auditDate, auditLimit, auditSource, auditStatus],
  );
  const failedAuditEntries = audit?.ok
    ? audit.data.audit.entries.filter((entry) => !entry.ok)
    : [];
  const needsProfileConfirmation = mcpProfile !== "readonly";
  const canCopyMcpConfig = cliAvailable && (!needsProfileConfirmation || profileRiskConfirmed);
  const mcpConfig = useMemo(() => createMcpConfig(mcpProfile, mcpClient), [mcpClient, mcpProfile]);

  async function runCli(action: CliAction, options?: CliRunOptions) {
    setLoadingAction(action);
    try {
      const result = await invoke<CliRunResult>("readany_cli_run", {
        action,
        options: options ?? null,
      });
      setLastActionResult(result);
      if (action === "version") setVersionResult(result);
      if (action === "doctor") setDoctorResult(result);
      if (action === "tools_list") setToolsResult(result);
      if (action === "audit_list") setAuditResult(result);
      if (action.startsWith("skill_")) setSkillResult(result);
      return result;
    } catch (error) {
      const failed: CliRunResult = {
        ok: false,
        action,
        command: "readany",
        args: [],
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        command_source: "unknown",
      };
      setLastActionResult(failed);
      if (action === "version") setVersionResult(failed);
      if (action === "doctor") setDoctorResult(failed);
      if (action === "tools_list") setToolsResult(failed);
      if (action === "audit_list") setAuditResult(failed);
      if (action.startsWith("skill_")) setSkillResult(failed);
      return failed;
    } finally {
      setLoadingAction(null);
    }
  }

  async function refreshAll() {
    await runCli("version");
    await runCli("doctor");
    await runCli("skill_status");
    await runCli("tools_list");
    await runCli("audit_list", auditOptions);
  }

  async function handleSkillInstall() {
    await runCli("skill_install");
    await runCli("skill_status");
    await runCli("doctor");
  }

  async function handleSkillUpdate() {
    await runCli("skill_update");
    await runCli("skill_status");
    await runCli("doctor");
  }

  async function handleCliInstall() {
    await runCli("install");
    await refreshAll();
  }

  async function handleCliUninstall() {
    await runCli("uninstall");
    await refreshAll();
  }

  async function handleSkillUninstall() {
    await runCli("skill_uninstall");
    await runCli("skill_status");
    await runCli("doctor");
  }

  async function copyMcpConfig() {
    if (!canCopyMcpConfig) return;
    const result = await runCli("mcp_config", { mcpProfile, mcpClient });
    const parsed = parseCliJson<{
      client: McpClient;
      format: "json" | "toml";
      snippet?: string;
      mcpServers?: { readany: { command: string; args: string[] } };
    }>(result);
    const config = parsed?.ok
      ? parsed.data.snippet ?? JSON.stringify(parsed.data, null, 2)
      : mcpConfig;
    await getPlatformService().copyToClipboard(config);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function handleMcpProfileChange(value: string) {
    const nextProfile = value as McpProfile;
    setMcpProfile(nextProfile);
    setCopied(false);
    if (nextProfile === "readonly") {
      setProfileRiskConfirmed(false);
    }
  }

  function handleMcpClientChange(value: string) {
    setMcpClient(value as McpClient);
    setCopied(false);
  }

  async function refreshAudit() {
    await runCli("audit_list", auditOptions);
  }

  async function resetAuditFilters() {
    setAuditSource("all");
    setAuditStatus("all");
    setAuditActionPrefix("");
    setAuditDate("");
    setAuditLimit("8");
    await runCli("audit_list", { auditLimit: 8 });
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  const busy = loadingAction !== null;

  return (
    <div className="space-y-4 p-4 pt-3">
      <section className="rounded-lg bg-muted/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">ReadAny CLI</h2>
              {statusLabel(cliAvailable, "可用", "未检测到")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              桌面端通过受限命令检测 CLI，不开放任意 shell。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={refreshAll} disabled={busy}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            诊断
          </Button>
          <Button size="sm" variant="outline" onClick={handleCliInstall} disabled={busy}>
            安装
          </Button>
          <Button size="sm" variant="outline" onClick={handleCliUninstall} disabled={busy}>
            卸载
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">版本</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {cliVersion || "未安装或 PATH 不可用"}
            </p>
          </div>
          <div className="rounded-md bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Profile</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {doctor?.ok ? doctor.data.profile : "readonly"}
            </p>
          </div>
          <div className="rounded-md bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Tools</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {doctor?.ok ? doctor.data.tools.count : readonlyToolNames.length || "-"}
            </p>
          </div>
        </div>
        <div className="mt-2 rounded-md bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">执行来源</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {lastActionResult?.command_source ??
              versionResult?.command_source ??
              doctorResult?.command_source ??
              "尚未检测"}
            {lastActionResult?.command
              ? ` · ${lastActionResult.command}`
              : versionResult?.command
                ? ` · ${versionResult.command}`
                : ""}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          {doctor?.ok
            ? doctor.data.checks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-start justify-between gap-3 rounded-md bg-background px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-xs text-foreground">{check.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p>
                  </div>
                  {statusLabel(check.ok, "通过", "失败")}
                </div>
              ))
            : null}
          {!doctor?.ok && (
            <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
              {outputSummary(doctorResult, doctor)}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg bg-muted/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">External AI Skill</h2>
              {statusLabel(skillInstalled, "已安装", "未安装")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Skill 安装到通用 agent 目录，只提供使用说明，不保存书库数据或密钥。
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSkillInstall} disabled={busy}>
              安装
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSkillUpdate}
              disabled={busy || !skillInstalled}
            >
              更新
            </Button>
            <Button size="sm" variant="outline" onClick={handleSkillUninstall} disabled={busy}>
              卸载
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-md bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">安装位置</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {skill?.ok ? skill.data.path : outputSummary(skillResult, skill)}
          </p>
        </div>
      </section>

      <section className="rounded-lg bg-muted/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">MCP access profile</h2>
              {statusLabel(canCopyMcpConfig, "可配置", "等待确认")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              默认 readonly。editor / publisher 需要用户显式确认，安装 CLI 或 Skill 不等于授权写入。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={copyMcpConfig} disabled={!canCopyMcpConfig}>
            <Clipboard className="mr-1.5 h-3.5 w-3.5" />
            {copied ? "已复制" : "复制配置"}
          </Button>
        </div>

        <div className="mt-3 grid gap-3 rounded-md bg-background p-3 md:grid-cols-[minmax(9rem,12rem)_minmax(9rem,12rem)_minmax(0,1fr)]">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Profile</p>
            <Select value={mcpProfile} onValueChange={handleMcpProfileChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="readonly">readonly</SelectItem>
                <SelectItem value="editor">editor</SelectItem>
                <SelectItem value="publisher">publisher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Client</p>
            <Select value={mcpClient} onValueChange={handleMcpClientChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">{MCP_CLIENT_LABELS.generic}</SelectItem>
                <SelectItem value="codex">{MCP_CLIENT_LABELS.codex}</SelectItem>
                <SelectItem value="claude">{MCP_CLIENT_LABELS.claude}</SelectItem>
                <SelectItem value="cursor">{MCP_CLIENT_LABELS.cursor}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {PROFILE_DESCRIPTIONS[mcpProfile]} 当前复制 {MCP_CLIENT_LABELS[mcpClient]} 模板。
            </p>
            {needsProfileConfirmation ? (
              <label className="mt-2 flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2">
                <Switch
                  checked={profileRiskConfirmed}
                  onCheckedChange={setProfileRiskConfirmed}
                />
                <span className="text-xs text-muted-foreground">
                  我确认该 profile 会允许外部 AI 调用 draft 写入或导出类工具；原书仍不会被覆盖，导出默认生成新文件。
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">
          {mcpConfig}
        </pre>

        <div className="mt-3 rounded-md bg-background px-3 py-2">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">当前 MCP 工具</p>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {readonlyToolNames.length > 0 ? readonlyToolNames.join(", ") : "运行诊断后显示。"}
          </p>
        </div>
      </section>

      <section className="rounded-lg bg-muted/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">最近审计</h2>
              {statusLabel(audit?.ok === true, "可读取", "等待日志")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              只显示 CLI/MCP 调用元数据，不显示工具参数、正文、密钥或同步凭证。
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshAudit()}
            disabled={busy}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loadingAction === "audit_list" ? "animate-spin" : ""}`}
            />
            刷新
          </Button>
        </div>

        <div className="mt-3 rounded-md bg-background p-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">筛选</p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_minmax(8rem,1fr)_minmax(9rem,1.1fr)_minmax(5rem,0.6fr)_auto]">
            <Select value={auditSource} onValueChange={(value) => setAuditSource(value as typeof auditSource)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="cli">CLI</SelectItem>
                <SelectItem value="mcp">MCP</SelectItem>
              </SelectContent>
            </Select>
            <Select value={auditStatus} onValueChange={(value) => setAuditStatus(value as typeof auditStatus)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结果</SelectItem>
                <SelectItem value="failed">仅失败</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs"
              placeholder="action prefix"
              value={auditActionPrefix}
              onChange={(event) => setAuditActionPrefix(event.target.value)}
            />
            <Input
              className="h-8 text-xs"
              type="date"
              value={auditDate}
              onChange={(event) => setAuditDate(event.target.value)}
            />
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              min={1}
              max={50}
              type="number"
              value={auditLimit}
              onChange={(event) => setAuditLimit(event.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void refreshAudit()} disabled={busy}>
                应用
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void resetAuditFilters()} disabled={busy}>
                重置
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {audit?.ok && audit.data.audit.entries.length > 0
            ? audit.data.audit.entries.map((entry) => (
                <div
                  key={`${entry.timestamp}-${entry.source}-${entry.action}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{entry.action}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {entry.timestamp} · {entry.source}
                      {entry.profile ? ` · ${entry.profile}` : ""}
                      {entry.code ? ` · ${entry.code}` : ""}
                    </p>
                    {!entry.ok ? (
                      <p className="mt-1 truncate text-[11px] text-destructive">
                        失败详情：{entry.code || "未返回错误码"}
                      </p>
                    ) : null}
                  </div>
                  {statusLabel(entry.ok, "成功", "失败")}
                </div>
              ))
            : null}
          {audit?.ok && audit.data.audit.entries.length === 0 ? (
            <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
              暂无审计记录。
            </p>
          ) : null}
          {!audit?.ok ? (
            <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
              {outputSummary(auditResult, audit)}
            </p>
          ) : null}
        </div>
        {audit?.ok && failedAuditEntries.length > 0 ? (
          <div className="mt-3 rounded-md bg-background px-3 py-2">
            <p className="text-xs font-medium text-foreground">失败详情</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {failedAuditEntries
                .map((entry) => `${entry.action}: ${entry.code || "unknown_error"}`)
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
