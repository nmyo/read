import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "../..");

function parseArgs(argv) {
  const options = {
    recordPath: undefined,
    evidencePaths: [],
    outputDir: undefined,
    reviewer: undefined,
    release: undefined,
    manifestName: "final-manifest.json",
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
      options.evidencePaths.push(next);
      index += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = next;
      index += 1;
    } else if (arg === "--reviewer") {
      options.reviewer = next;
      index += 1;
    } else if (arg === "--release") {
      options.release = next;
      index += 1;
    } else if (arg === "--manifest-name") {
      options.manifestName = next;
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
  return `ReadAny acceptance assembler

Usage:
  pnpm --filter @readany/cli acceptance:assemble -- --record <record.md> --evidence <evidence.json>... --output-dir <bundle-dir>

Options:
  --record <path>         Final M5 acceptance Markdown record.
  --evidence <path>       Acceptance evidence JSON; repeatable.
  --output-dir <path>     Target acceptance bundle directory. Writes <output-dir>/final-manifest.json and bundle files.
  --reviewer <name>       Reviewer name.
  --release <label>       Release or build label.
  --manifest-name <name>  Intermediate manifest filename before bundling. Default: final-manifest.json
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

function runNodeScript(scriptName, args) {
  return spawnSync(process.execPath, [resolve(scriptDir, scriptName), ...args], {
    cwd: cliRoot,
    env: process.env,
    encoding: "utf8",
  });
}

function commandOutput(result, fallback) {
  if (result.error) {
    return result.error.message || fallback;
  }
  return result.stderr || result.stdout || fallback;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  assertOption(options.recordPath, "Pass --record <path>.");
  assertOption(options.evidencePaths.length > 0, "Pass at least one --evidence <path>.");
  assertOption(options.outputDir, "Pass --output-dir <path>.");

  const recordPath = resolveInputPath(options.recordPath);
  const evidencePaths = options.evidencePaths.map(resolveInputPath);
  const outputDir = resolveInputPath(options.outputDir);
  const manifestPath = join(outputDir, options.manifestName);

  const finalize = runNodeScript("finalize-acceptance.mjs", [
    "--record",
    recordPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(options.reviewer ? ["--reviewer", options.reviewer] : []),
    ...(options.release ? ["--release", options.release] : []),
    "--output",
    manifestPath,
  ]);
  if (finalize.status !== 0) {
    process.stderr.write(commandOutput(finalize, "acceptance:finalize failed.\n"));
    process.exitCode = 1;
    return;
  }

  const bundle = runNodeScript("acceptance-bundle.mjs", [
    "--record",
    recordPath,
    "--manifest",
    manifestPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(options.release ? ["--release", options.release] : []),
    "--output-dir",
    outputDir,
  ]);
  if (bundle.status !== 0) {
    process.stderr.write(commandOutput(bundle, "acceptance:bundle failed.\n"));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        outputDir,
        manifestPath,
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
