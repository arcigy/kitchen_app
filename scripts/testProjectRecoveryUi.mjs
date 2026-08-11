import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

// Recovery owns a dedicated default port pair so the UI-regression chain never
// accidentally validates an already-running developer server with a different
// source revision or browser-storage state. Callers can still override both.
const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5186/";
const workerHealthUrl = process.env.KITCHEN_WORKER_HEALTH_URL ?? "http://127.0.0.1:5197/health";
const result = { ok: false, baseUrl, checks: [], consoleErrors: [] };
const consoleMessages = [];
const ownedProcesses = [];
let browser;
let context;
let projectId = null;

function assert(condition, label, details = null) {
  if (!condition) throw Object.assign(new Error(label), { details });
  result.checks.push(label);
}

async function isAvailable(url) {
  return Boolean((await fetch(url).catch(() => null))?.ok);
}

function loopbackPort(url, label) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.port) {
    throw new Error(`${label} must use an explicit loopback HTTP port.`);
  }
  return parsed.port;
}

function startLocalProcess(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "ignore"
  });
  ownedProcesses.push({ label, process: child });
}

async function waitForAvailable(url, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isAvailable(url)) return;
    const failed = ownedProcesses.find((entry) => entry.process.exitCode !== null);
    if (failed) throw new Error(`${failed.label} exited before ${label} was ready.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} was not available at ${url}.`);
}

async function ensureLocalApp() {
  if (await isAvailable(baseUrl)) {
    result.checks.push("reused available local Arcigy app");
    return;
  }
  if (await isAvailable(workerHealthUrl)) throw new Error("Recovery UI test found only the worker port in use.");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const trustedOrigins = [...new Set([
    ...(process.env.ARCIGY_TRUSTED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    new URL(baseUrl).origin
  ])].join(",");
  startLocalProcess("Arcigy recovery test app", [tsxCli, "scripts/devLocal.ts"], {
    KITCHEN_UI_PORT: loopbackPort(baseUrl, "KITCHEN_UI_BASE_URL"),
    BLENDER_WORKER_PORT: loopbackPort(workerHealthUrl, "KITCHEN_WORKER_HEALTH_URL"),
    ARCIGY_TRUSTED_ORIGINS: trustedOrigins
  });
  await Promise.all([
    waitForAvailable(baseUrl, "Arcigy app"),
    waitForAvailable(workerHealthUrl, "Arcigy worker")
  ]);
  result.checks.push("started isolated local Arcigy app");
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

function collectConsoleErrors(page, label) {
  page.on("console", (message) => {
    consoleMessages.push(`${label}:${message.type()}: ${message.text()}`);
    if (message.type() !== "error") return;
    if (message.location().url.endsWith("/favicon.ico")) return;
    result.consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => result.consoleErrors.push(`${label}: ${error.message}`));
}

async function login() {
  const response = await context.request.post(new URL("/api/auth/login", baseUrl).toString(), {
    data: {
      username: process.env.ARCIGY_UI_TEST_USERNAME ?? "arcigy",
      password: process.env.ARCIGY_UI_TEST_PASSWORD ?? "kitchen2026"
    }
  });
  assert(response.ok(), "authenticated recovery test session", response.status());
}

async function waitForWorkspace(page) {
  try {
    await page.waitForFunction(() => Boolean(window.__kitchenDebug), undefined, { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector(".viewer-startup"), undefined, { timeout: 30_000 });
  } catch {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      bodyText: document.body.innerText.slice(0, 2_000),
      hasDebug: Boolean(window.__kitchenDebug),
      lastWorkspace: localStorage.getItem("arcigy.kitchen.lastWorkspace.v1")
    }));
    throw Object.assign(new Error("workspace did not finish loading"), { details: {
      ...diagnostics,
      consoleErrors: result.consoleErrors,
      consoleMessages: consoleMessages.slice(-20)
    } });
  }
}

async function waitForRecoveryWallCount(page, count) {
  const deadline = Date.now() + 10_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await readCurrentRecovery(page);
    if (
      latest?.walls === count
      && latest.writer?.ownerId === latest.lease?.ownerId
      && latest.writer?.fencingToken === latest.lease?.fencingToken
    ) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Object.assign(new Error(`current fenced recovery draft did not reach ${count} wall(s)`), { details: latest });
}

async function readCurrentRecovery(page) {
  return page.evaluate(async (expectedProjectId) => {
    const records = await new Promise((resolve) => {
      const request = indexedDB.open("arcigy-kitchen-project-recovery", 2);
      request.onerror = () => resolve([]);
      request.onupgradeneeded = () => { request.transaction?.abort(); resolve([]); };
      request.onsuccess = () => {
        const database = request.result;
        const getAll = database.transaction("active-drafts", "readonly").objectStore("active-drafts").getAll();
        getAll.onerror = () => { database.close(); resolve([]); };
        getAll.onsuccess = () => { const value = getAll.result; database.close(); resolve(value); };
      };
    });
    const pointer = JSON.parse(localStorage.getItem("arcigy.kitchen.lastWorkspace.v1") ?? "null");
    const leaseKey = Object.keys(localStorage).find((key) => key.includes(pointer?.workspaceId ?? "__missing__"));
    const lease = leaseKey ? JSON.parse(localStorage.getItem(leaseKey) ?? "null") : null;
    const projectRecords = records.filter((item) => item?.envelope?.scope?.projectId === expectedProjectId);
    const record = projectRecords.find((item) => item?.envelope?.scope?.workspaceId === pointer?.workspaceId);
    if (!record) return null;
    return {
      workspaceId: record.envelope.scope.workspaceId,
      walls: record.envelope.appState?.layout?.snapshot?.walls?.length ?? null,
      sequence: record.envelope.sequence,
      baseServerRevision: record.envelope.baseServerRevision,
      writer: record.envelope.writer,
      lease,
      updatedAt: record.envelope.updatedAt,
      projectRecords: projectRecords.map((item) => ({
        workspaceId: item.envelope.scope.workspaceId,
        walls: item.envelope.appState?.layout?.snapshot?.walls?.length ?? null,
        sequence: item.envelope.sequence,
        writer: item.envelope.writer
      }))
    };
  }, projectId);
}

async function readLeaseState(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith("arcigy.kitchen.projectRecoveryLease.v1:"))
      .map((key) => [key, JSON.parse(localStorage.getItem(key) ?? "null")])
  ));
}

function summarizeLayout(snapshot) {
  return {
    wallCounter: snapshot.wallCounter,
    walls: snapshot.walls.map((wall) => ({ id: wall.id, aMm: wall.params.aMm, bMm: wall.params.bMm }))
  };
}

async function createProject(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("[data-project-manager-new]").waitFor({ timeout: 30_000 });
  await page.locator("[data-project-manager-new]").click();
  const name = `QA Project Recovery ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="address"]').fill("Recovery Street 1");
  await page.locator('input[name="contactName"]').fill("Recovery QA");
  await page.locator("[data-project-manager-form] button[type='submit']").click();
  await waitForWorkspace(page);
  const response = await context.request.get(new URL("/api/projects", baseUrl).toString());
  const body = await response.json();
  projectId = body.projects?.find((project) => project.name === name)?.projectId ?? null;
  assert(Boolean(projectId), "created isolated recovery project", body.projects);
}

async function main() {
  await ensureLocalApp();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await login();
  const primary = await context.newPage();
  collectConsoleErrors(primary, "primary");
  await createProject(primary);

  await primary.evaluate(() => window.__kitchenDebug.createWall({
    aMm: { x: -1000, z: 0 },
    bMm: { x: 1000, z: 0 },
    thicknessMm: 120
  }));
  await waitForRecoveryWallCount(primary, 1);
  try {
    await primary.waitForFunction(() => Boolean(localStorage.getItem("arcigy.kitchen.lastWorkspace.v1")), undefined, { timeout: 20_000 });
  } catch {
    const diagnostics = await primary.evaluate(() => ({
      localStorage: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      bodyClasses: document.body.className
    }));
    throw Object.assign(new Error("last workspace pointer was not written after IndexedDB recovery"), { details: diagnostics });
  }
  assert(await primary.evaluate(() => Boolean(localStorage.getItem("arcigy.kitchen.lastWorkspace.v1"))), "last workspace pointer persisted");

  await primary.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkspace(primary);
  const recovered = await primary.evaluate(() => window.__kitchenDebug.layoutSnapshot());
  assert(recovered.walls.length === 1, "refresh restored unsaved wall from IndexedDB", recovered);
  assert(!(await primary.locator(".project-secondary-writer-overlay").isVisible().catch(() => false)), "refresh reacquired writer lease without read-only delay");

  const secondary = await context.newPage();
  collectConsoleErrors(secondary, "secondary");
  await secondary.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForWorkspace(secondary);
  await secondary.locator(".project-secondary-writer-overlay").waitFor({ state: "visible", timeout: 10_000 });
  assert(true, "second tab opened read-only");
  await secondary.getByRole("button", { name: "Prevziať úpravy v tomto tabe" }).click();
  await secondary.locator(".project-secondary-writer-overlay").waitFor({ state: "detached", timeout: 10_000 });
  await primary.locator(".project-secondary-writer-overlay").waitFor({ state: "visible", timeout: 10_000 });
  assert(true, "explicit takeover transferred writer ownership");

  await secondary.evaluate(() => window.__kitchenDebug.createWall({
    aMm: { x: 1000, z: 0 },
    bMm: { x: 1000, z: 1000 },
    thicknessMm: 120
  }));
  const layoutAfterTakeoverChange = await secondary.evaluate(() => window.__kitchenDebug.layoutSnapshot());
  assert(layoutAfterTakeoverChange.walls.length === 2, "takeover tab contains both walls", summarizeLayout(layoutAfterTakeoverChange));
  const recoveryWaitMatch = await waitForRecoveryWallCount(secondary, 2);
  const recoveryBeforeReload = await readCurrentRecovery(secondary);
  const layoutAfterRecoveryWrite = await secondary.evaluate(() => window.__kitchenDebug.layoutSnapshot());
  assert(recoveryBeforeReload?.walls === 2, "active project draft contains takeover changes", {
    recoveryBeforeReload,
    layoutAfterTakeoverChange: summarizeLayout(layoutAfterTakeoverChange),
    layoutAfterRecoveryWrite: summarizeLayout(layoutAfterRecoveryWrite),
    leaseState: await readLeaseState(secondary),
    recoveryWaitMatch,
    primaryReadOnly: await primary.locator(".project-secondary-writer-overlay").isVisible().catch(() => false),
    secondaryReadOnly: await secondary.locator(".project-secondary-writer-overlay").isVisible().catch(() => false)
  });
  await primary.close();
  await secondary.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkspace(secondary);
  const recoveredAgain = await secondary.evaluate(() => window.__kitchenDebug.layoutSnapshot());
  assert(recoveredAgain.walls.length === 2, "takeover changes survived another refresh", {
    recoveryBeforeReload,
    recoveryAfterReload: await readCurrentRecovery(secondary),
    recoveredAgain
  });

  assert(result.consoleErrors.length === 0, "recovery browser consoles stayed clean", result.consoleErrors);
  result.ok = true;
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (projectId && context) {
    await context.request.delete(new URL(`/api/projects/${encodeURIComponent(projectId)}`, baseUrl).toString()).catch(() => undefined);
  }
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await stopLocalProcesses();
});
