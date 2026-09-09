import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8").replace(/\r\n/g, "\n");
const step = workflow.split("      - name: Install Playwright Chromium\n")[1]?.split("\n      - name:")[0];
if (!step) throw new Error("Missing Playwright installation step");
const command = step.startsWith("        run: |\n")
  ? step.slice("        run: |\n".length).replace(/^ {10}/gm, "")
  : step.replace(/^        run: /, "").trim();
const bash = process.platform === "win32"
  ? path.join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
  : "bash";
const shellPath = (value: string) => value.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`);
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

describe("CI Playwright installation", () => {
  it.each([
    { sourceNames: ["google-chrome.list"], installerExit: 0 },
    { sourceNames: ["google-chrome.sources"], installerExit: 0 },
    { sourceNames: ["google-chrome.sources"], installerExit: 23 },
    { sourceNames: ["chrome-stable.sources", "chrome-extra.list"], installerExit: 0 },
    { sourceNames: [], installerExit: 0 },
  ])("restores the optional feed and preserves installer status: %j", ({ sourceNames, installerExit }) => {
    const fixture = mkdtempSync(path.join(tmpdir(), "arcigy-ci-browser-"));
    const sources = path.join(fixture, "sources.list.d");
    mkdirSync(sources);
    const invocation = path.join(fixture, "installer-args.txt");
    const original = (name: string) => name.endsWith(".sources")
      ? "Types: deb\nURIs: https://dl.google.com/linux/chrome-stable/deb\nSuites: stable\nComponents: main\n"
      : "deb https://dl.google.com/linux/chrome/deb/ stable main\n";
    for (const name of sourceNames) writeFileSync(path.join(sources, name), original(name));
    const ubuntu = path.join(sources, "ubuntu.sources");
    writeFileSync(ubuntu, "URIs: http://archive.ubuntu.com/ubuntu\n");
    try {
      // Only the system sources directory is redirected into a disposable fixture.
      // sudo and npx are shell functions: no elevated operation or download runs.
      const script = `
sudo() { "$@"; }
npx() {
  for source in ${quote(shellPath(sources))}/*.list ${quote(shellPath(sources))}/*.sources; do
    if [[ -f "$source" ]] && grep -q 'dl.google.com' "$source"; then return 42; fi
  done
  if [[ ! -f ${quote(shellPath(ubuntu))} ]]; then return 43; fi
  printf '%s\\n' "$@" > ${quote(shellPath(invocation))}
  return ${installerExit}
}
export RUNNER_TEMP=${quote(shellPath(fixture))}
${command.replaceAll("/etc/apt/sources.list.d", quote(shellPath(sources)))}`;
      const result = spawnSync(bash, ["--noprofile", "--norc", "-c", script], { encoding: "utf8", timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(installerExit);
      expect(readFileSync(invocation, "utf8").trim().split("\n")).toEqual(["playwright", "install", "--with-deps", "chromium"]);
      expect(readdirSync(sources).sort()).toEqual([...sourceNames, "ubuntu.sources"].sort());
      for (const name of sourceNames) expect(readFileSync(path.join(sources, name), "utf8")).toBe(original(name));
      expect(readFileSync(ubuntu, "utf8")).toBe("URIs: http://archive.ubuntu.com/ubuntu\n");
      for (const backup of readdirSync(fixture).filter(name => name.startsWith("arcigy-chrome-sources."))) {
        expect(readdirSync(path.join(fixture, backup))).toEqual([]);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
