#!/usr/bin/env node
import { runCommand, parseCommand } from "../commands.js";
import { formatJson, formatText } from "../format.js";

const parsed = parseCommand(process.argv.slice(2));
const result = await runCommand(process.argv.slice(2));
const output = parsed.json ? formatJson(result) : formatText(result);

if (result.ok) {
  process.stdout.write(output);
} else {
  process.stderr.write(output);
  process.exitCode = 1;
}
