import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "../../..");
const defaultWorkspaceFile = "workspace.json";

export function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

export async function loadWorkspaceConfig(workspacePathInput) {
  const resolved = resolveInputPath(workspacePathInput);
  const workspaceFile = resolved.endsWith(".json") ? resolved : resolve(resolved, defaultWorkspaceFile);
  const workspace = JSON.parse(await readFile(workspaceFile, "utf8"));
  return {
    workspaceFile,
    workspace,
  };
}

export function workspaceEvidenceFiles(workspace) {
  return [
    workspace?.evidenceFiles?.realSample,
    workspace?.evidenceFiles?.agentCodex,
    workspace?.evidenceFiles?.agentSecondClient,
    workspace?.evidenceFiles?.desktopSettings,
    workspace?.evidenceFiles?.packagedMacos,
    workspace?.evidenceFiles?.packagedWindows,
    workspace?.evidenceFiles?.packagedLinux,
  ].filter(Boolean);
}

export function workspaceRecordPath(workspace) {
  return workspace?.paths?.recordPath;
}

export function workspaceFinalManifestPath(workspace) {
  return workspace?.outputs?.finalManifestPath;
}

export function workspaceBundleDir(workspace) {
  return workspace?.outputs?.bundleDir ?? workspace?.paths?.bundleDir;
}

export async function filterExistingPaths(paths) {
  const existing = [];
  for (const path of paths) {
    try {
      await access(path);
      existing.push(path);
    } catch {
      // Missing evidence is fine here; readiness/strict validation should report the gap.
    }
  }
  return existing;
}
