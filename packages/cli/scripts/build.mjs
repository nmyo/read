import { build } from "esbuild";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outFile = resolve(rootDir, "dist/bin/readany.js");

await build({
  entryPoints: [resolve(rootDir, "src/bin/readany.ts")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["better-sqlite3"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});

await mkdir(resolve(rootDir, "dist/bin"), { recursive: true });
await chmod(outFile, 0o755);
