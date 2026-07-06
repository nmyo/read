import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileCheck2,
  History,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

type CliAction =
  | "version"
  | "install"
  | "repair"
  | "uninstall"
  | "agent_setup"
  | "agent_uninstall"
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
  mcpClient?: AgentSetupClient;
  auditSource?: "cli" | "mcp";
  auditFailedOnly?: boolean;
  auditActionPrefix?: string;
  auditDate?: string;
  auditLimit?: number;
};

type McpProfile = "readonly" | "editor" | "publisher";
type McpClient = "generic" | "codex" | "claude" | "cursor" | "opencode";
type AgentSetupClient = McpClient | "all";

type CommandResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type DoctorReport = {
  version: string;
  profile: string;
  runtime?: {
    node: string;
    executable: string;
    nativeSqliteAvailable: boolean;
    nativeSqlitePath?: string;
  };
  distribution?: {
    kind: string;
    usesNodeRuntime: boolean;
    nativeBinary: boolean;
    entrypoint?: string;
    modulePath: string;
    bundleRoot?: string;
    builtBundle: boolean;
    desktopResourceBundle: boolean;
  };
  tools: { count: number };
  mcp?: {
    defaultProfile: string;
    serveArgs: string[];
    supportedProfiles: string[];
    supportedClients: string[];
    toolCount: number;
  };
  agentAccess?: {
    cliShim: {
      path: string;
      installed: boolean;
      target?: string;
      managed: boolean;
    };
    skill: {
      installed: boolean;
      path: string;
      version?: string;
    };
    clientSkills: Array<{
      client: "agents" | McpClient;
      path: string;
      installed: boolean;
      managed: boolean;
      target?: string;
    }>;
    mcpConfigs: Array<{
      client: McpClient;
      path: string;
      configured: boolean;
      checked: boolean;
    }>;
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

type AgentSetupData = {
  setup: true;
  command: string;
  install: { installed: true; path: string; target: string; mode: "user" | "global" };
  skill: {
    installed?: true;
    updated?: true;
    path: string;
    version: string;
    previousVersion?: string;
  };
  mcp: { client: McpClient; format: "json" | "toml"; profile: McpProfile; snippet: string };
  mcpConfigs?: Array<{
    client: McpClient;
    format: "json" | "toml";
    profile: McpProfile;
    snippet: string;
  }>;
  nextSteps: string[];
};

type AgentUninstallData = {
  uninstalled: true;
  command: string;
  install: { removed: boolean; path: string; mode: "user" | "global" };
  skill: { removed: boolean; path: string };
  nextSteps: string[];
};

const PROFILE_DESCRIPTIONS: Record<McpProfile, string> = {
  readonly: "只读访问：书库、章节、笔记、高亮、RAG、审计读取。",
  editor: "编辑访问：包含 readonly，并允许创建 EPUB draft 和修改 draft 内容。",
  publisher: "发布访问：包含 editor，并允许 validate / export / notes export / knowledge export。",
};

const MCP_CLIENT_LABELS: Record<McpClient, string> = {
  generic: "通用 JSON",
  codex: "Codex TOML",
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
};

const CLIENT_SKILL_LABELS: Record<"agents" | McpClient, string> = {
  agents: "Agents 通用",
  generic: "通用",
  codex: "Codex",
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
};

function createMcpConfig(profile: McpProfile, client: McpClient) {
  if (client === "codex") {
    return [
      "[mcp_servers.readany]",
      'command = "readany"',
      `args = ["mcp","serve","--profile","${profile}"]`,
    ].join("\n");
  }

  if (client === "opencode") {
    return JSON.stringify(
      {
        mcp: {
          readany: {
            type: "local",
            command: ["readany", "mcp", "serve", "--profile", profile],
            enabled: true,
          },
        },
      },
      null,
      2,
    );
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

function createAgentSetupCommand(profile: McpProfile, client: AgentSetupClient) {
  return `readany agent setup --user --client ${client} --profile ${profile} --json`;
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
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${
        ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ok ? yes : no}
    </span>
  );
}

function neutralStatusLabel(label: string) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium leading-none text-muted-foreground">
      <AlertTriangle className="h-3 w-3" />
      {label}
    </span>
  );
}

function outputSummary(result?: CliRunResult, parsed?: CommandResult) {
  if (!result) return "尚未运行。";
  if (parsed?.ok === false) return parsed.error.message;
  if (result.ok) return "命令执行成功。";
  return result.stderr.trim() || result.stdout.trim() || `命令退出码 ${result.status ?? "unknown"}`;
}

function sectionHeader(
  icon: ReactNode,
  title: string,
  status: ReactNode,
  description: string,
  actions?: ReactNode,
) {
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {icon}
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {status}
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function outputPanel(text: string, tone: "default" | "error" = "default") {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs leading-5 ${
        tone === "error"
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-border/60 bg-background text-muted-foreground"
      }`}
    >
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
        {text}
      </pre>
    </div>
  );
}

function evidenceValue(label: string, value: string | number | boolean | undefined, mono = true) {
  const rendered =
    typeof value === "boolean"
      ? value
        ? "true"
        : "false"
      : value === undefined
        ? "-"
        : String(value);
  return (
    <div className="min-w-0 rounded-md border border-border/40 bg-background/70 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate text-xs text-foreground ${mono ? "font-mono" : "font-medium"}`}
        title={rendered}
      >
        {rendered}
      </p>
    </div>
  );
}

function pathText(value: string | undefined) {
  return (
    <p
      className="mt-1 truncate font-mono text-[11px] leading-5 text-muted-foreground"
      title={value}
    >
      {value || "-"}
    </p>
  );
}

function compactStatusItem(label: string, status: ReactNode) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center justify-between gap-3 rounded-md border border-border/40 bg-background/70 px-3 py-2">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      {status}
    </div>
  );
}

function auditSourceLabel(source: AuditEntry["source"]) {
  return source === "mcp" ? "MCP 工具" : "CLI 命令";
}

function formatAuditTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseAuditDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function auditDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAuditDateLabel(value: string) {
  const date = parseAuditDate(value);
  if (!date) return "全部日期";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function auditMetaPill(label: string, tone: "default" | "error" = "default") {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function AuditDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedDate = parseAuditDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = selectedDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const today = new Date();
  const todayKey = auditDateKey(today);
  const selectedKey = selectedDate ? auditDateKey(selectedDate) : "";
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = new Date(year, month, 1 - startOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const monthLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(visibleMonth);

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDate = (date: Date) => {
    onChange(auditDateKey(date));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  };

  const selectToday = () => {
    selectDate(today);
  };

  const clearDate = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between gap-2 px-3 text-xs font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{formatAuditDateLabel(value)}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {value || "all"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <p className="text-sm font-medium text-foreground">{monthLabel}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((date) => {
            const key = auditDateKey(date);
            const inMonth = date.getMonth() === month;
            const selected = key === selectedKey;
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                className={`h-7 rounded-md text-xs transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                      ? "bg-primary/10 text-primary"
                      : inMonth
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground/40 hover:bg-muted/60"
                }`}
                onClick={() => selectDate(date)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={clearDate}
          >
            清空
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={selectToday}
          >
            今天
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function auditDetailValue(label: string, value: string | undefined) {
  return (
    <div className="min-w-0 rounded-md border border-border/40 bg-background/70 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-[11px] leading-5 text-foreground">
        {value || "-"}
      </p>
    </div>
  );
}

export function ExternalAISettings() {
  const [loadingAction, setLoadingAction] = useState<CliAction | null>(null);
  const [versionResult, setVersionResult] = useState<CliRunResult>();
  const [doctorResult, setDoctorResult] = useState<CliRunResult>();
  const [skillResult, setSkillResult] = useState<CliRunResult>();
  const [agentResult, setAgentResult] = useState<CliRunResult>();
  const [toolsResult, setToolsResult] = useState<CliRunResult>();
  const [auditResult, setAuditResult] = useState<CliRunResult>();
  const [lastActionResult, setLastActionResult] = useState<CliRunResult>();
  const [copiedTarget, setCopiedTarget] = useState<
    "agent" | "agentAll" | "mcp" | "evidence" | null
  >(null);
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
  const agentSetup = useMemo(
    () =>
      agentResult?.action === "agent_setup" ? parseCliJson<AgentSetupData>(agentResult) : undefined,
    [agentResult],
  );
  const agentUninstall = useMemo(
    () =>
      agentResult?.action === "agent_uninstall"
        ? parseCliJson<AgentUninstallData>(agentResult)
        : undefined,
    [agentResult],
  );
  const tools = useMemo(
    () => parseCliJson<{ tools: Array<{ name: string; risk: string }> }>(toolsResult),
    [toolsResult],
  );
  const audit = useMemo(() => parseCliJson<{ audit: AuditList }>(auditResult), [auditResult]);

  const cliAvailable = Boolean(versionResult?.ok);
  const cliVersion = versionResult?.ok ? versionResult.stdout.trim() : "";
  const doctorRuntime = doctor?.ok ? doctor.data.runtime : undefined;
  const doctorDistribution = doctor?.ok ? doctor.data.distribution : undefined;
  const skillInstalled = skill?.ok ? skill.data.installed : false;
  const agentAccess = doctor?.ok ? doctor.data.agentAccess : undefined;
  const clientSkillRows = agentAccess?.clientSkills ?? [];
  const mcpConfigRows = agentAccess?.mcpConfigs ?? [];
  const clientSkillReady =
    clientSkillRows.length > 0 && clientSkillRows.every((row) => row.installed && row.managed);
  const mcpConfigsReady = mcpConfigRows.length > 0 && mcpConfigRows.every((row) => row.configured);
  const readyChecks = [
    cliAvailable,
    doctor?.ok === true,
    doctor?.ok ? doctor.data.checks.every((check) => check.ok) : false,
    skillInstalled,
    clientSkillReady,
    mcpConfigsReady,
  ];
  const readyCount = readyChecks.filter(Boolean).length;
  const betaReady = readyCount >= 5;
  const readinessLabel = betaReady ? "Beta 可用" : readyCount >= 3 ? "需要修复" : "未就绪";
  const readonlyToolNames = tools?.ok ? tools.data.tools.map((tool) => tool.name) : [];
  const auditEntries = audit?.ok ? audit.data.audit.entries : [];
  const auditFailureCount = auditEntries.filter((entry) => !entry.ok).length;
  const latestAuditEntry = auditEntries[0];
  const latestAuditLabel = latestAuditEntry
    ? `${formatAuditTime(latestAuditEntry.timestamp)} · ${auditSourceLabel(latestAuditEntry.source)}`
    : "暂无调用";
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
  const needsProfileConfirmation = mcpProfile !== "readonly";
  const canCopyMcpConfig = cliAvailable && (!needsProfileConfirmation || profileRiskConfirmed);
  const mcpConfig = useMemo(() => createMcpConfig(mcpProfile, mcpClient), [mcpClient, mcpProfile]);
  const agentSetupCommand = useMemo(
    () => createAgentSetupCommand(mcpProfile, mcpClient),
    [mcpClient, mcpProfile],
  );
  const allAgentSetupCommand = useMemo(
    () => createAgentSetupCommand(mcpProfile, "all"),
    [mcpProfile],
  );
  const canBootstrapAgent = cliAvailable && (!needsProfileConfirmation || profileRiskConfirmed);
  const evidenceSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          cli: {
            available: cliAvailable,
            version: cliVersion || null,
            source: lastActionResult?.command_source ?? versionResult?.command_source ?? null,
          },
          doctor: doctor?.ok ? doctor.data : null,
          skill: skill?.ok ? skill.data : null,
          agentBootstrap: {
            command: agentSetupCommand,
            allCommand: allAgentSetupCommand,
            lastResult: agentSetup?.ok ? agentSetup.data : null,
          },
          mcp: {
            profile: mcpProfile,
            client: mcpClient,
            config: mcpConfig,
          },
          tools: tools?.ok
            ? tools.data.tools.map((tool) => ({ name: tool.name, risk: tool.risk }))
            : [],
          audit: audit?.ok ? audit.data.audit : null,
          lastAction: lastActionResult
            ? {
                action: lastActionResult.action,
                ok: lastActionResult.ok,
                command: lastActionResult.command,
                command_source: lastActionResult.command_source,
                status: lastActionResult.status,
              }
            : null,
        },
        null,
        2,
      ),
    [
      audit,
      cliAvailable,
      cliVersion,
      doctor,
      lastActionResult,
      agentSetup,
      agentSetupCommand,
      allAgentSetupCommand,
      mcpClient,
      mcpConfig,
      mcpProfile,
      skill,
      tools,
      versionResult?.command_source,
      lastActionResult?.command_source,
    ],
  );

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
      if (action.startsWith("agent_")) setAgentResult(result);
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
      if (action.startsWith("agent_")) setAgentResult(failed);
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

  async function handleCliRepair() {
    await runCli("repair");
    await refreshAll();
  }

  async function handleRepairExternalAccess() {
    await runCli("repair");
    await runCli("agent_setup", { mcpProfile: "readonly", mcpClient: "all" });
    await refreshAll();
  }

  async function handleCliUninstall() {
    await runCli("uninstall");
    await refreshAll();
  }

  async function handleAgentSetup() {
    if (!canBootstrapAgent) return;
    await runCli("agent_setup", { mcpProfile, mcpClient });
    await runCli("skill_status");
    await runCli("doctor");
  }

  async function handleAgentSetupAll() {
    if (!canBootstrapAgent) return;
    await runCli("agent_setup", { mcpProfile, mcpClient: "all" });
    await runCli("skill_status");
    await runCli("doctor");
  }

  async function handleAgentUninstall() {
    await runCli("agent_uninstall");
    await runCli("skill_status");
    await runCli("doctor");
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
      mcp?: { readany: { type: "local"; command: string[]; enabled: boolean } };
    }>(result);
    const config = parsed?.ok
      ? (parsed.data.snippet ?? JSON.stringify(parsed.data, null, 2))
      : mcpConfig;
    await getPlatformService().copyToClipboard(config);
    setCopiedTarget("mcp");
    window.setTimeout(() => setCopiedTarget(null), 1600);
  }

  async function copyAgentSetupCommand() {
    if (!canBootstrapAgent) return;
    await getPlatformService().copyToClipboard(agentSetupCommand);
    setCopiedTarget("agent");
    window.setTimeout(() => setCopiedTarget(null), 1600);
  }

  async function copyAllAgentSetupCommand() {
    if (!canBootstrapAgent) return;
    await getPlatformService().copyToClipboard(allAgentSetupCommand);
    setCopiedTarget("agentAll");
    window.setTimeout(() => setCopiedTarget(null), 1600);
  }

  async function copyEvidenceSnapshot() {
    await getPlatformService().copyToClipboard(evidenceSnapshot);
    setCopiedTarget("evidence");
    window.setTimeout(() => setCopiedTarget(null), 1600);
  }

  function handleMcpProfileChange(value: string) {
    const nextProfile = value as McpProfile;
    setMcpProfile(nextProfile);
    setCopiedTarget(null);
    if (nextProfile === "readonly") {
      setProfileRiskConfirmed(false);
    }
  }

  function handleMcpClientChange(value: string) {
    setMcpClient(value as McpClient);
    setCopiedTarget(null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial diagnostics should run once on mount.
  useEffect(() => {
    void refreshAll();
  }, []);

  const busy = loadingAction !== null;

  return (
    <div className="space-y-4 p-4 pt-3">
      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
          "External AI Access Beta",
          betaReady
            ? statusLabel(true, readinessLabel, "")
            : readyCount >= 3
              ? neutralStatusLabel(readinessLabel)
              : statusLabel(false, "", readinessLabel),
          "集中检查 CLI、Skill、多客户端发现目录、MCP 配置和审计通道。默认修复只使用 readonly。",
          <>
            <Button size="sm" variant="outline" onClick={refreshAll} disabled={busy}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              验证
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRepairExternalAccess}
              disabled={busy}
            >
              <Wrench className="mr-1.5 h-3.5 w-3.5" />
              修复外部 AI
            </Button>
          </>,
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {compactStatusItem("CLI", statusLabel(cliAvailable, "可用", "缺失"))}
          {compactStatusItem("Doctor", statusLabel(doctor?.ok === true, "通过", "失败"))}
          {compactStatusItem(
            "Runtime",
            statusLabel(
              doctor?.ok ? doctor.data.checks.every((check) => check.ok) : false,
              "健康",
              "异常",
            ),
          )}
          {compactStatusItem("Skill", statusLabel(skillInstalled, "已安装", "未安装"))}
          {compactStatusItem("Client links", statusLabel(clientSkillReady, "完整", "待修复"))}
          {compactStatusItem(
            "MCP config",
            mcpConfigsReady ? statusLabel(true, "已配置", "") : neutralStatusLabel("需粘贴/重启"),
          )}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          MCP config 表示常见配置文件里已经出现
          ReadAny；真实客户端是否已热加载，需要重启或新建会话后验证工具是否出现。
        </p>
      </section>

      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <Terminal className="h-4 w-4 text-muted-foreground" />,
          "ReadAny CLI",
          statusLabel(cliAvailable, "可用", "未检测到"),
          "桌面端通过受限命令检测 CLI，不开放任意 shell。",
          <>
            <Button size="sm" variant="outline" onClick={refreshAll} disabled={busy}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              诊断
            </Button>
            <Button size="sm" variant="outline" onClick={handleCliInstall} disabled={busy}>
              安装
            </Button>
            <Button size="sm" variant="outline" onClick={handleCliRepair} disabled={busy}>
              修复
            </Button>
            <Button size="sm" variant="outline" onClick={handleCliUninstall} disabled={busy}>
              卸载
            </Button>
            <Button size="sm" variant="outline" onClick={copyEvidenceSnapshot} disabled={busy}>
              {copiedTarget === "evidence" ? "已复制" : "复制证据"}
            </Button>
          </>,
        )}

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">版本</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {cliVersion || "未安装或 PATH 不可用"}
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Profile</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {doctor?.ok ? doctor.data.profile : "readonly"}
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Tools</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {doctor?.ok ? doctor.data.tools.count : readonlyToolNames.length || "-"}
            </p>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-border/40 bg-background/70 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">执行来源</p>
          <p
            className="mt-1 truncate font-mono text-xs text-foreground"
            title={[
              lastActionResult?.command_source ??
                versionResult?.command_source ??
                doctorResult?.command_source ??
                "尚未检测",
              lastActionResult?.command ?? versionResult?.command ?? "",
            ]
              .filter(Boolean)
              .join(" · ")}
          >
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

        {doctor?.ok ? (
          <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">运行时 / 打包证据</p>
            </div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
              {evidenceValue("distribution", doctorDistribution?.kind)}
              {evidenceValue("built bundle", doctorDistribution?.builtBundle)}
              {evidenceValue("desktop resource", doctorDistribution?.desktopResourceBundle)}
              {evidenceValue("native binary", doctorDistribution?.nativeBinary)}
              {evidenceValue("uses node runtime", doctorDistribution?.usesNodeRuntime)}
              {evidenceValue("node", doctorRuntime?.node)}
              {evidenceValue("native sqlite", doctorRuntime?.nativeSqliteAvailable)}
              {evidenceValue("bundle root", doctorDistribution?.bundleRoot)}
            </div>
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
              {evidenceValue("entrypoint", doctorDistribution?.entrypoint)}
              {evidenceValue("node executable", doctorRuntime?.executable)}
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {doctor?.ok
            ? doctor.data.checks.map((check) => (
                <div
                  key={check.name}
                  className="flex flex-col gap-2 rounded-md border border-border/40 bg-background/70 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-foreground">{check.name}</p>
                    <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
                      {check.message}
                    </p>
                  </div>
                  <div className="self-start">{statusLabel(check.ok, "通过", "失败")}</div>
                </div>
              ))
            : null}
          {!doctor?.ok &&
            outputPanel(outputSummary(doctorResult, doctor), doctorResult ? "error" : "default")}
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <PackageCheck className="h-4 w-4 text-muted-foreground" />,
          "Agent bootstrap",
          statusLabel(canBootstrapAgent, "可复制", "等待确认"),
          "把这条命令复制给外部 AI，它会安装 ReadAny CLI、安装 skill，并返回 MCP 配置片段。",
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={copyAgentSetupCommand}
              disabled={!canBootstrapAgent}
            >
              <Clipboard className="mr-1.5 h-3.5 w-3.5" />
              {copiedTarget === "agent" ? "已复制" : "复制命令"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={copyAllAgentSetupCommand}
              disabled={!canBootstrapAgent}
            >
              <Clipboard className="mr-1.5 h-3.5 w-3.5" />
              {copiedTarget === "agentAll" ? "已复制" : "复制全量命令"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAgentSetup}
              disabled={!canBootstrapAgent || busy}
            >
              一键安装
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAgentSetupAll}
              disabled={!canBootstrapAgent || busy}
            >
              一键全量安装
            </Button>
            <Button size="sm" variant="outline" onClick={handleAgentUninstall} disabled={busy}>
              卸载接入
            </Button>
          </>,
        )}

        <pre className="mt-4 max-h-24 overflow-auto rounded-md border border-border/40 bg-background/70 p-3 text-xs leading-5 text-foreground">
          {agentSetupCommand}
          {"\n"}
          {allAgentSetupCommand}
        </pre>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
          {evidenceValue("client", MCP_CLIENT_LABELS[mcpClient], false)}
          {evidenceValue("profile", mcpProfile)}
          {evidenceValue("skill target", "$AGENT_HOME/skills/readany/SKILL.md")}
        </div>

        <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">客户端发现状态</p>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {clientSkillRows.length > 0
              ? clientSkillRows.map((row) => (
                  <div
                    key={row.client}
                    className="min-w-0 rounded-md border border-border/40 bg-background/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="text-xs font-medium text-foreground">
                        {CLIENT_SKILL_LABELS[row.client]}
                      </p>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {statusLabel(row.installed, "存在", "缺失")}
                        {statusLabel(row.managed, "托管", "非托管")}
                      </div>
                    </div>
                    {pathText(row.path)}
                    {row.target ? pathText(`→ ${row.target}`) : null}
                  </div>
                ))
              : outputPanel("运行诊断后显示客户端 skill 发现状态。")}
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">MCP 配置状态</p>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {mcpConfigRows.length > 0
              ? mcpConfigRows.map((row) => (
                  <div
                    key={row.client}
                    className="min-w-0 rounded-md border border-border/40 bg-background/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="text-xs font-medium text-foreground">
                        {MCP_CLIENT_LABELS[row.client]}
                      </p>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {row.checked
                          ? statusLabel(true, "已检查", "")
                          : neutralStatusLabel("未找到")}
                        {row.configured
                          ? statusLabel(true, "含 readany", "")
                          : neutralStatusLabel("需配置")}
                      </div>
                    </div>
                    {pathText(row.path)}
                  </div>
                ))
              : outputPanel("运行诊断后显示 MCP 配置检测结果。")}
          </div>
        </div>

        {needsProfileConfirmation ? (
          <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
            当前 profile 会开放 draft 写入或导出能力；确认上方风险开关后才允许复制或执行 bootstrap。
          </div>
        ) : null}

        {agentSetup?.ok ? (
          <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <p className="text-xs font-medium text-foreground">最近一键安装结果</p>
            </div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
              {evidenceValue("CLI shim", agentSetup.data.install.path)}
              {evidenceValue("Skill", agentSetup.data.skill.path)}
              {evidenceValue("MCP format", agentSetup.data.mcp.format)}
              {evidenceValue("返回命令", agentSetup.data.command)}
            </div>
            <pre className="mt-3 max-h-36 overflow-auto rounded-md border border-border/40 bg-background/70 p-3 text-xs leading-5 text-foreground">
              {agentSetup.data.mcp.snippet}
            </pre>
          </div>
        ) : null}

        {agentUninstall?.ok ? (
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
            {evidenceValue("已移除 CLI shim", agentUninstall.data.install.removed)}
            {evidenceValue("已移除 Skill", agentUninstall.data.skill.removed)}
          </div>
        ) : null}

        {agentResult && !agentSetup?.ok && !agentUninstall?.ok ? (
          <div className="mt-3">
            {outputPanel(
              outputSummary(agentResult, agentSetup ?? agentUninstall),
              agentResult.ok ? "default" : "error",
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <Bot className="h-4 w-4 text-muted-foreground" />,
          "External AI Skill",
          statusLabel(skillInstalled, "已安装", "未安装"),
          "Skill 安装到通用 agent 目录，只提供使用说明，不保存书库数据或密钥。",
          <>
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
          </>,
        )}
        <div className="mt-3 rounded-md border border-border/40 bg-background/70 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">安装位置</p>
          {pathText(skill?.ok ? skill.data.path : outputSummary(skillResult, skill))}
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
          "MCP access profile",
          statusLabel(canCopyMcpConfig, "可配置", "等待确认"),
          "默认 readonly。editor / publisher 需要用户显式确认，安装 CLI 或 Skill 不等于授权写入。",
          <Button size="sm" variant="outline" onClick={copyMcpConfig} disabled={!canCopyMcpConfig}>
            <Clipboard className="mr-1.5 h-3.5 w-3.5" />
            {copiedTarget === "mcp" ? "已复制" : "复制配置"}
          </Button>,
        )}

        <div className="mt-3 rounded-md border border-border/40 bg-background/70 p-3">
          <div className="grid gap-3 md:grid-cols-2">
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
                  <SelectItem value="opencode">{MCP_CLIENT_LABELS.opencode}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-3">
            <p className="text-xs leading-5 text-muted-foreground">
              {PROFILE_DESCRIPTIONS[mcpProfile]} 当前复制 {MCP_CLIENT_LABELS[mcpClient]} 模板。
            </p>
            {needsProfileConfirmation ? (
              <label
                className="mt-3 flex items-start gap-3 rounded-md bg-background px-3 py-3"
                htmlFor="external-ai-profile-confirmation"
              >
                <Switch
                  checked={profileRiskConfirmed}
                  id="external-ai-profile-confirmation"
                  onCheckedChange={setProfileRiskConfirmed}
                />
                <span className="min-w-0 text-xs leading-5 text-muted-foreground">
                  我确认该 profile 会允许外部 AI 调用 draft
                  写入或导出类工具；原书仍不会被覆盖，导出默认生成新文件。
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-border/40 bg-background/70 p-3 text-xs leading-5 text-foreground">
          {mcpConfig}
        </pre>

        <div className="mt-3 rounded-md border border-border/40 bg-background/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">当前 MCP 工具</p>
          </div>
          <p className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
            {readonlyToolNames.length > 0 ? readonlyToolNames.join(", ") : "运行诊断后显示。"}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-background/45 p-4">
        {sectionHeader(
          <History className="h-4 w-4 text-muted-foreground" />,
          "调用记录",
          audit?.ok
            ? auditFailureCount > 0
              ? neutralStatusLabel(`${auditFailureCount} 条失败`)
              : statusLabel(true, "正常", "")
            : neutralStatusLabel("等待记录"),
          "用来确认外部 AI 是否真的调用了 ReadAny。这里只记录来源、动作、结果和时间，不保存工具参数、正文、密钥或同步凭证。",
          <Button size="sm" variant="outline" onClick={() => void refreshAudit()} disabled={busy}>
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loadingAction === "audit_list" ? "animate-spin" : ""}`}
            />
            刷新
          </Button>,
        )}

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">本次显示</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {audit?.ok ? `${auditEntries.length} 条` : "未读取"}
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">失败</p>
            <div className="mt-1">
              {audit?.ok
                ? auditFailureCount > 0
                  ? statusLabel(false, "", `${auditFailureCount} 条`)
                  : statusLabel(true, "0 条", "")
                : neutralStatusLabel("未知")}
            </div>
          </div>
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">最近一次</p>
            <p
              className="mt-1 truncate text-xs font-medium text-foreground"
              title={latestAuditLabel}
            >
              {latestAuditLabel}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border/40 bg-muted/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">查看范围</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              最多读取 {auditOptions.auditLimit} 条元数据。
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr_0.8fr]">
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">来源</p>
              <Select
                value={auditSource}
                onValueChange={(value) => setAuditSource(value as typeof auditSource)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="cli">CLI</SelectItem>
                  <SelectItem value="mcp">MCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">结果</p>
              <Select
                value={auditStatus}
                onValueChange={(value) => setAuditStatus(value as typeof auditStatus)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部结果</SelectItem>
                  <SelectItem value="failed">仅失败</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">动作前缀</p>
              <Input
                className="h-8 text-xs"
                placeholder="如 book. / rag."
                value={auditActionPrefix}
                onChange={(event) => setAuditActionPrefix(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">日期</p>
              <AuditDatePicker value={auditDate} onChange={setAuditDate} />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">数量</p>
              <Input
                className="h-8 text-xs"
                inputMode="numeric"
                min={1}
                max={50}
                type="number"
                value={auditLimit}
                onChange={(event) => setAuditLimit(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => void refreshAudit()} disabled={busy}>
              应用筛选
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void resetAuditFilters()}
              disabled={busy}
            >
              重置
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {audit?.ok && auditEntries.length > 0
            ? auditEntries.map((entry) => (
                <div
                  key={`${entry.timestamp}-${entry.source}-${entry.action}`}
                  className={`rounded-md border px-3 py-2.5 ${
                    entry.ok
                      ? "border-border/40 bg-background/70"
                      : "border-destructive/25 bg-destructive/5"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.ok ? statusLabel(true, "成功", "") : statusLabel(false, "", "失败")}
                        {auditMetaPill(auditSourceLabel(entry.source))}
                        {entry.profile ? auditMetaPill(entry.profile) : null}
                        {entry.code ? auditMetaPill(entry.code, "error") : null}
                      </div>
                      <p
                        className="mt-2 truncate font-mono text-xs font-medium text-foreground"
                        title={entry.action}
                      >
                        {entry.action}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] leading-5 text-muted-foreground">
                      {formatAuditTime(entry.timestamp)}
                    </p>
                  </div>
                  {!entry.ok ? (
                    <p className="mt-2 text-xs leading-5 text-destructive">
                      调用失败：{entry.code || "未返回错误码"}
                      。可以按来源和动作前缀筛选，定位是哪类工具失败。
                    </p>
                  ) : null}
                  <details className="mt-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                      完整元数据
                    </summary>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                      {auditDetailValue("action", entry.action)}
                      {auditDetailValue("timestamp", entry.timestamp)}
                      {auditDetailValue("source", entry.source)}
                      {auditDetailValue("profile", entry.profile)}
                      {auditDetailValue("result", entry.ok ? "ok" : "failed")}
                      {auditDetailValue("code", entry.code)}
                    </div>
                  </details>
                </div>
              ))
            : null}
          {audit?.ok && auditEntries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-background/50 px-3 py-4">
              <p className="text-xs font-medium text-foreground">还没有调用记录</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                在外部 AI 客户端调用一次 ReadAny 工具，或点击上方“验证”后再刷新这里。
              </p>
            </div>
          ) : null}
          {!audit?.ok ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">日志读取失败</p>
              {outputPanel(outputSummary(auditResult, audit), auditResult ? "error" : "default")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
