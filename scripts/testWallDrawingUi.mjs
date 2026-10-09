import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL;
assert(baseUrl, "Set KITCHEN_UI_BASE_URL to an isolated test service");
assert(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname), "Wall regression requires a local synthetic service");
assert(!["5180", "5191"].includes(new URL(baseUrl).port), "Use a task-owned port");
const readiness = await fetch(new URL("/ready", baseUrl));
assert(readiness.ok() && (await readiness.json()).storage === "file", "Wall regression requires disposable file storage");
const output = path.join(process.env.ARCIGY_TASK_RUNTIME ?? "outputs", "wall-drawing");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const snapshot = () => page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
const view = () => page.evaluate(() => window.__kitchenDebug.viewState());
const point = (x, z) => page.evaluate(p => window.__kitchenDebug.projectPlanPoint(p), { x, z });
async function move(x, z) { const p = await point(x, z); await page.mouse.move(p.x, p.y); await page.waitForTimeout(120); }
async function click(x, z) { const p = await point(x, z); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
async function button(names) {
  console.log("Wall regression button", names[0]);
  await page.waitForFunction(names => {
    const button = [...document.querySelectorAll("button")].find(b => names.includes(b.textContent.trim()) && b.getClientRects().length);
    if (!button) return false;
    button.click();
    document.activeElement?.blur();
    return true;
  }, names);
}
async function walls(count) { await page.waitForFunction(n => window.__kitchenDebug.layoutSnapshot().walls.length === n, count); }
async function space() { await page.keyboard.press("Space"); await page.waitForTimeout(120); }
async function escape() { await page.keyboard.press("Escape"); await page.waitForTimeout(120); }
async function pixels() { return sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
function colorDifference(a, b, screen) {
  const index = (Math.round(screen.y) * a.info.width + Math.round(screen.x)) * 3;
  return Math.max(...[0, 1, 2].map(i => Math.abs(a.data[index + i] - b.data[index + i])));
}
async function save() {
  const response = page.waitForResponse(r => r.url().endsWith("/save") && r.request().method() === "POST", { timeout: 20000 });
  await page.getByRole("button", { name: /Ulo/ }).click();
  const result = await response;
  assert(result.ok(), `Save failed ${result.status()}`);
  return (await result.json()).save;
}
async function waitWorkspace() {
  await page.waitForFunction(() => !!window.__kitchenDebug && !document.querySelector(".viewer-startup"));
}
try {
  await installAuthSession(page, { autoStartWorkspace: false });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const news = page.getByRole("dialog");
  if (await news.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  const form = page.locator("[data-project-manager-form]");
  await form.waitFor({ state: "attached" });
  await news.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await news.isVisible()) { await page.keyboard.press("Escape"); await news.waitFor({ state: "detached" }); }
  if (!await form.isVisible()) await page.click("[data-project-manager-new]");
  await page.fill("input[name='name']", `ARC008 Synthetic walls ${Date.now()}`);
  await page.fill("input[name='address']", "Synthetic test only");
  await page.fill("input[name='contactName']", "ARC008 QA");
  await page.click("[data-project-manager-form] button[type='submit']");
  await waitWorkspace();
  console.log("Wall workspace ready");
  await button(["Architektúra", "Architektura", "Architecture"]);
  await button(["Stena", "Wall"]);
  await move(1000, 0);
  const blank = await pixels();
  await space(); // defaults before first endpoint
  await space(); // return to the initial side
  await click(-1000, 0);
  await click(-1000, 0); // zero-length click adds no model entity
  await walls(0);
  await move(1000, 0);
  const preview = await pixels();
  const inside = await point(-180, 75);
  const opposite = await point(-180, -75);
  const outside = await point(-180, 350);
  assert(colorDifference(blank, preview, inside) > 10, "Interior preview is not visibly filled");
  assert(colorDifference(blank, preview, outside) < 10, "Preview exceeds the wall thickness");
  await space(); // must update the geometry without any pointer move
  const flipped = await pixels();
  assert(colorDifference(preview, flipped, inside) > 10, "Space did not immediately move the preview side");
  assert(colorDifference(blank, flipped, opposite) > 10, "Flipped preview has no visible thickness");
  await walls(0);
  await page.screenshot({ path: path.join(output, "preview-flipped.png") });
  await click(1000, 0);
  await walls(1);
  let first = (await snapshot()).walls[0];
  assert.equal(first.params.justification, "interior");
  assert.equal(first.params.exteriorSign, -1);
  assert.equal(first.params.thicknessMm, 150);
  await click(1000, 1000);
  await walls(2);
  await escape();
  assert.equal((await view()).layoutTool, "select");
  const chain = (await snapshot()).walls;
  assert.deepEqual(chain[0].params.bMm, chain[1].params.aMm);
  await page.keyboard.press("Control+z"); await walls(1);
  await page.keyboard.press("Control+y"); await walls(2);
  assert.deepEqual((await snapshot()).walls, chain, "A segment must undo/redo with its resolved topology");

  // Modified wall selection wins over drawing, including an active preview.
  await button(["Stena", "Wall"]);
  await click(-1000, -700); await move(300, -700);
  await page.keyboard.down("Control"); await click(0, -75); await page.keyboard.up("Control");
  assert.equal((await view()).layoutTool, "select");
  await walls(2);
  const beforeFlip = (await snapshot()).walls;
  await space();
  const afterFlip = (await snapshot()).walls;
  assert.equal(afterFlip[0].params.exteriorSign, 1);
  assert.deepEqual(afterFlip[1], beforeFlip[1], "Selection flip changed another wall");
  await page.keyboard.down("Space"); await page.keyboard.down("Space"); await page.keyboard.up("Space");
  assert.equal((await snapshot()).walls[0].params.exteriorSign, -1, "Held Space must flip only once");
  await button(["Prehodiť exteriér", "Prehodit exterier", "Flip exterior"]);
  assert.equal((await snapshot()).walls[0].params.exteriorSign, 1, "Properties must use the same flip command");
  await page.keyboard.press("Control+z");
  assert.equal((await snapshot()).walls[0].params.exteriorSign, -1);
  await page.keyboard.press("Control+y");
  assert.equal((await snapshot()).walls[0].params.exteriorSign, 1);

  // Native editing and modal owners retain Space/Escape.
  const stable = (await snapshot()).walls;
  const stableSelection = (await snapshot()).selected;
  for (const tag of ["input", "textarea", "div"]) {
    await page.evaluate(tag => {
      const el = document.createElement(tag); el.id = "wall-test-input";
      if (tag === "div") el.contentEditable = "true";
      document.body.append(el); el.focus();
    }, tag);
    await space(); await escape();
    assert.deepEqual((await snapshot()).walls, stable);
    assert.deepEqual((await snapshot()).selected, stableSelection, "Native typing must retain selection on Escape");
    await page.evaluate(() => document.getElementById("wall-test-input").remove());
  }
  for (const role of ["dialog", "menu"]) {
    await page.evaluate(role => { const el = document.createElement("div"); el.id = "wall-test-modal"; el.setAttribute("role", role); el.setAttribute("aria-modal", "true"); el.textContent = "Synthetic modal"; document.body.append(el); document.activeElement?.blur(); }, role);
    await space(); await escape();
    assert.deepEqual((await snapshot()).walls, stable);
    assert.deepEqual((await snapshot()).selected, stableSelection, "Modal owner must retain editor selection on Escape");
    await page.evaluate(() => document.getElementById("wall-test-modal").remove());
  }

  // Create a closed room using real clicks and snapping back to its first point.
  await button(["Stena", "Wall"]);
  await click(1000, 1000); await click(-1000, 1000); await click(-1000, 0);
  await walls(4); await escape();
  const closed = (await snapshot()).walls;
  await button(["Stena", "Wall"]);
  await click(-1000, 0); await move(-1000, -1000);
  await page.keyboard.type("800"); await page.keyboard.press("Enter");
  await walls(5);
  await page.keyboard.press("Control+z"); await walls(4); // clear active draft first
  await page.keyboard.press("Control+y"); await walls(5);
  await escape();
  await button(["Dvere", "Dveře", "Door"]); await click(-550, 0);
  await button(["Okno", "Window"]); await click(550, 0); await escape();
  const openings = (await view()).walls.find(w => w.id === first.id);
  assert(openings.cutoutCount >= 2, "Synthetic wall needs both opening cutouts");
  await page.evaluate(id => window.__kitchenDebug.selectWall(id), first.id);
  await space();
  assert((await view()).walls.find(w => w.id === first.id).cutoutCount >= 2, "Flip lost attached openings");

  const expected = (await snapshot()).walls;
  const saved = await save();
  assert.deepEqual(saved.appState.layout.snapshot.walls, expected);
  assert.equal(saved.appState.layout.windows.length, 1);
  assert.equal(saved.appState.layout.doors.length, 1);
  const response = await page.context().request.get(new URL(`/api/projects/${saved.projectId}/download`, baseUrl).href);
  assert(response.ok());
  const envelope = await response.text();
  assert.equal(JSON.parse(envelope).magic, "FURNQUOTE_ENCRYPTED_PROJECT");
  const importedResponse = await page.context().request.post(new URL("/api/projects/import", baseUrl).href, { data: { envelope } });
  assert(importedResponse.ok());
  const imported = (await importedResponse.json()).save;
  assert.deepEqual(imported.appState.layout.snapshot.walls, expected);
  await page.locator("button[data-quick-action='open']").click();
  const exit = page.locator("[data-project-exit='save']");
  if (await exit.isVisible({ timeout: 1000 }).catch(() => false)) await exit.click();
  const importedName = new RegExp(imported.project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  await page.getByRole("button", { name: importedName }).click();
  await waitWorkspace();
  assert.deepEqual((await snapshot()).walls, expected, "FQP load changed explicit alignment or side");
  await button(["Stena", "Wall"]);
  await click(0, 1000); await click(0, 1700); await escape();
  assert((await snapshot()).walls.length > expected.length, "Loaded walls could not be extended at a T-junction");
  await page.screenshot({ path: path.join(output, "loaded-and-edited.png") });
  assert.deepEqual(errors, [], "Browser must have zero console errors and pageerrors");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = { ok: true, commit, baseUrl, consoleErrors: 0, pageerrors: 0, wallCount: expected.length, closedRoomWallCount: closed.length, projectId: saved.projectId, importedProjectId: imported.projectId };
  await writeFile(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  console.error("Browser errors", errors);
  console.error((await page.locator("body").innerText()).slice(-1200));
  throw error;
} finally {
  await browser.close();
}
