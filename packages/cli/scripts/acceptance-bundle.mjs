import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "../..");

function parseArgs(argv) {
  const options = {
    recordPath: undefined,
    manifestPath: undefined,
    evidencePaths: [],
    outputDir: undefined,
    release: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--record") {
      options.recordPath = next;
      index += 1;
    } else if (arg === "--manifest") {
      options.manifestPath = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePaths.push(next);
      index += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = next;
      index += 1;
    } else if (arg === "--release") {
      options.release = next;
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
  return `ReadAny M5 acceptance bundle exporter

Usage:
  pnpm --filter @readany/cli acceptance:bundle -- --record <record.md> --manifest <manifest.json> --evidence <evidence.json>... --output-dir <bundle-dir>

Options:
  --record <path>       Final M5 acceptance Markdown record.
  --manifest <path>     Final manifest JSON.
  --evidence <path>     Acceptance evidence JSON; repeatable.
  --output-dir <path>   Write a bundle directory to this path.
  --release <label>     Release or build label.
`;
}

function assertOption(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

function bundleFileName(path, fallback) {
  const value = String(path ?? "").replace(/[\\/]/g, "_").trim();
  return value || fallback;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  assertOption(options.recordPath, "Pass --record <path>.");
  assertOption(options.manifestPath, "Pass --manifest <path>.");
  assertOption(options.evidencePaths.length > 0, "Pass at least one --evidence <path>.");
  assertOption(options.outputDir, "Pass --output-dir <path>.");

  const recordPath = resolveInputPath(options.recordPath);
  const manifestPath = resolveInputPath(options.manifestPath);
  const evidencePaths = options.evidencePaths.map(resolveInputPath);
  const outputDir = resolveInputPath(options.outputDir);
  const evidenceDir = join(outputDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const recordText = await readFile(recordPath, "utf8");
  const manifestText = await readFile(manifestPath, "utf8");
  await writeFile(join(outputDir, "record.md"), recordText, "utf8");
  await writeFile(join(outputDir, "manifest.json"), manifestText, "utf8");
  await writeFile(
    join(outputDir, "index.json"),
    `${JSON.stringify(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        release: options.release,
        record: "record.md",
        manifest: "manifest.json",
        evidences: evidencePaths.map((path, index) => ({
          source: path,
          target: `evidence/${bundleFileName(path, `evidence-${index + 1}.json`)}`,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  for (const [index, evidencePath] of evidencePaths.entries()) {
    const target = join(evidenceDir, bundleFileName(evidencePath, `evidence-${index + 1}.json`));
    await writeFile(target, await readFile(evidencePath, "utf8"), "utf8");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        outputDir,
        files: [
          "record.md",
          "manifest.json",
          "index.json",
          ...evidencePaths.map((path, index) => `evidence/${bundleFileName(path, `evidence-${index + 1}.json`)}`),
        ],
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
