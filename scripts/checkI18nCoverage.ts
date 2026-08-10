import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Node, Project, SyntaxKind } from "ts-morph";
import { hasSystemTranslation } from "../src/i18n/index";

const root = process.cwd();
const roots = ["src", "apps"];
const project = new Project({ skipAddingFilesFromTsConfig: true });
const failures: string[] = [];
let sourceFiles = 0;
let translationKeys = 0;
let userFacingAssignments = 0;

type ChangedLines = Map<string, Array<{ start: number; end: number }>>;

function changedLineRanges(): ChangedLines {
  const output = execFileSync("git", ["diff", "--unified=0", "origin/develop", "--", "src", "apps"], { cwd: root, encoding: "utf8" });
  const ranges: ChangedLines = new Map();
  let current: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    const file = line.match(/^\+\+\+ b\/(.+)$/);
    if (file) { current = file[1] ?? null; continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!hunk || !current) continue;
    const start = Number(hunk[1]);
    const count = Number(hunk[2] ?? "1");
    if (count > 0) ranges.set(current, [...(ranges.get(current) ?? []), { start, end: start + count - 1 }]);
  }
  for (const untracked of execFileSync("git", ["ls-files", "--others", "--exclude-standard", "src", "apps"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean)) {
    ranges.set(untracked.replaceAll("\\", "/"), [{ start: 1, end: Number.MAX_SAFE_INTEGER }]);
  }
  return ranges;
}

const changed = changedLineRanges();
function isChanged(file: string, line: number) {
  return changed.get(file)?.some((range) => line >= range.start && line <= range.end) ?? false;
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : walk(file);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function relative(fileName: string) {
  return path.relative(root, fileName).replaceAll("\\", "/");
}

function isAllowedNonUiLiteral(value: string) {
  return value.length === 0
    || /^[\w./:@#?&=\-]+$/.test(value)
    || value.startsWith("data-")
    || value.startsWith("aria-")
    || value.startsWith("http")
    || value.startsWith("/")
    || value.includes("${");
}

function isI18nOwned(node: Node) {
  return !!node.getFirstAncestor((ancestor) => {
    if (!Node.isCallExpression(ancestor)) return false;
    const callee = ancestor.getExpression().getText();
    return ["t", "message", "assistantCopy", "extensionCopy", "simulatorCopy", "chatbotCopy"].includes(callee);
  });
}

for (const directory of roots) {
  for (const fileName of walk(path.join(root, directory))) project.addSourceFileAtPath(fileName);
}

for (const sourceFile of project.getSourceFiles()) {
  sourceFiles += 1;
  const file = relative(sourceFile.getFilePath());
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    if (callee !== "t" && callee !== "message") continue;
    if (!isChanged(file, call.getStartLineNumber())) continue;
    const argument = call.getArguments()[0];
    if (!argument || !Node.isStringLiteral(argument) && !Node.isNoSubstitutionTemplateLiteral(argument)) {
      if (callee === "t") continue; // t(key) is allowed only inside the typed message formatter.
      failures.push(`${file}:${call.getStartLineNumber()}: t() requires a static source key for parity validation`);
      continue;
    }
    translationKeys += 1;
    const key = argument.getLiteralText();
    for (const language of ["sk", "cs"] as const) {
      if (!hasSystemTranslation(language, key)) failures.push(`${file}:${call.getStartLineNumber()}: missing ${language} translation for ${JSON.stringify(key)}`);
    }
  }

  for (const binary of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (!["textContent", "innerHTML", "title", "placeholder"].some((property) => binary.getLeft().getText().endsWith(`.${property}`))) continue;
    if (!isChanged(file, binary.getStartLineNumber())) continue;
    const right = binary.getRight();
    if (isI18nOwned(right)) continue;
    const literal = Node.isStringLiteral(right) || Node.isNoSubstitutionTemplateLiteral(right) ? right.getLiteralText() : null;
    if (!literal || isAllowedNonUiLiteral(literal)) continue;
    userFacingAssignments += 1;
    failures.push(`${file}:${right.getStartLineNumber()}: user-facing ${binary.getLeft().getText()} must use t()/an owned locale copy`);
  }
}

if (failures.length) {
  throw new Error(`i18n coverage failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
}

console.log(`i18n coverage passed: ${translationKeys} catalogued keys across ${sourceFiles} source files; ${userFacingAssignments} raw UI assignments.`);
