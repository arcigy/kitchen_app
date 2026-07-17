import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trackedGitlinks(): string[] {
  const index = execFileSync("git", ["ls-files", "--stage"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  return index
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1))
    .filter(Boolean);
}

function configuredSubmodulePaths(): Set<string> {
  const modulesPath = path.join(repositoryRoot, ".gitmodules");
  if (!existsSync(modulesPath)) {
    return new Set();
  }

  const configured = new Set<string>();
  const modules = readFileSync(modulesPath, "utf8");
  for (const match of modules.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gmu)) {
    configured.add(match[1].replaceAll("\\", "/"));
  }
  return configured;
}

describe("repository Git metadata", () => {
  it("does not track orphan gitlinks that break checkout cleanup", () => {
    const configured = configuredSubmodulePaths();
    const orphaned = trackedGitlinks()
      .map((gitlink) => gitlink.replaceAll("\\", "/"))
      .filter((gitlink) => !configured.has(gitlink));

    expect(orphaned).toEqual([]);
  });
});
