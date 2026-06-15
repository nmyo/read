import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSkillStatus, installSkill, uninstallSkill } from "./skill.js";

describe("skill management", () => {
  it("installs, reports, and uninstalls a managed skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-skill-"));
    const skillFile = join(root, "skills", "readany", "SKILL.md");

    expect(await getSkillStatus(skillFile)).toMatchObject({
      installed: false,
      path: skillFile,
    });

    const installed = await installSkill(skillFile);
    expect(installed).toMatchObject({ installed: true, path: skillFile });

    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("readany-cli-managed");
    expect(content).toContain("readany mcp serve --profile readonly");

    expect(await getSkillStatus(skillFile)).toMatchObject({
      installed: true,
      path: skillFile,
    });

    expect(await uninstallSkill(skillFile)).toEqual({
      removed: true,
      path: skillFile,
    });
    expect(await getSkillStatus(skillFile)).toMatchObject({ installed: false });
  });
});
