import { chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(scriptDir, "../dist/bin/readany.js");

if (existsSync(binPath)) {
  chmodSync(binPath, 0o755);
}
