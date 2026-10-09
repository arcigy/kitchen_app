import { webkit } from "playwright";
import { readFile } from "node:fs/promises";
import { readUiTestCredentials } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Isolated local runtime required");
const ready = await (await fetch(new URL("/ready", baseUrl))).json();
if (ready.storage !== "file") throw new Error("Disposable file storage required");

const name = `QA WebKit FQP ${Date.now()}`;
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

try {
  await page.goto(baseUrl);
  const credentials = readUiTestCredentials();
  await page.locator('.auth-form input[name="username"]').fill(credentials.username);
  await page.locator('.auth-form input[name="password"]').fill(credentials.password);
  const initialCatalogRequests = ["/api/catalog/bootstrap", "/api/modules"].map(pathname =>
    page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.ok())
      .then(async response => { const failure = await response.finished(); if (failure) throw failure; }));
  await page.locator('.auth-form button[type="submit"]').click();
  await page.locator('[data-project-manager-new]').waitFor();
  // The manager appears before catalog bootstrap finishes. Complete startup
  // before beginning the authenticated export scenario.
  await Promise.all(initialCatalogRequests);
  // The initial signed-out session probe returns 401 by contract. Audit the
  // authenticated project creation, export and encrypted import.
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const news = await (await page.request.get(new URL('/api/release-news', baseUrl).toString())).json();
  const latestNotice = [...news.notices].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestNotice && !news.acknowledgedNoticeIds.includes(latestNotice.id)) {
    await page.locator('.release-news-acknowledge').click();
    await page.locator('.release-news-scrim').waitFor({ state: 'detached' });
  }
  await page.waitForSelector("[data-project-manager-form]", { state: "attached" });
  if (!await page.locator("[data-project-manager-form]").isVisible()) await page.locator("[data-project-manager-new]").click();
  await page.locator('input[name="name"]').fill(name);
  const createResponse = page.waitForResponse((response) => response.url().includes("/api/projects") && response.request().method() === "POST");
  await page.locator("[data-project-manager-form] button[type=submit]").click();
  const createdResponse = await createResponse;
  if (!createdResponse.ok()) throw new Error("Project creation failed before FQP test.");
  const created = await createdResponse.json();
  const originalProjectId = created.project?.projectId;
  if (!originalProjectId) throw new Error("Project creation response did not contain its project ID.");
  await page.waitForFunction(() => !!window.__kitchenDebug);

  const saveResponse = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.url().endsWith("/save") && response.request().method() === "POST");
  await page.locator('[data-quick-action="save"]').click();
  if (!(await saveResponse).ok()) throw new Error("Project save failed before FQP export.");
  await page.locator('[data-quick-action="open"]').click();
  const saveExit = page.locator('[data-project-exit="save"]');
  if (await saveExit.isVisible({ timeout: 1000 }).catch(() => false)) await saveExit.click();
  await page.waitForSelector('[data-project-manager-list]', { timeout: 30000 });

  const card = page.locator(".project-manager-project-card").filter({ hasText: name });
  await card.locator(".project-manager-project-menu-button").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /^(Export project|Exportovať projekt|Exportovat projekt)$/ }).click(),
  ]);
  if (!download.suggestedFilename().endsWith(".fqp")) throw new Error(`Unexpected FQP filename: ${download.suggestedFilename()}`);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("WebKit did not produce a downloaded file.");
  const envelopeText = await readFile(downloadPath, "utf8");
  const envelope = JSON.parse(envelopeText);
  if (envelope.magic !== "FURNQUOTE_ENCRYPTED_PROJECT" || typeof envelope.ciphertext !== "string" || !envelope.ciphertext) {
    throw new Error("Downloaded FQP is not a valid encrypted project envelope.");
  }

  const imported = await context.request.post(new URL("/api/projects/import", baseUrl).toString(), { data: { envelope: envelopeText } });
  if (!imported.ok()) throw new Error(`FQP import roundtrip failed: HTTP ${imported.status()}`);
  const result = await imported.json();
  if (!result.save?.projectId || result.save.projectId === originalProjectId) throw new Error("FQP import did not create a project copy.");
  if (errors.length) throw new Error(`Browser console/page errors; download URL ${download.url()}: ${errors.join(" | ")}`);
  console.log("WebKit FQP download and encrypted import-copy roundtrip passed; browser errors: 0.");
} finally {
  await context.close();
  await browser.close();
}
