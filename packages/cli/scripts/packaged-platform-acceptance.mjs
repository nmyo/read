import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "../..");
const defaultBinPath = resolve(cliRoot, "dist/bin/readany.js");

function parseArgs(argv) {
  const options = {
    cli: undefined,
    packageSource: undefined,
    platform: process.platform,
    evidencePath: undefined,
    agentHome: process.env.AGENT_HOME,
    readanyHome: process.env.READANY_HOME,
    withSkillInstall: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--cli") {
      options.cli = next;
      index += 1;
    } else if (arg === "--package-source") {
      options.packageSource = next;
      index += 1;
    } else if (arg === "--platform") {
      options.platform = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePath = next;
      index += 1;
    } else if (arg === "--agent-home") {
      options.agentHome = next;
      index += 1;
    } else if (arg === "--readany-home") {
      options.readanyHome = next;
      index += 1;
    } else if (arg === "--with-skill-install") {
      options.withSkillInstall = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `ReadAny packaged platform acceptance helper

Usage:
  pnpm --filter @readany/cli acceptance:packaged -- --package-source <dmg|msi|appimage|...> [options]

Readonly by default:
  --cli <path>                 CLI executable or built readany.js. Defaults to dist/bin/readany.js.
  --package-source <label>     Package artifact/source label for the platform matrix.
  --platform <name>            Platform label; defaults to process.platform.
  --readany-home <path>        ReadAny data root; defaults to READANY_HOME.
  --evidence <path>            Write JSON evidence to this path.

Explicit write mode:
  --with-skill-install         Run skill install/status/uninstall. Use --agent-home with a temp dir for QA.
  --agent-home <path>          Agent home used by skill commands.
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

function commandForCli(cliPath) {
  if (cliPath.endsWith(".js")) {
    return {
      command: process.execPath,
      argsPrefix: [cliPath],
      display: `${process.execPath} ${cliPath}`,
    };
  }
  return {
    command: cliPath,
    argsPrefix: [],
    display: cliPath,
  };
}

function commandDisplay(cli, args) {
  return ["readany", ...args].join(" ");
}

function summarizeJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_, child) => {
    if (typeof child === "string" && child.length > 500) return `${child.slice(0, 500)}...`;
    return child;
  }));
}

function runCli(cli, args, env) {
  const result = spawnSync(cli.command, [...cli.argsPrefix, ...args], {
    cwd: cliRoot,
    env,
    encoding: "utf8",
    shell: process.platform === "win32" && cli.argsPrefix.length === 0,
  });
  let parsed;
  try {
    parsed = result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
  } catch {
    parsed = undefined;
  }
  return {
    command: commandDisplay(cli, args),
    status: result.status,
    ok: result.status === 0 && (parsed?.ok ?? true) !== false,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    parsed,
  };
}

function assertCommand(checks, commands, name, result) {
  commands.push({
    name,
    command: result.command,
    status: result.status,
    ok: result.ok,
    data: summarizeJson(result.parsed?.data),
    error: summarizeJson(result.parsed?.error),
  });
  if (!result.ok) {
    throw new Error(`${name} failed: ${result.stderr || result.stdout || result.status}`);
  }
  checks.push(name);
  return result.parsed?.data ?? result.stdout;
}

function callMcp(cli, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli.command, [...cli.argsPrefix, "mcp", "serve", "--profile", "readonly"], {
      cwd: cliRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32" && cli.argsPrefix.length === 0,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stderrText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(`MCP readonly exited with ${code}: ${stderrText}`));
        return;
      }
      try {
        const responses = Buffer.concat(stdout)
          .toString("utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        resolvePromise({ code, responses, stderr: stderrText });
      } catch (error) {
        reject(error);
      }
    });

    for (const request of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    child.stdin.end();
  });
}

function createEnvironmentEvidence(options, cliPath) {
  return {
    evidenceType: "packaged-platform",
    platform: options.platform,
    processPlatform: process.platform,
    arch: process.arch,
    node: process.version,
    cliPath,
    packageSource: options.packageSource,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.packageSource) throw new Error("Pass --package-source <label>.");

  const cliPath = resolveInputPath(options.cli ?? defaultBinPath);
  const cli = commandForCli(cliPath);
  const env = {
    ...process.env,
    ...(options.readanyHome ? { READANY_HOME: resolveInputPath(options.readanyHome) } : {}),
    ...(options.agentHome ? { AGENT_HOME: resolveInputPath(options.agentHome) } : {}),
  };
  const checks = [];
  const commands = [];

  const version = assertCommand(checks, commands, "version", runCli(cli, ["--version"], env));
  const doctor = assertCommand(checks, commands, "doctor", runCli(cli, ["doctor", "--json"], env));
  assertCommand(checks, commands, "tools.list", runCli(cli, ["tools", "list", "--json"], env));
  assertCommand(checks, commands, "mcp.config.generic", runCli(cli, ["mcp", "config", "--profile", "readonly", "--client", "generic", "--json"], env));
  assertCommand(checks, commands, "mcp.config.codex", runCli(cli, ["mcp", "config", "--profile", "readonly", "--client", "codex", "--json"], env));
  assertCommand(checks, commands, "skill.status", runCli(cli, ["skill", "status", "--json"], env));

  const mcp = await callMcp(cli, env);
  const initialize = mcp.responses[0];
  const toolsList = mcp.responses[1];
  if (initialize?.result?.serverInfo?.name !== "readany") {
    throw new Error("MCP initialize did not return readany serverInfo.");
  }
  if (!Array.isArray(toolsList?.result?.tools) || toolsList.result.tools.length === 0) {
    throw new Error("MCP tools/list returned no tools.");
  }
  checks.push("mcp.initialize.tools.list");
  commands.push({
    name: "mcp.initialize.tools.list",
    command: "readany mcp serve --profile readonly",
    status: mcp.code,
    ok: true,
    data: {
      serverName: initialize.result.serverInfo.name,
      toolCount: toolsList.result.tools.length,
      hasSafetyMetadata: toolsList.result.tools.every((tool) => tool._meta?.["readany/minimumProfile"]),
    },
  });

  let skillInstall;
  if (options.withSkillInstall) {
    assertCommand(checks, commands, "skill.install", runCli(cli, ["skill", "install", "--json"], env));
    skillInstall = assertCommand(checks, commands, "skill.status.afterInstall", runCli(cli, ["skill", "status", "--json"], env));
    assertCommand(checks, commands, "skill.uninstall", runCli(cli, ["skill", "uninstall", "--json"], env));
  }

  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: createEnvironmentEvidence(options, cliPath),
    commandSource: cli.display,
    readanyHome: env.READANY_HOME,
    agentHome: env.AGENT_HOME,
    version,
    doctor,
    skillInstall,
    mcp: {
      serverName: initialize.result.serverInfo.name,
      toolCount: toolsList.result.tools.length,
      hasSafetyMetadata: toolsList.result.tools.every((tool) => tool._meta?.["readany/minimumProfile"]),
    },
    checks,
    commands,
    summary: {
      platform: options.platform,
      packageSource: options.packageSource,
      commandCount: commands.length,
      checkCount: checks.length,
      skillInstallChecked: options.withSkillInstall,
      builtBundle: doctor.distribution?.builtBundle === true,
      desktopResourceBundle: doctor.distribution?.desktopResourceBundle === true,
      nativeBinary: doctor.distribution?.nativeBinary === true,
      usesNodeRuntime: doctor.distribution?.usesNodeRuntime === true,
    },
    manualAcceptanceRequired: [
      {
        id: "desktop-settings",
        label: "Capture the desktop External AI settings page showing this platform doctor runtime/distribution evidence.",
        evidence: [
          "settings page screenshot for runtime/distribution evidence",
          "CLI install/uninstall or repair operation log from packaged app",
          "readonly/editor/publisher MCP config copy confirmation",
        ],
        commands: [
          "readany doctor --json",
          "readany mcp config --client generic --profile readonly --json",
        ],
      },
      {
        id: "draft-export",
        label: "Run a real EPUB draft validate/export flow from the packaged app or installed CLI on this platform.",
        evidence: [
          "real EPUB draft id",
          "validate result",
          "export path and exported EPUB open/reimport result",
        ],
        commands: [
          "readany epub draft create <book-id> --profile editor --json",
          "readany epub validate <draft-id> --profile publisher --json",
          "readany epub export <draft-id> --output <path> --profile publisher --json",
        ],
      },
    ],
  };

  if (options.evidencePath) {
    const evidencePath = resolveInputPath(options.evidencePath);
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    evidencePath: options.evidencePath ? resolveInputPath(options.evidencePath) : undefined,
    summary: evidence.summary,
    manualAcceptanceRequired: evidence.manualAcceptanceRequired.map((item) => item.id),
  }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
