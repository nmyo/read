import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@readany/core/utils";
import { AlertCircle, CheckCircle2, FileDiff, History, RefreshCw, ShieldCheck } from "lucide-react";
import type { ElementType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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

type CommandResult<T> =
  | {
      ok: true;
      data: T;
      warnings?: string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

type EpubDraftHistoryEntry = {
  id: string;
  timestamp: string;
  action: string;
  chapterId?: string;
  href?: string;
  fields?: string[];
  itemCount?: number;
  operationId?: string;
  undoneAction?: string;
};

type EpubDraftHistoryResult = {
  draftId: string;
  bookId: string;
  status: string;
  entries: EpubDraftHistoryEntry[];
};

type EpubDiffEntry = {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  sourceSize?: number;
  draftSize?: number;
};

type EpubDiffResult = {
  draftId: string;
  bookId: string;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  entries: EpubDiffEntry[];
};

type EpubValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

type EpubValidationResult = {
  draftId: string;
  bookId: string;
  valid: boolean;
  checkedAt: string;
  manifestItemCount: number;
  spineItemCount: number;
  tocItemCount: number;
  errorCount: number;
  warningCount: number;
  issues: EpubValidationIssue[];
};

type DraftWorkspaceSnapshot = {
  history?: EpubDraftHistoryResult;
  diff?: EpubDiffResult;
  validation?: EpubValidationResult;
  raw: Partial<Record<"history" | "diff" | "validation", unknown>>;
};

interface EpubDraftWorkspaceProps {
  draftId: string;
}

function parseCliJson<T>(result: CliRunResult): CommandResult<T> {
  const output = result.stdout.trim();
  if (!output) {
    return {
      ok: false,
      error: {
        code: "empty_cli_output",
        message: result.stderr.trim() || "ReadAny CLI returned no JSON output.",
      },
    };
  }

  try {
    const parsed = JSON.parse(output) as CommandResult<T>;
    if (!result.ok && parsed.ok) {
      return {
        ok: false,
        error: {
          code: "cli_failed",
          message: result.stderr.trim() || "ReadAny CLI command failed.",
          details: parsed,
        },
      };
    }
    return parsed;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_cli_json",
        message: error instanceof Error ? error.message : String(error),
        details: output.slice(0, 500),
      },
    };
  }
}

function unwrapCommand<T>(result: CliRunResult, key: string): T {
  const parsed = parseCliJson<Record<string, T>>(result);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  const value = parsed.data[key];
  if (!value) {
    throw new Error(`ReadAny CLI response did not include ${key}.`);
  }
  return value;
}

async function runDraftAction(action: string, draftId: string): Promise<CliRunResult> {
  return invoke<CliRunResult>("readany_cli_run", {
    action,
    options: { draftId },
  });
}

function formatDateTime(value: string, locale: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value || "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function EpubDraftWorkspace({ draftId }: EpubDraftWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const [draftIdInput, setDraftIdInput] = useState(draftId);
  const [activeDraftId, setActiveDraftId] = useState(draftId);
  const [snapshot, setSnapshot] = useState<DraftWorkspaceSnapshot>({ raw: {} });
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setDraftIdInput(draftId);
    setActiveDraftId(draftId);
  }, [draftId]);

  const loadWorkspace = useCallback(
    async (targetDraftId: string) => {
      const normalizedDraftId = targetDraftId.trim();
      if (!normalizedDraftId) {
        toast.error(t("epubDraft.missingDraftId", "请输入 draft id"));
        return;
      }

      setLoading(true);
      setLastError(null);
      try {
        const [historyResult, diffResult, validationResult] = await Promise.all([
          runDraftAction("epub_history", normalizedDraftId),
          runDraftAction("epub_diff", normalizedDraftId),
          runDraftAction("epub_validate", normalizedDraftId),
        ]);

        const history = unwrapCommand<EpubDraftHistoryResult>(historyResult, "history");
        const diff = unwrapCommand<EpubDiffResult>(diffResult, "diff");
        const validation = unwrapCommand<EpubValidationResult>(validationResult, "validation");
        setSnapshot({
          history,
          diff,
          validation,
          raw: {
            history,
            diff,
            validation,
          },
        });
        setActiveDraftId(normalizedDraftId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadWorkspace(draftId);
  }, [draftId, loadWorkspace]);

  const changedEntries = useMemo(
    () => snapshot.diff?.entries.filter((entry) => entry.status !== "unchanged").slice(0, 80) ?? [],
    [snapshot.diff?.entries],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {t("epubDraft.title", "EPUB 精排工作区")}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{activeDraftId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={draftIdInput}
            onChange={(event) => setDraftIdInput(event.target.value)}
            className="h-8 w-72 font-mono text-xs"
            placeholder={t("epubDraft.draftId", "draft id")}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void loadWorkspace(draftIdInput)}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("common.refresh", "刷新")}
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <section className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricPanel
              icon={History}
              label={t("epubDraft.history", "History")}
              value={String(snapshot.history?.entries.length ?? "-")}
              detail={snapshot.history?.status ?? t("common.loading", "Loading")}
            />
            <MetricPanel
              icon={FileDiff}
              label={t("epubDraft.diff", "Diff")}
              value={String(snapshot.diff?.changedCount ?? "-")}
              detail={t("epubDraft.changedResources", "changed resources")}
            />
            <MetricPanel
              icon={ShieldCheck}
              label={t("epubDraft.validate", "Validate")}
              value={
                snapshot.validation
                  ? snapshot.validation.valid
                    ? t("epubDraft.valid", "Valid")
                    : t("epubDraft.invalid", "Invalid")
                  : "-"
              }
              detail={
                snapshot.validation
                  ? `${snapshot.validation.errorCount} errors / ${snapshot.validation.warningCount} warnings`
                  : t("common.loading", "Loading")
              }
            />
          </div>

          {lastError ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{lastError}</span>
            </div>
          ) : null}

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.changedFiles", "Changed files")}
              desc={t(
                "epubDraft.changedFilesDesc",
                "Entry-level diff keeps source paths hidden and does not expose full book content.",
              )}
            />
            <div className="mt-3 overflow-hidden rounded-md border">
              {changedEntries.length === 0 ? (
                <EmptyPanel text={t("epubDraft.noChanges", "No changed resources yet.")} />
              ) : (
                <div className="divide-y">
                  {changedEntries.map((entry) => (
                    <div key={entry.path} className="grid grid-cols-[96px_minmax(0,1fr)_120px] gap-3 px-3 py-2 text-xs">
                      <span
                        className={cn(
                          "w-fit rounded px-1.5 py-0.5 font-medium",
                          entry.status === "modified" && "bg-amber-100 text-amber-800",
                          entry.status === "added" && "bg-emerald-100 text-emerald-800",
                          entry.status === "removed" && "bg-red-100 text-red-800",
                        )}
                      >
                        {entry.status}
                      </span>
                      <span className="truncate font-mono text-foreground">{entry.path}</span>
                      <span className="text-right text-muted-foreground">
                        {entry.draftSize ?? entry.sourceSize ?? 0} B
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.validationIssues", "Validation issues")}
              desc={t("epubDraft.validationIssuesDesc", "Validate runs with publisher profile and does not modify files.")}
            />
            <div className="mt-3 overflow-hidden rounded-md border">
              {!snapshot.validation || snapshot.validation.issues.length === 0 ? (
                <EmptyPanel text={t("epubDraft.noIssues", "No validation issues.")} />
              ) : (
                <div className="divide-y">
                  {snapshot.validation.issues.map((issue, index) => (
                    <div key={`${issue.code}-${index}`} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-medium",
                            issue.severity === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800",
                          )}
                        >
                          {issue.severity}
                        </span>
                        <span className="font-mono text-muted-foreground">{issue.code}</span>
                      </div>
                      <p className="mt-1 text-foreground">{issue.message}</p>
                      {issue.path ? <p className="mt-1 truncate font-mono text-muted-foreground">{issue.path}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l bg-muted/20 p-4">
          <SectionTitle
            title={t("epubDraft.operations", "Operations")}
            desc={t("epubDraft.operationsDesc", "AI and user edits share this draft history.")}
          />
          <div className="mt-3 space-y-2">
            {snapshot.history?.entries.length ? (
              snapshot.history.entries.map((entry) => (
                <div key={entry.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    <span className="truncate text-xs font-medium text-foreground">{entry.action}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(entry.timestamp, i18n.language)}
                  </p>
                  <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                    {entry.chapterId ?? entry.href ?? entry.fields?.join(", ") ?? entry.operationId ?? entry.id}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel text={t("epubDraft.noHistory", "No history loaded yet.")} />
            )}
          </div>

          <details className="mt-4 rounded-md border bg-background p-3">
            <summary className="cursor-pointer text-xs font-medium text-foreground">
              {t("epubDraft.rawJson", "Raw JSON")}
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(snapshot.raw, null, 2)}
            </pre>
          </details>
        </aside>
      </main>
    </div>
  );
}

function MetricPanel({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{text}</div>;
}
