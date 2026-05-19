import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOTS = ["src/app", "src/ui", "src/layout", "src/modules", "src/lib"];
const PROJECT_FILE_RUNTIME_ROOTS = ["src/app", "src/ui", "src/server", "src/core/project", "src/core/project-save"];

async function listFiles(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("project file security boundary", () => {
  it("keeps PROJECT_FILE_SECRET out of frontend runtime code", async () => {
    const files = (await Promise.all(FRONTEND_ROOTS.map(listFiles))).flat();
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (source.includes("PROJECT_FILE_SECRET") || source.includes("project-save-crypto")) offenders.push(path.relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps legacy project file names and magic out of runtime code", async () => {
    const files = (await Promise.all(PROJECT_FILE_RUNTIME_ROOTS.map(listFiles))).flat();
    const offenders: string[] = [];
    for (const file of files) {
      if (/(\.test|\.spec)\.(ts|tsx|mjs|js)$/.test(file)) continue;
      const source = await readFile(file, "utf-8");
      if (source.includes(".kitchenproj") || source.includes("KITCHEN_APP_ENCRYPTED_PROJECT")) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
