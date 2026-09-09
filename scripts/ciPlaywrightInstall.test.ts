import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    { sourceExists: true, installerExit: 0 },
    { sourceExists: true, installerExit: 23 },
    { sourceExists: false, installerExit: 0 },
  ])("restores the optional feed and preserves installer status: %j", ({ sourceExists, installerExit }) => {
    const fixture = mkdtempSync(path.join(tmpdir(), "arcigy-ci-browser-"));
    const source = path.join(fixture, "google-chrome.list");
    const invocation = path.join(fixture, "installer-args.txt");
    const original = "deb https://dl.google.com/linux/chrome-stable/deb stable main\n";
    if (sourceExists) writeFileSync(source, original);
    try {
      // Only the fixed system path is redirected into a disposable fixture.
      // sudo and npx are shell functions: no elevated operation or download runs.
      const script = `
sudo() { "$@"; }
npx() {
  if [[ -f ${quote(shellPath(source))} ]]; then return 42; fi
  printf '%s\\n' "$@" > ${quote(shellPath(invocation))}
  return ${installerExit}
}
export RUNNER_TEMP=${quote(shellPath(fixture))}
${command.replace("/etc/apt/sources.list.d/google-chrome.list", quote(shellPath(source)))}`;
      const result = spawnSync(bash, ["--noprofile", "--norc", "-c", script], { encoding: "utf8", timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(installerExit);
      expect(readFileSync(invocation, "utf8").trim().split("\n")).toEqual(["playwright", "install", "--with-deps", "chromium"]);
      expect(existsSync(source)).toBe(sourceExists);
      if (sourceExists) expect(readFileSync(source, "utf8")).toBe(original);
      expect(existsSync(path.join(fixture, "arcigy-google-chrome.list"))).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
