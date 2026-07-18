import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const appUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const simulatorUrl = process.env.SUPPLIER_SIMULATOR_URL ?? "http://127.0.0.1:5192/";
const extensionPath = path.join(process.cwd(), "apps", "supplier-bridge-extension", "dist-debug");
const result = { ok: false, checks: [], consoleErrors: [] };
let context;
let profilePath;
let projectId = null;

function assert(condition, label, details = null) {
  if (!condition) throw Object.assign(new Error(label), { details });
  result.checks.push(label);
}

async function available(url, label) {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) throw new Error(`${label} is not running at ${url}`);
}

async function main() {
  await access(path.join(extensionPath, "manifest.json"));
  await available(appUrl, "Arcigy local app");
  await available(simulatorUrl, "Supplier simulator");
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

  const login = await context.request.post(new URL("/api/auth/login", appUrl).toString(), { data: { username: process.env.ARCIGY_UI_TEST_USERNAME ?? "arcigy", password: process.env.ARCIGY_UI_TEST_PASSWORD ?? "kitchen2026" } });
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
  await app.goto(warmUrl.toString(), { waitUntil: "domcontentloaded" });
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
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.locator(".project-context").waitFor({ timeout: 15_000 });
  const started = await panel.evaluate(async () => (await chrome.storage.local.get("arcigySupplierBridgeProgress")).arcigySupplierBridgeProgress);
  assert(started?.view?.session?.projectId === projectId, "Side Panel displays the selected Arcigy project", started);
  assert(started?.trace?.some((entry) => entry.stage === "Otvorenie panelu"), "supplier launch records the Side Panel opening result", started?.trace);
  const sessionResponse = await context.request.post(new URL(`/api/projects/${projectId}/supplier-sync-sessions`, appUrl).toString(), { data: { supplierId: "mock-supplier", projectId, lookups: [] } });
  const sessionBody = await sessionResponse.json();
  assert(sessionResponse.ok() && Boolean(sessionBody.bridgeToken && sessionBody.view?.session?.id), "mock supplier session created for automated capture test");
  const startResult = await app.evaluate(({ sessionId, bridgeToken, projectLabel }) => new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const timeout = window.setTimeout(() => resolve({ ok: false, errorCode: "TIMEOUT" }), 10_000);
    const onMessage = (event) => {
      const value = event.data;
      if (event.source !== window || value?.source !== "ARCIGY_EXTENSION" || value?.type !== "SUPPLIER_BRIDGE_RESULT" || value?.requestId !== requestId || value?.nonce !== nonce) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "ARCIGY_WEB", type: "START_SUPPLIER_SESSION", requestId, nonce, sessionId, bridgeToken, projectLabel }, window.location.origin);
  }), { sessionId: sessionBody.view.session.id, bridgeToken: sessionBody.bridgeToken, projectLabel: name });
  assert(startResult.ok === true, "extension accepted supplier session", startResult);
  assert(true, "Arcigy created and attached supplier session");
  const supplier = context.pages().find((page) => page.url().startsWith(simulatorUrl.slice(0, -1)))
    ?? await context.waitForEvent("page", { predicate: (page) => page.url().startsWith(simulatorUrl.slice(0, -1)), timeout: 15_000 });
  supplier.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(`supplier: ${message.text()}`); });
  await supplier.locator("[data-supplier-product]").waitFor({ timeout: 15_000 });
  await supplier.getByRole("button", { name: /Detail produktu/ }).first().click();
  await supplier.waitForURL(/\/product\//, { timeout: 15_000 });
  assert(true, "supplier simulator opened with visible product detail");

  await supplier.bringToFront();
  await panel.bringToFront();
  await panel.locator('[data-sidepanel-action="choose-target"]').click();
  await panel.locator('[data-material-target="corpus"]').click();
  await panel.waitForFunction(() => Boolean(document.querySelector(".notice") || document.querySelector(".notice--error")), undefined, { timeout: 15_000 });
  const captureError = await panel.locator(".notice--error").count() ? await panel.locator(".notice--error").innerText() : null;
  if (captureError) throw new Error(`Capture failed: ${captureError}`);
  assert(true, "visible supplier product and price assigned to Corpus");

  const stored = await panel.evaluate(async () => (await chrome.storage.local.get("arcigySupplierBridgeProgress")).arcigySupplierBridgeProgress);
  projectId = stored?.view?.session?.projectId ?? projectId;
  const sessionId = stored?.sessionId ?? null;
  assert(Boolean(projectId && sessionId), "extension progress restored from backend identifiers");
  const backendStatus = await context.request.get(new URL(`/api/projects/${projectId}/supplier-sync-sessions/${sessionId}`, appUrl).toString());
  const statusBody = await backendStatus.json();
  assert(backendStatus.ok() && statusBody.view.items.some((item) => item.status === "confirmed" && item.selectedCandidateId) && statusBody.view.candidates.length > 0, "backend stored the confirmed material assignment", statusBody.view);

  await app.bringToFront();
  await app.locator('[data-workspace-nav="materials"]').click();
  const materialHtml = await app.locator("#materialsPhase").innerText();
  assert(materialHtml.includes("Korpus"), "Arcigy Materials UI keeps the assigned material group visible");

  const cdp = await context.newCDPSession(panel);
  const targets = await cdp.send("Target.getTargets");
  const serviceTarget = targets.targetInfos.find((target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${extensionId}/`));
  if (!serviceTarget) throw new Error("Extension service worker target was not found.");
  await cdp.send("Target.closeTarget", { targetId: serviceTarget.targetId });
  await panel.reload();
  await panel.locator(".project-context").waitFor({ timeout: 15_000 });
  const restored = await panel.evaluate(async () => (await chrome.storage.local.get("arcigySupplierBridgeProgress")).arcigySupplierBridgeProgress);
  assert(restored.sessionId === sessionId && restored.view.counts.completed === stored.view.counts.completed, "service worker restart restores assigned material without duplicates");

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
  console.log(JSON.stringify(result, null, 2));
}
