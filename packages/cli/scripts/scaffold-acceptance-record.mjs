import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

function parseArgs(argv) {
  const options = {
    evidencePath: undefined,
    outputPath: undefined,
    milestone: "M5 acceptance draft",
    reviewer: "TBD",
    desktopPackage: "TBD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--evidence") {
      options.evidencePath = next;
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = next;
      index += 1;
    } else if (arg === "--milestone") {
      options.milestone = next;
      index += 1;
    } else if (arg === "--reviewer") {
      options.reviewer = next;
      index += 1;
    } else if (arg === "--desktop-package") {
      options.desktopPackage = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `ReadAny acceptance record scaffold

Usage:
  pnpm --filter @readany/cli acceptance:scaffold -- --evidence <real-sample.json> [options]

Options:
  --evidence <path>          acceptance:real JSON evidence.
  --output <path>            Write Markdown record to this path; stdout when omitted.
  --milestone <name>         Milestone label.
  --reviewer <name>          Reviewer name.
  --desktop-package <source> Desktop package source.
`;
}

function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

function value(value, fallback = "TBD") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function firstCitationAnchor(evidence) {
  const target = evidence.citationTargets?.find((item) => item.type === "rag-chunk") ?? evidence.citationTargets?.[0];
  return target?.cfi ?? target?.startCfi ?? (target?.page ? `page:${target.page}` : "TBD");
}

function distributionAnchors(evidence) {
  const distribution = evidence.doctor?.distribution ?? {};
  return [
    `builtBundle: ${distribution.builtBundle === true ? "true" : "false"}`,
    `desktopResourceBundle: ${distribution.desktopResourceBundle === true ? "true" : "false"}`,
    `nativeBinary: ${distribution.nativeBinary === true ? "true" : "false"}`,
  ];
}

function sampleRows(evidence) {
  return (evidence.sampleFiles ?? [])
    .map((sample) => {
      const labels = Array.isArray(sample.labels) ? sample.labels.join(", ") : "";
      return `| ${value(sample.format)} | ${value(sample.title ?? sample.filePath)} | ${labels || "TBD"} | ${value(sample.sha256)} | TBD | ${labels || "sample"} |`;
    })
    .join("\n");
}

function closureRows(evidence) {
  return (evidence.manualAcceptanceRequired ?? [])
    .map((item) => `| ${item.id} | pending | ${item.evidence?.join("; ") ?? item.label} | TBD |`)
    .join("\n");
}

function renderRecord(evidence, options) {
  const sampleHash = evidence.sampleFiles?.[0]?.sha256 ?? "TBD";
  const citationAnchor = firstCitationAnchor(evidence);
  const distribution = distributionAnchors(evidence);
  return `# ReadAny CLI Acceptance Record

## 基本信息

- 日期：${new Date().toISOString().slice(0, 10)}
- Milestone：${options.milestone}
- 分支：${value(evidence.environment?.gitBranch)}
- Commit：${value(evidence.environment?.gitCommit)}
- 验收人：${options.reviewer}
- 操作系统：${value(evidence.environment?.platform)} / ${value(evidence.environment?.arch)}
- Node 版本：${value(evidence.environment?.node)}
- pnpm 版本：${value(evidence.environment?.pnpm)}
- ReadAny CLI 版本：${value(evidence.environment?.cliVersion ?? evidence.doctor?.version)}
- 样本数据位置：${value(evidence.readanyHome)}
- 样本数据 hash：${sampleHash}
- 外部 agent 客户端：TBD
- 桌面包来源：${options.desktopPackage}

## 本次验收范围

- [ ] CLI 基础命令
- [ ] Skill 安装 / 卸载
- [ ] readonly MCP
- [ ] 只读书库查询
- [ ] indexed chapters
- [ ] reader context snapshot
- [ ] RAG search
- [ ] EPUB draft
- [ ] EPUB export
- [ ] exported EPUB reimport / open
- [ ] 桌面设置页
- [ ] 外部 agent 接入
- [ ] macOS / Windows / Linux install matrix
- [ ] native binary / runtime bundle

## 本次明确不验收

- 当前为 scaffold，pending 项必须补证后才能改为通过。

## 执行命令

\`\`\`bash
pnpm --filter @readany/cli acceptance:real -- --evidence <evidence-json>
pnpm --filter @readany/cli acceptance:validate -- --record <acceptance-record.md> --evidence <evidence-json> --strict-m5
\`\`\`

## 验收结果

\`\`\`text
部分通过
\`\`\`

## 证据摘要

- evidence generatedAt：${value(evidence.generatedAt)}
- checks：${value(evidence.summary?.checkCount)}
- commands：${value(evidence.summary?.commandCount)}
- sample files：${value(evidence.summary?.sampleFileCount)}
- citation targets：${value(evidence.summary?.citationTargetCount)}
- sample SHA-256：${sampleHash}
- citation target：${citationAnchor}
- distribution：${distribution.join(" / ")}

## 安全边界证据

- readonly 写入拒绝：TBD
- 原始 EPUB hash 不变：TBD
- export 不覆盖源文件：TBD
- export 不覆盖已有文件：TBD
- Tauri allowlist：TBD
- MCP tools/list 与真实实现一致：TBD
- audit 不含完整正文 / 密钥 / 同步凭证：TBD

## 真实样本证据

样本清单：

| 类型 | 标题 / 文件 | 来源 | SHA-256 | 是否可公开 | 用途 |
| --- | --- | --- | --- | --- | --- |
${sampleRows(evidence)}

端到端结果：

- EPUB inspect：TBD
- EPUB draft edit：TBD
- EPUB validate：TBD
- EPUB export：TBD
- 导出 EPUB 重新导入或标准 EPUB 工具打开：TBD
- PDF \`chapters.list/get\` fallback：TBD
- RAG result 引用字段：${citationAnchor}
- 桌面端引用点击回跳：TBD

## 外部 Agent 证据

| 客户端 | 版本 | MCP 配置 profile | tools/list | read flow | draft/export flow | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex |  |  |  |  |  |  |
| Claude Desktop / Cursor |  |  |  |  |  |  |

必须附：

- MCP config 片段，不含密钥。
- \`tools/list\` 是否只包含真实实现工具。
- readonly 写入拒绝截图或日志摘要。
- editor draft 修改摘要。
- publisher validate/export 摘要。
- audit 摘要。

## 打包 / 安装矩阵

| 平台 | 包来源 | 安装 | \`readany doctor --json\` | Skill install/status | MCP initialize/tools/list | Draft export | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| macOS |  |  |  |  |  |  |  |
| Windows |  |  |  |  |  |  |  |
| Linux |  |  |  |  |  |  |  |

## Manual Acceptance Closure

| id | status | evidence | owner |
| --- | --- | --- | --- |
${closureRows(evidence)}

## Evidence Anchors

- sample SHA-256：${sampleHash}
- citation target：${citationAnchor}
${distribution.map((item) => `- distribution：${item}`).join("\n")}

## 当前可对外说明

- TBD

## 当前不能对外宣称

- 该记录仍是 scaffold，不能作为 M5 完成记录。

## 已知问题

- TBD

## 是否允许进入下一阶段

- [ ] 是
- [x] 否

原因：scaffold 仍含 pending/TBD 项，需补齐人工验收和 strict M5 校验。
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.evidencePath) throw new Error("Pass --evidence <path>.");

  const evidencePath = resolveInputPath(options.evidencePath);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const record = renderRecord(evidence, options);
  if (options.outputPath) {
    const outputPath = resolveInputPath(options.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, record, "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, outputPath }, null, 2)}\n`);
  } else {
    process.stdout.write(record);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
