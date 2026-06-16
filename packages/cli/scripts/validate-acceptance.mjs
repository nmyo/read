import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

const KNOWN_MANUAL_REQUIREMENTS = [
  "sample-source",
  "external-agent-clients",
  "desktop-settings",
  "packaged-app-matrix",
  "reader-jumpback",
  "runtime-bundle",
];

const REQUIRED_RECORD_HEADINGS = [
  "## 基本信息",
  "## 本次验收范围",
  "## 本次明确不验收",
  "## 执行命令",
  "## 验收结果",
  "## 证据摘要",
  "## 安全边界证据",
  "## 当前可对外说明",
  "## 当前不能对外宣称",
  "## 已知问题",
  "## 是否允许进入下一阶段",
];

const STRICT_M5_HEADINGS = [
  "## 真实样本证据",
  "## 外部 Agent 证据",
  "## 打包 / 安装矩阵",
];

function parseArgs(argv) {
  const options = {
    recordPath: undefined,
    evidencePath: undefined,
    strictM5: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--record") {
      options.recordPath = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePath = next;
      index += 1;
    } else if (arg === "--strict-m5") {
      options.strictM5 = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

function usage() {
  return `ReadAny acceptance validator

Usage:
  pnpm --filter @readany/cli acceptance:validate -- --record <acceptance.md> [options]
  pnpm --filter @readany/cli acceptance:validate -- --evidence <real-sample.json> [options]

Options:
  --record <path>      Validate an acceptance Markdown record.
  --evidence <path>    Validate acceptance:real JSON evidence.
  --strict-m5          Enforce full M5 record gates.
  --json               Print machine-readable result.
`;
}

function assertCondition(condition, errors, message) {
  if (!condition) errors.push(message);
}

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start + heading.length, next < 0 ? text.length : next);
}

function nonPlaceholderBullets(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => line !== "-" && line !== "-  " && line !== "- -");
}

function validateRecord(text, { strictM5 }) {
  const errors = [];
  const warnings = [];
  const requiredHeadings = strictM5
    ? [...REQUIRED_RECORD_HEADINGS, ...STRICT_M5_HEADINGS]
    : REQUIRED_RECORD_HEADINGS;

  for (const heading of requiredHeadings) {
    assertCondition(text.includes(heading), errors, `Missing acceptance section: ${heading}`);
  }

  if (strictM5) {
    const scope = section(text, "## 本次验收范围");
    const result = section(text, "## 验收结果");
    const cannotClaim = section(text, "## 当前不能对外宣称");

    assertCondition(!scope.includes("- [ ]"), errors, "Strict M5 record still has unchecked scope items.");
    assertCondition(!/部分通过|不通过/.test(result), errors, "Strict M5 record result is not a full pass.");
    assertCondition(
      nonPlaceholderBullets(cannotClaim).length === 0,
      errors,
      "Strict M5 record still lists claims that cannot be made externally.",
    );
  } else if (text.includes("部分通过")) {
    warnings.push("Record is marked partial; use --strict-m5 only for final M5 acceptance.");
  }

  return { errors, warnings };
}

function validateEvidence(evidence) {
  const errors = [];
  const warnings = [];

  assertCondition(evidence?.ok === true, errors, "Evidence ok must be true.");
  assertCondition(typeof evidence?.generatedAt === "string", errors, "Evidence generatedAt is required.");
  assertCondition(typeof evidence?.readanyHome === "string", errors, "Evidence readanyHome is required.");
  assertCondition(Array.isArray(evidence?.checks), errors, "Evidence checks must be an array.");
  assertCondition(Array.isArray(evidence?.commands), errors, "Evidence commands must be an array.");
  assertCondition(Array.isArray(evidence?.sampleFiles), errors, "Evidence sampleFiles must be an array.");

  assertCondition(typeof evidence?.doctor?.version === "string", errors, "Doctor version is required.");
  assertCondition(typeof evidence?.doctor?.runtime?.node === "string", errors, "Doctor runtime.node is required.");
  assertCondition(
    typeof evidence?.doctor?.runtime?.executable === "string",
    errors,
    "Doctor runtime.executable is required.",
  );
  assertCondition(
    typeof evidence?.doctor?.runtime?.nativeSqliteAvailable === "boolean",
    errors,
    "Doctor runtime.nativeSqliteAvailable is required.",
  );
  assertCondition(evidence?.doctor?.distribution?.kind === "node-script", errors, "Doctor distribution.kind is required.");
  assertCondition(
    evidence?.doctor?.distribution?.usesNodeRuntime === true,
    errors,
    "Doctor distribution.usesNodeRuntime must be recorded.",
  );
  assertCondition(
    typeof evidence?.doctor?.distribution?.nativeBinary === "boolean",
    errors,
    "Doctor distribution.nativeBinary is required.",
  );
  assertCondition(
    typeof evidence?.doctor?.distribution?.builtBundle === "boolean",
    errors,
    "Doctor distribution.builtBundle is required.",
  );
  assertCondition(
    typeof evidence?.doctor?.distribution?.desktopResourceBundle === "boolean",
    errors,
    "Doctor distribution.desktopResourceBundle is required.",
  );
  assertCondition(evidence?.doctor?.mcp?.defaultProfile === "readonly", errors, "Doctor MCP default profile must be readonly.");
  assertCondition(Array.isArray(evidence?.doctor?.mcp?.serveArgs), errors, "Doctor MCP serveArgs are required.");
  assertCondition(typeof evidence?.doctor?.mcp?.toolCount === "number", errors, "Doctor MCP toolCount is required.");

  if (evidence?.summary) {
    assertCondition(
      evidence.summary.commandCount === evidence.commands?.length,
      errors,
      "Summary commandCount must match commands length.",
    );
    assertCondition(
      evidence.summary.checkCount === evidence.checks?.length,
      errors,
      "Summary checkCount must match checks length.",
    );
    assertCondition(
      evidence.summary.sampleFileCount === evidence.sampleFiles?.length,
      errors,
      "Summary sampleFileCount must match sampleFiles length.",
    );
  } else {
    warnings.push("Evidence has no summary field.");
  }

  for (const [index, sample] of (evidence?.sampleFiles ?? []).entries()) {
    assertCondition(Array.isArray(sample.labels) && sample.labels.length > 0, errors, `Sample ${index} labels are required.`);
    assertCondition(typeof sample.bookId === "string" && sample.bookId.length > 0, errors, `Sample ${index} bookId is required.`);
    assertCondition(typeof sample.format === "string" && sample.format.length > 0, errors, `Sample ${index} format is required.`);
    assertCondition(typeof sample.filePath === "string" && sample.filePath.length > 0, errors, `Sample ${index} filePath is required.`);
    assertCondition(typeof sample.bytes === "number" && sample.bytes > 0, errors, `Sample ${index} bytes must be positive.`);
    assertCondition(/^[a-f0-9]{64}$/.test(sample.sha256 ?? ""), errors, `Sample ${index} sha256 must be a hex SHA-256.`);
  }

  const manualRequirements = evidence?.manualAcceptanceRequired ?? [];
  assertCondition(Array.isArray(manualRequirements), errors, "manualAcceptanceRequired must be an array.");
  const requirementIds = new Set(manualRequirements.map((item) => item.id));
  for (const id of KNOWN_MANUAL_REQUIREMENTS) {
    assertCondition(requirementIds.has(id), errors, `Missing manual acceptance requirement: ${id}`);
  }
  for (const item of manualRequirements) {
    assertCondition(typeof item.id === "string", errors, "Manual requirement id is required.");
    assertCondition(typeof item.label === "string", errors, `Manual requirement ${item.id} label is required.`);
    assertCondition(
      Array.isArray(item.evidence) && item.evidence.length > 0,
      errors,
      `Manual requirement ${item.id} evidence hints are required.`,
    );
    assertCondition(Array.isArray(item.commands), errors, `Manual requirement ${item.id} commands must be an array.`);
  }

  return { errors, warnings };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.recordPath && !options.evidencePath) {
    throw new Error("Pass --record <path>, --evidence <path>, or both.");
  }

  const errors = [];
  const warnings = [];
  const validated = {};

  if (options.recordPath) {
    const recordPath = resolveInputPath(options.recordPath);
    const recordText = await readFile(recordPath, "utf8");
    const result = validateRecord(recordText, { strictM5: options.strictM5 });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    validated.record = recordPath;
  }

  if (options.evidencePath) {
    const evidencePath = resolveInputPath(options.evidencePath);
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const result = validateEvidence(evidence);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    validated.evidence = evidencePath;
  }

  const output = {
    ok: errors.length === 0,
    strictM5: options.strictM5,
    validated,
    errors,
    warnings,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else if (output.ok) {
    process.stdout.write(
      `Acceptance validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.\n`,
    );
  } else {
    process.stderr.write(`Acceptance validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  }

  if (!output.ok) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
