import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_SCANNED_FILE_BYTES = 64 * 1024 * 1024;
const ALLOW_MARKER = "secret-scan: allow";

type SecretRule = {
  id: string;
  pattern: RegExp;
  capturedValue?: number;
  skipGenericFixtureValues?: boolean;
};

const SECRET_RULES: SecretRule[] = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { id: "gitlab-token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: "stripe-live-key", pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g },
  { id: "sendgrid-key", pattern: /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}\b/g },
  { id: "npm-token", pattern: /\bnpm_[0-9A-Za-z]{24,}\b/g },
  {
    id: "connection-string-credential",
    pattern: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql):\/\/[^:\s/]+:([^@\s/]{8,})@/gi,
    capturedValue: 1,
    skipGenericFixtureValues: true
  },
  {
    id: "generic-secret-assignment",
    pattern: /\b(?:api[_-]?key|client[_-]?secret|private[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{20,})["'`]?/gi,
    capturedValue: 1,
    skipGenericFixtureValues: true
  }
];

const PLACEHOLDER_PARTS = [
  "changeme",
  "dummy",
  "example",
  "fake",
  "not-a-real",
  "placeholder",
  "redacted",
  "replace-me",
  "replace_me",
  "test-only",
  "your-",
  "your_"
];

export type SecretFinding = {
  filePath: string;
  line: number;
  ruleId: string;
};

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes("${") || normalized.includes("<") || PLACEHOLDER_PARTS.some((part) => normalized.includes(part));
}

export function scanTextForSecrets(filePath: string, source: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  const lines = source.split(/\r?\n/);
  const fixtureFile = /(?:^|\/)(?:fixtures?|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(filePath.replaceAll("\\", "/"));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.toLowerCase().includes(ALLOW_MARKER)) continue;

    for (const rule of SECRET_RULES) {
      if (fixtureFile && rule.skipGenericFixtureValues) continue;
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line)) !== null) {
        if (rule.capturedValue && looksLikePlaceholder(match[rule.capturedValue])) continue;
        const key = `${index + 1}:${rule.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ filePath, line: index + 1, ruleId: rule.id });
        }
        if (match[0].length === 0) rule.pattern.lastIndex += 1;
      }
    }
  }

  return findings;
}

function isProbablyBinary(data: Buffer): boolean {
  const sampleLength = Math.min(data.byteLength, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (data[index] === 0) return true;
  }
  return false;
}

export async function scanTrackedSecrets(root = process.cwd()): Promise<{ findings: SecretFinding[]; scannedFiles: number }> {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024
  });
  const filePaths = output.toString("utf-8").split("\0").filter(Boolean);
  const findings: SecretFinding[] = [];
  let scannedFiles = 0;

  for (const relativePath of filePaths) {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    const absolutePath = path.resolve(root, relativePath);
    let metadata;
    try {
      metadata = await stat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!metadata.isFile()) continue;
    if (metadata.size > MAX_SCANNED_FILE_BYTES) {
      findings.push({ filePath: normalizedPath, line: 1, ruleId: "unscanned-large-file" });
      continue;
    }

    const data = await readFile(absolutePath);
    if (isProbablyBinary(data)) continue;
    scannedFiles += 1;
    findings.push(...scanTextForSecrets(normalizedPath, data.toString("utf-8")));
  }

  return { findings, scannedFiles };
}

async function main(): Promise<void> {
  const result = await scanTrackedSecrets();
  if (result.findings.length === 0) {
    console.log(`Tracked secret scan passed (${result.scannedFiles} text files).`);
    return;
  }

  console.error(`Tracked secret scan failed with ${result.findings.length} finding(s). Values are intentionally omitted.`);
  for (const finding of result.findings) {
    console.error(`- ${finding.filePath}:${finding.line} [${finding.ruleId}]`);
  }
  process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) void main();
