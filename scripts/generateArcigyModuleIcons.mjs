import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requestedTargets() {
  const argument = process.argv.find((value) => value.startsWith("--only="));
  return argument ? argument.slice("--only=".length).split(",").map((value) => value.trim()).filter(Boolean) : [];
}

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a local renderer port."));
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for module icon renderer at ${url}`);
}

function chromeCandidates() {
  return [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (originalError) {
    for (const executablePath of chromeCandidates()) {
      try {
        return await chromium.launch({ headless: true, executablePath });
      } catch {
        // Try the next installed Chrome location.
      }
    }
    throw originalError;
  }
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Renderer did not return a PNG.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const port = await availablePort();
const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
let viteErrors = "";
vite.stderr.on("data", (chunk) => { viteErrors += String(chunk); });

let browser;
try {
  const url = `http://127.0.0.1:${port}/scripts/arcigyModuleIconRenderer.html`;
  await waitForServer(url);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.arcigyModuleIconRendererReady === true);
  const rendered = await page.evaluate(async (ids) => await window.renderArcigyModuleIcons(ids), requestedTargets());
  if (browserErrors.length > 0) throw new Error(`Module icon browser errors: ${browserErrors.join(" | ")}`);

  for (const icon of rendered) {
    if (!icon.hasTransparentBackground) {
      throw new Error(`${icon.id} does not have a transparent background.`);
    }
    const encoded = icon.dataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(encoded, "base64");
    const dimensions = pngDimensions(buffer);
    if (dimensions.width !== 640 || dimensions.height !== 640) {
      throw new Error(`${icon.id} rendered at ${dimensions.width}x${dimensions.height}, expected 640x640.`);
    }
    const outputPath = path.resolve(repoRoot, icon.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buffer);
    console.log(`${icon.id}: ${path.relative(repoRoot, outputPath)} (${buffer.length} bytes)`);
  }
} finally {
  await browser?.close();
  vite.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    vite.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  if (vite.exitCode && vite.exitCode !== 0 && viteErrors.trim()) console.error(viteErrors.trim());
}
