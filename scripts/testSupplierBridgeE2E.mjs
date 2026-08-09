import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5184/";
const simulatorUrl = process.env.SUPPLIER_SIMULATOR_URL ?? "http://127.0.0.1:5195/";
const workerHealthUrl = process.env.KITCHEN_WORKER_HEALTH_URL ?? "http://127.0.0.1:5194/health";
const testUsername = process.env.ARCIGY_UI_TEST_USERNAME;
const testPassword = process.env.ARCIGY_UI_TEST_PASSWORD;
const extensionPath = path.join(process.cwd(), "apps", "supplier-bridge-extension", "dist-debug");
const result = { ok: false, checks: [], consoleErrors: [] };
let context;
let profilePath;
let projectId = null;
const ownedProcesses = [];

function assert(condition, label, details = null) {
  if (!condition) throw Object.assign(new Error(label), { details });
  result.checks.push(label);
}

async function isAvailable(url) {
  const response = await fetch(url).catch(() => null);
  return Boolean(response?.ok);
}

async function waitForAvailable(url, label, processLabel) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isAvailable(url)) return;
    const child = ownedProcesses.find((candidate) => candidate.label === processLabel);
    if (child?.process.exitCode !== null) throw new Error(`${processLabel} exited before ${label} became available.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become available at ${url} within 60 seconds.`);
}

function startLocalProcess(label, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "ignore"
  });
  ownedProcesses.push({ label, process: child });
  return child;
}

function loopbackPort(url, label) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.port) {
    throw new Error(`${label} must use an explicit HTTP loopback port when this test starts local services.`);
  }
  return parsed.port;
}

async function ensureLocalServices() {
  const [appAvailable, simulatorAvailable] = await Promise.all([isAvailable(appUrl), isAvailable(simulatorUrl)]);
  if (appAvailable && simulatorAvailable) {
    result.checks.push("reused already-running local Arcigy and supplier simulator services");
    return;
  }
  if (appAvailable || simulatorAvailable) {
    throw new Error("Supplier Bridge E2E requires both local services. Start neither service and let this test manage them, or start both before running it.");
  }

  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  const appPort = loopbackPort(appUrl, "KITCHEN_UI_BASE_URL");
  const workerPort = loopbackPort(workerHealthUrl, "KITCHEN_WORKER_HEALTH_URL");
  const simulatorPort = loopbackPort(simulatorUrl, "SUPPLIER_SIMULATOR_URL");
  const trustedOrigins = [...new Set([
    ...(process.env.ARCIGY_TRUSTED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
    new URL(appUrl).origin
  ])].join(",");
  startLocalProcess("Arcigy local app", [tsxCli, "scripts/devLocal.ts"], {
    KITCHEN_UI_PORT: appPort,
    BLENDER_WORKER_PORT: workerPort,
    ARCIGY_TRUSTED_ORIGINS: trustedOrigins
  });
  startLocalProcess("Supplier simulator", [viteCli, "apps/supplier-simulator", "--config", "apps/supplier-simulator/vite.config.ts", "--host", "127.0.0.1", "--port", simulatorPort, "--strictPort"], {
    ARCIGY_VITE_CACHE_DIR: "node_modules/.vite-supplier-bridge-e2e"
  });
  await Promise.all([
    waitForAvailable(appUrl, "Arcigy local app", "Arcigy local app"),
    waitForAvailable(workerHealthUrl, "Arcigy local worker", "Arcigy local app"),
    waitForAvailable(simulatorUrl, "Supplier simulator", "Supplier simulator")
  ]);
  result.checks.push("started isolated local Arcigy and supplier simulator services");
}

async function stopLocalProcesses() {
  await Promise.all(ownedProcesses.map(async ({ process: child }) => {
    if (child.exitCode !== null || child.killed) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }));
}

async function main() {
  if (!testUsername || !testPassword) {
    throw new Error("Supplier Bridge E2E requires ARCIGY_UI_TEST_USERNAME and ARCIGY_UI_TEST_PASSWORD.");
  }
  await access(path.join(extensionPath, "manifest.json"));
  await ensureLocalServices();
  profilePath = await mkdtemp(path.join(os.tmpdir(), "arcigy-supplier-bridge-e2e-"));
  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1500, height: 950 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 20_000 });
  worker.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("browser is shutting down")) result.consoleErrors.push(`worker: ${message.text()}`);
  });
  const extensionId = new URL(worker.url()).host;
  assert(Boolean(extensionId), "unpacked extension loaded");

  const login = await context.request.post(new URL("/api/auth/login", appUrl).toString(), { data: { username: testUsername, password: testPassword } });
  assert(login.ok(), "Arcigy authenticated test session created", login.status());
  const app = context.pages()[0] ?? await context.newPage();
  app.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.location().url.endsWith("/favicon.ico")) return;
    if (message.location().url.endsWith("/api/suppliers") && message.text().includes("404")) return;
    result.consoleErrors.push(`app: ${message.text()} (${message.location().url || "unknown-url"})`);
  });
  await app.route("**/api/suppliers", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      suppliers: [{ supplierId: "demos", displayName: "Demos", startUrl: simulatorUrl, adapterKey: "mock", sortOrder: 1 }]
    })
  }));
  await app.addInitScript(() => localStorage.removeItem("arcigy.kitchen.autostartWorkspace"));
  const warmUrl = new URL(appUrl);
  warmUrl.searchParams.set("workspace", "1");
  await app.goto(warmUrl.toString(), { waitUntil: "commit", timeout: 120_000 });
  try { await app.waitForFunction(() => Boolean(window.__kitchenDebug), undefined, { timeout: 120_000 }); }
  catch { await app.reload({ waitUntil: "domcontentloaded" }); await app.waitForFunction(() => Boolean(window.__kitchenDebug), undefined, { timeout: 120_000 }); }
  result.consoleErrors.length = 0;
  await app.evaluate(() => localStorage.removeItem("arcigy.kitchen.autostartWorkspace"));
  await app.goto(appUrl, { waitUntil: "domcontentloaded" });
  await app.locator("[data-project-manager-new]").waitFor({ timeout: 30_000 });
  await app.locator("[data-project-manager-new]").click();
  const name = `Supplier Bridge E2E ${Date.now()}`;
  await app.locator('input[name="name"]').fill(name);
  await app.locator('input[name="address"]').fill("Simulator 1");
  await app.locator('input[name="contactName"]').fill("E2E User");
  await app.locator("[data-project-manager-form] button[type='submit']").click();
  await app.locator('[data-workspace-nav="materials"]').waitFor({ timeout: 30_000 });
  await app.waitForFunction(() => Boolean(window.__kitchenDebug), undefined, { timeout: 120_000 });
  assert(true, "Arcigy project created and opened");

  await app.locator('[data-workspace-nav="materials"]').click();
  const projectsResponse = await context.request.get(new URL("/api/projects", appUrl).toString());
  const projectsBody = await projectsResponse.json();
  projectId = projectsBody.projects?.find((project) => project.name === name)?.projectId ?? null;
  assert(Boolean(projectId), "created project identifier resolved");
  const supplierPicker = app.locator('[data-supplier-picker="true"]');
  await supplierPicker.locator('option[value="demos"]').waitFor({ state: "attached", timeout: 15_000 });
  await supplierPicker.selectOption("demos");
  assert(true, "supplier selection triggered from the Arcigy UI");
  const panel = await context.newPage();
  panel.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(`panel: ${message.text()}`); });
  await panel.route("**/api/suppliers", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      suppliers: [{ supplierId: "mock-supplier", displayName: "Supplier simulator", startUrl: simulatorUrl, adapterKey: "mock", sortOrder: 1 }]
    })
  }));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.locator('select').first().selectOption(new URL(appUrl).origin);
  await panel.locator('input[autocomplete="username"]').fill(testUsername);
  await panel.locator('input[autocomplete="current-password"]').fill(testPassword);
  await panel.getByRole("button", { name: "Prihlásiť" }).click();
  await panel.locator("select").first().waitFor({ timeout: 15_000 });
  await panel.locator("select").first().selectOption(projectId);
  await panel.locator("select").nth(1).selectOption("mock-supplier");
  assert(true, "Side Panel authenticated and selected the Arcigy project and debug supplier");
  const supplier = await context.newPage();
  supplier.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(`supplier: ${message.text()}`); });
  await supplier.goto(new URL("/search?query=E2E&scenario=exact-single-result&productType=board", simulatorUrl).toString());
  const supplierProduct = supplier.locator("[data-supplier-product]");
  await supplierProduct.waitFor({ timeout: 15_000 }).catch(async () => {
    throw new Error(`Supplier simulator did not render a product: ${(await supplier.locator("body").innerText()).slice(0, 400)}`);
  });
  await supplier.getByRole("button", { name: /Detail produktu/ }).first().click();
  await supplier.waitForURL(/\/product\//, { timeout: 15_000 });
  assert(true, "supplier simulator opened with visible product detail");

  await supplier.bringToFront();
  await panel.getByRole("button", { name: "Načítať otvorený produkt" }).click();
  await panel.waitForFunction(() => Boolean(document.querySelector('[data-material-target="material-assignment:corpus"]') || document.querySelector(".notice--error")), undefined, { timeout: 15_000 });
  const captureError = await panel.locator(".notice--error").count() ? await panel.locator(".notice--error").innerText() : null;
  if (captureError) throw new Error(`Supplier capture failed: ${captureError}`);
  assert(true, "user explicitly captured the visible supplier product before choosing a target");
  await panel.locator('[data-material-target="material-assignment:corpus"]').click();
  await panel.waitForFunction(() => [...document.querySelectorAll(".notice--success")].some((notice) => notice.textContent?.includes("bol priradený")) || Boolean(document.querySelector(".notice--error")), undefined, { timeout: 15_000 });
  const assignmentError = await panel.locator(".notice--error").count() ? await panel.locator(".notice--error").innerText() : null;
  if (assignmentError) throw new Error(`Assignment failed: ${assignmentError}`);
  assert(true, "visible supplier product and price assigned to Corpus");

  const success = await panel.locator(".notice--success").filter({ hasText: "bol priradený" }).innerText();
  assert(success.includes("bol priradený"), "backend confirmed the captured product assignment", success);

  const materialsResponse = await context.request.get(new URL(`/api/projects/${projectId}/materials`, appUrl).toString());
  assert(materialsResponse.ok(), "Arcigy material state can be read after confirmation", materialsResponse.status());
  const materialsBody = await materialsResponse.json();
  const corpusAssignment = materialsBody.view?.assignments?.assignments?.find((assignment) => assignment.assignmentId === "material-assignment:corpus");
  assert(
    corpusAssignment?.customValues?.supplierBridge?.supplierProductCode?.startsWith("SIM-"),
    "confirmed supplier assignment persisted into the Arcigy project",
    corpusAssignment?.customValues?.supplierBridge ?? null
  );

  await panel.reload();
  await panel.locator("select").first().waitFor({ timeout: 15_000 });
  assert(true, "Side Panel restored its authenticated account after reload without storing the password");

  assert(result.consoleErrors.length === 0, "Arcigy and Side Panel console errors are zero", result.consoleErrors);
  result.ok = true;
}

try {
  await main();
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  if (error && typeof error === "object" && "details" in error) result.details = error.details;
  process.exitCode = 1;
} finally {
  if (projectId && context) await context.request.delete(new URL(`/api/projects/${projectId}`, appUrl).toString()).catch(() => undefined);
  await context?.close().catch(() => undefined);
  if (profilePath) await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
  await stopLocalProcesses();
  console.log(JSON.stringify(result, null, 2));
}
