import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const projectName = `QA Full Roundtrip ${Date.now()}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function login(context) {
  const response = await context.request.post(new URL("/api/auth/login", baseUrl).toString(), {
    data: {
      username: process.env.ARCIGY_UI_TEST_USERNAME ?? "arcigy",
      password: process.env.ARCIGY_UI_TEST_PASSWORD ?? "kitchen2026"
    }
  });
  if (!response.ok()) throw new Error(`Login failed: HTTP ${response.status()}`);
}

async function waitForWorkspace(page) {
  await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".viewer-startup"), null, { timeout: 30000 });
}

async function openProjectCreateForm(page) {
  await page.waitForSelector("[data-project-manager-form]", { state: "attached", timeout: 30000 });
  if (!(await page.locator("[data-project-manager-form]").isVisible())) {
    await page.click("[data-project-manager-new]");
  }
  await page.waitForSelector("[data-project-manager-form]", { state: "visible", timeout: 30000 });
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll("button")].find((item) => (item.textContent || "").trim() === wanted);
    if (!button) return false;
    button.click();
    return true;
  }, text);
  assert(clicked, `Button not found: ${text}`);
}

async function clickButtonByTexts(page, texts) {
  await page.waitForFunction((wanted) => {
    const button = [...document.querySelectorAll("button")]
      .find((item) => wanted.includes((item.textContent || "").trim()));
    if (!button) return false;
    button.click();
    return true;
  }, texts, { timeout: 10000 });
}

async function planPointToViewport(page, pointMm) {
  return await page.evaluate((point) => {
    const api = window.__kitchenDebug;
    if (!api) throw new Error("Missing __kitchenDebug");
    return api.projectPlanPoint(point);
  }, pointMm);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`).join(",")}}`;
}

function pickEntities(snapshot) {
  const pick = (items = []) => items
    .map((item) => ({
      id: item.id,
      params: item.params,
      kitchenGroupId: item.kitchenGroupId ?? null,
      kitchenPlacement: item.kitchenPlacement ?? null,
      positionMm: item.positionMm ?? null,
      rotationYDeg: typeof item.rotationYDeg === "number" ? Math.round(item.rotationYDeg * 1000) / 1000 : null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    walls: pick(snapshot.walls),
    floors: pick(snapshot.floors),
    columns: pick(snapshot.columns),
    sections: pick(snapshot.sections),
    worktops: pick(snapshot.worktops),
    instances: pick(snapshot.instances)
  };
}

function assertEntityRoundtrip(actual, expected, label) {
  for (const [key, expectedItems] of Object.entries(expected)) {
    const actualItems = actual[key] ?? [];
    assert(actualItems.length === expectedItems.length, `${label}: ${key} count changed`, { expectedItems, actualItems });
    for (const expectedItem of expectedItems) {
      const actualItem = actualItems.find((item) => item.id === expectedItem.id);
      assert(!!actualItem, `${label}: ${key} lost ${expectedItem.id}`, { expectedItem, actualItems });
      assert(stableJson(actualItem) === stableJson(expectedItem), `${label}: ${key} changed for ${expectedItem.id}`, { expectedItem, actualItem });
    }
  }
}

function layoutFromSave(save) {
  return save.appState?.layout?.snapshot ?? null;
}

function windowsFromSave(save) {
  return save.appState?.layout?.windows ?? [];
}

function doorsFromSave(save) {
  return save.appState?.layout?.doors ?? [];
}

async function saveViaUi(page) {
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.url().endsWith("/save") && response.request().method() === "POST", { timeout: 20000 });
  await page.getByRole("button", { name: /Ulo/ }).click();
  const response = await responsePromise;
  assert(response.ok(), `Save failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const body = await response.json();
  await page.waitForFunction(() => document.body.textContent.includes("Projekt je ulozeny."), null, { timeout: 15000 });
  return body.save;
}

async function getDownloadedEnvelope(context, projectId) {
  const response = await context.request.get(new URL(`/api/projects/${encodeURIComponent(projectId)}/download`, baseUrl).toString());
  assert(response.ok(), `Download failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const text = await response.text();
  const envelope = JSON.parse(text);
  assert(envelope.magic === "FURNQUOTE_ENCRYPTED_PROJECT", "Downloaded file is not an encrypted project envelope", envelope);
  assert(typeof envelope.ciphertext === "string" && envelope.ciphertext.length > 0, "Downloaded envelope has no ciphertext", envelope);
  return text;
}

async function importEnvelope(context, envelope) {
  const response = await context.request.post(new URL("/api/projects/import", baseUrl).toString(), {
    data: { envelope }
  });
  assert(response.ok(), `Import failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const body = await response.json();
  return body.save;
}

async function openProjectManagerFromWorkspace(page) {
  await page.locator("button[data-quick-action='open']").click();
  const saveExit = page.locator("[data-project-exit='save']");
  if (await saveExit.isVisible({ timeout: 1000 }).catch(() => false)) {
    await saveExit.click();
  }
  await page.waitForSelector("[data-project-manager-list]", { timeout: 30000 });
}

async function openProjectFromManager(page, projectNamePattern) {
  await openProjectManagerFromWorkspace(page);
  await page.getByRole("button", { name: projectNamePattern }).click();
  await waitForWorkspace(page);
}

async function cleanupLocalProject(projectId) {
  if (!projectId || baseUrl !== "http://127.0.0.1:5180/") return;
  const target = path.join(repoRoot, "storage", "clients", "client_arcigy_demo", "projects", projectId);
  const projectRoot = path.join(repoRoot, "storage", "clients", "client_arcigy_demo", "projects");
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(projectRoot))) return;
  await rm(resolved, { recursive: true, force: true });
}

async function createFullFixture(page) {
  const firstWall = await page.evaluate(() =>
    window.__kitchenDebug.createWall({
      aMm: { x: -1500, z: -900 },
      bMm: { x: 1500, z: -900 },
      thicknessMm: 120
    })
  );
  assert(firstWall?.id, "Initial wall was not created", firstWall);

  await page.evaluate(() => {
    window.__kitchenDebug.createFloor({
      name: "Full Roundtrip Floor",
      heightMm: 0,
      thicknessMm: 90,
      materialId: "mat.floor.roundtrip",
      boundary: [
        { x: -1900, z: -1500 },
        { x: 1900, z: -1500 },
        { x: 1900, z: 1400 },
        { x: -1900, z: 1400 }
      ]
    });
    window.__kitchenDebug.createColumn({
      name: "Full Roundtrip Column",
      shape: "round",
      xMm: -1200,
      zMm: 700,
      justifyX: "center",
      justifyY: "center",
      widthMm: 220,
      depthMm: 220,
      diameterMm: 260,
      heightMm: 2700,
      materialId: "mat.column.roundtrip"
    });
    window.__kitchenDebug.createSection({
      name: "Full Roundtrip Section",
      aMm: { x: -1500, z: 1150 },
      bMm: { x: 1500, z: 1150 },
      mirrored: true
    });
    const kitchen = window.__kitchenDebug.createKitchenScenario({
      path: [{ x: -1100, z: 250 }, { x: 1100, z: 250 }, { x: 1100, z: 1450 }],
      segmentDepthsMm: [620, 760],
      addModule: true,
      moduleType: "drawer_low",
      offsetAlongMm: 550
    });
    const inst = kitchen.instances[0];
    if (!inst) throw new Error("Kitchen module was not created.");
    window.__kitchenDebug.patchModuleParams(inst.id, { width: 820, drawerCount: 3 }, { preserveBackAnchor: true });
  });

  // Kitchen scenario rendering selects its own ribbon. Return to the shared
  // architecture ribbon before using its door/window tools.
  await clickButtonByTexts(page, ["Architektúra", "Architektura", "Architecture"]);
  await clickButtonByTexts(page, ["Dvere", "Dveře", "Door"]);
  const doorPoint = await planPointToViewport(page, { x: -650, z: -900 });
  await page.mouse.click(doorPoint.x, doorPoint.y);
  await page.waitForTimeout(350);
  await clickButtonByTexts(page, ["Okno", "Window"]);
  const windowPoint = await planPointToViewport(page, { x: 650, z: -900 });
  await page.mouse.click(windowPoint.x, windowPoint.y);
  await page.waitForTimeout(650);

  const view = await page.evaluate(() => window.__kitchenDebug.viewState());
  assert(view.walls.some((wall) => wall.id === firstWall.id && wall.cutoutCount >= 2), "Wall cutouts are missing before save", view);
  return firstWall.id;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const cleanupProjectIds = new Set();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await login(page.context());
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await openProjectCreateForm(page);

    await page.fill("input[name='name']", projectName);
    await page.fill("input[name='address']", "QA Roundtrip Street 1");
    await page.fill("input[name='contactName']", "QA Roundtrip");
    await page.click("[data-project-manager-form] button[type='submit']");
    await waitForWorkspace(page);

    const firstWallId = await createFullFixture(page);
    const beforeSaveSnapshot = await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
    const expectedEntities = pickEntities(beforeSaveSnapshot);
    assert(expectedEntities.walls.length === 1, "Fixture must have one wall before save", expectedEntities);
    assert(expectedEntities.floors.length === 1, "Fixture must have one floor before save", expectedEntities);
    assert(expectedEntities.columns.length === 1, "Fixture must have one column before save", expectedEntities);
    assert(expectedEntities.sections.length === 1, "Fixture must have one section before save", expectedEntities);
    assert(expectedEntities.worktops.length === 1, "Fixture must have one worktop before save", expectedEntities);
    assert(expectedEntities.instances.length === 1, "Fixture must have one module before save", expectedEntities);

    const saved = await saveViaUi(page);
    cleanupProjectIds.add(saved.projectId);
    assert(saved.project?.preview?.imageDataUrl?.startsWith("data:image/"), "Save did not persist project manager preview", saved.project);
    assert(saved.appState?.projectPreview?.imageDataUrl?.startsWith("data:image/"), "Save did not include appState project preview", saved.appState);
    assert(saved.appState?.recentActivity, "Save did not include recent activity", saved.appState);
    assert(windowsFromSave(saved).length === 1, "Save did not include saved window", saved.appState?.layout);
    assert(doorsFromSave(saved).length === 1, "Save did not include saved door", saved.appState?.layout);
    assertEntityRoundtrip(pickEntities(layoutFromSave(saved)), expectedEntities, "Save snapshot");

    const envelope = await getDownloadedEnvelope(page.context(), saved.projectId);
    const imported = await importEnvelope(page.context(), envelope);
    cleanupProjectIds.add(imported.projectId);
    assert(imported.projectId !== saved.projectId, "Import should create a copy when original exists", { saved: saved.projectId, imported: imported.projectId });
    assert(imported.project.importedFrom?.projectId === saved.projectId, "Imported copy did not remember source project", imported.project);
    assertEntityRoundtrip(pickEntities(layoutFromSave(imported)), expectedEntities, "Imported save snapshot");
    assert(windowsFromSave(imported).length === 1, "Imported save did not include window", imported.appState?.layout);
    assert(doorsFromSave(imported).length === 1, "Imported save did not include door", imported.appState?.layout);

    await openProjectFromManager(page, new RegExp(imported.project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const loadedImportedSnapshot = await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
    assertEntityRoundtrip(pickEntities(loadedImportedSnapshot), expectedEntities, "Loaded imported project");
    const loadedImportedView = await page.evaluate(() => window.__kitchenDebug.viewState());
    assert(
      loadedImportedView.walls.some((wall) => wall.id === firstWallId && wall.cutoutCount >= 2),
      "Loaded imported project lost wall cutouts",
      loadedImportedView.walls
    );

    await clickButtonByText(page, "Stena");
    const joinPoint = { x: 1500, z: -900 };
    const branchEnd = { x: 1500, z: 700 };
    const joinScreen = await planPointToViewport(page, joinPoint);
    const endScreen = await planPointToViewport(page, branchEnd);
    await page.mouse.click(joinScreen.x, joinScreen.y);
    await page.waitForTimeout(150);
    await page.mouse.click(endScreen.x, endScreen.y);
    await page.waitForTimeout(700);

    const editedSnapshot = await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
    assert(editedSnapshot.walls.length === 2, "Loaded imported project could not be edited after import", editedSnapshot);
    const editedSaved = await saveViaUi(page);
    assert(pickEntities(layoutFromSave(editedSaved)).walls.length === 2, "Edited imported save did not persist new wall", editedSaved.appState?.layout);

    await openProjectFromManager(page, new RegExp(imported.project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const reloadedEdited = await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
    assert(reloadedEdited.walls.length === 2, "Edited imported project did not reload new wall", reloadedEdited);
    assert(reloadedEdited.walls.some((wall) => wall.id === firstWallId), "Original wall disappeared after edited reload", reloadedEdited.walls);

    const finalErrors = consoleErrors.filter((entry) => !entry.includes("favicon"));
    assert(finalErrors.length === 0, "Console errors during full project roundtrip", finalErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectName,
      originalProjectId: saved.projectId,
      importedProjectId: imported.projectId,
      checks: [
        "create-full-fixture",
        "save-project",
        "download-fqp",
        "import-fqp-as-copy",
        "load-imported-project",
        "door-window-cutouts-restored",
        "edit-imported-project",
        "save-edited-import",
        "reload-edited-import",
        "console-errors"
      ]
    }, null, 2));
  } finally {
    await browser.close();
    if (process.env.KEEP_QA_PROJECTS !== "1") {
      await Promise.all([...cleanupProjectIds].map((projectId) => cleanupLocalProject(projectId)));
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.context) console.error(JSON.stringify(error.context, null, 2));
  process.exit(1);
});
