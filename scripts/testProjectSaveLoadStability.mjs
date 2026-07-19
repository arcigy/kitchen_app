import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const projectName = `QA Save Load Stability ${Date.now()}`;

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

async function getProjectVersions(context, projectId) {
  const response = await context.request.get(new URL(`/api/projects/${encodeURIComponent(projectId)}/versions`, baseUrl).toString());
  assert(response.ok(), `Versions failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const body = await response.json();
  return body.versions ?? [];
}

async function restoreProjectVersionForTest(context, projectId, versionNumber) {
  const response = await context.request.post(new URL(`/api/projects/${encodeURIComponent(projectId)}/versions/${versionNumber}/restore`, baseUrl).toString(), {
    data: {}
  });
  assert(response.ok(), `Restore version failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const body = await response.json();
  return body.save;
}

async function findProjectByName(context, name) {
  const response = await context.request.get(new URL("/api/projects", baseUrl).toString());
  assert(response.ok(), `Projects list failed: HTTP ${response.status()}`, await response.text().catch(() => ""));
  const body = await response.json();
  const project = (body.projects ?? []).find((item) => item.name === name);
  assert(project, `Project not found in list: ${name}`, body.projects);
  return project;
}

async function assertProjectPreviewHasContent(page, project) {
  assert(project.preview?.imageDataUrl?.startsWith("data:image/"), "Project metadata has no preview image", project);
  const previewStats = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(160, image.naturalWidth);
    canvas.height = Math.min(90, image.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Missing canvas context.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let min = 255;
    let max = 0;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (Math.abs(data[i] - data[i + 1]) + Math.abs(data[i + 1] - data[i + 2]) > 8) colored++;
    }
    return { width: image.naturalWidth, height: image.naturalHeight, range: max - min, colored };
  }, project.preview.imageDataUrl);
  assert(previewStats.width >= 160 && previewStats.height >= 90, "Project preview is too small", previewStats);
  assert(previewStats.range > 25 || previewStats.colored > 20, "Project preview looks blank or black", previewStats);
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

async function clickBottomView(page, label) {
  const clicked = await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll("[data-bottom-view-key], .viewer-tab")]
      .find((item) => (item.textContent || "").trim() === wanted);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert(clicked, `View button not found: ${label}`);
}

async function readSnapshot(page) {
  return await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
}

async function readViewState(page) {
  return await page.evaluate(() => window.__kitchenDebug.viewState());
}

function entityFingerprint(snapshot) {
  const pick = (items = []) => items.map((item) => ({ id: item.id, params: item.params, kitchenGroupId: item.kitchenGroupId ?? null, kitchenPlacement: item.kitchenPlacement ?? null })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    walls: pick(snapshot.walls),
    floors: pick(snapshot.floors),
    columns: pick(snapshot.columns),
    sections: pick(snapshot.sections),
    worktops: pick(snapshot.worktops),
    instances: pick(snapshot.instances)
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertFingerprintContains(actual, expected, label) {
  for (const [key, expectedItems] of Object.entries(expected)) {
    const actualItems = actual[key] || [];
    assert(actualItems.length === expectedItems.length, `${label}: ${key} count changed`, { expectedItems, actualItems });
    for (const expectedItem of expectedItems) {
      const actualItem = actualItems.find((item) => item.id === expectedItem.id);
      assert(!!actualItem, `${label}: ${key} lost ${expectedItem.id}`, { expectedItem, actualItems });
      assert(stableJson(actualItem.params) === stableJson(expectedItem.params), `${label}: ${key} params changed for ${expectedItem.id}`, { expectedItem, actualItem });
      assert(actualItem.kitchenGroupId === expectedItem.kitchenGroupId, `${label}: ${key} group changed for ${expectedItem.id}`, { expectedItem, actualItem });
      assert(stableJson(actualItem.kitchenPlacement) === stableJson(expectedItem.kitchenPlacement), `${label}: ${key} placement changed for ${expectedItem.id}`, { expectedItem, actualItem });
    }
  }
}

async function planPointToViewport(page, pointMm) {
  return await page.evaluate((point) => {
    const api = window.__kitchenDebug;
    if (!api) throw new Error("Missing __kitchenDebug");
    return api.projectPlanPoint(point);
  }, pointMm);
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

async function openProjectManagerFromWorkspace(page) {
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const saveExit = page.locator("[data-project-exit='save']");
  if (await saveExit.isVisible({ timeout: 1000 }).catch(() => false)) {
    await saveExit.click();
  }
  await page.waitForSelector("[data-project-manager-list]", { timeout: 30000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await login(page.context());
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await openProjectCreateForm(page);

    await page.fill("input[name='name']", projectName);
    await page.fill("input[name='address']", "QA Stability Street 1");
    await page.fill("input[name='contactName']", "QA Stability");
    await page.click("[data-project-manager-form] button[type='submit']");
    await waitForWorkspace(page);

    const firstWall = await page.evaluate(() =>
      window.__kitchenDebug.createWall({
        aMm: { x: -1200, z: -800 },
        bMm: { x: 1200, z: -800 },
        thicknessMm: 120
      })
    );
    assert(firstWall?.id, "Initial wall was not created", firstWall);
    await page.waitForFunction(() => {
      const text = document.querySelector("[data-recent-activity-count]")?.textContent || "";
      return !text.startsWith("0 ");
    }, null, { timeout: 10000 });

    const beforeSave = await readSnapshot(page);
    assert(beforeSave.walls.length === 1, "Project must be non-empty before save", beforeSave);

    await page.evaluate(() => {
      window.__kitchenDebug.createFloor({
        name: "QA Floor",
        heightMm: 0,
        thicknessMm: 80,
        materialId: "mat.floor.qa",
        boundary: [
          { x: -1600, z: -1400 },
          { x: 1600, z: -1400 },
          { x: 1600, z: 1200 },
          { x: -1600, z: 1200 }
        ]
      });
      window.__kitchenDebug.createColumn({
        name: "QA Column",
        shape: "rectangular",
        xMm: -950,
        zMm: 650,
        justifyX: "center",
        justifyY: "center",
        widthMm: 180,
        depthMm: 260,
        diameterMm: 220,
        heightMm: 2600,
        materialId: "mat.column.qa"
      });
      window.__kitchenDebug.createSection({
        name: "QA Section",
        aMm: { x: -1300, z: 1000 },
        bMm: { x: 1300, z: 1000 },
        mirrored: false
      });
      window.__kitchenDebug.createKitchenScenario({
        path: [{ x: -900, z: 250 }, { x: 900, z: 250 }],
        addModule: true,
        moduleType: "drawer_low",
        offsetAlongMm: 450
      });
    });

    await clickButtonByText(page, "Dvere");
    const doorPoint = await planPointToViewport(page, { x: -500, z: -800 });
    await page.mouse.click(doorPoint.x, doorPoint.y);
    await page.waitForTimeout(400);
    await clickButtonByText(page, "Okno");
    const windowPoint = await planPointToViewport(page, { x: 500, z: -800 });
    await page.mouse.click(windowPoint.x, windowPoint.y);
    await page.waitForTimeout(700);

    const beforeSaveView = await readViewState(page);
    assert(
      beforeSaveView.walls.some((wall) => wall.id === firstWall.id && wall.cutoutCount >= 2),
      "Wall did not create door/window cutouts before save",
      beforeSaveView.walls
    );

    const expectedFingerprint = entityFingerprint(await readSnapshot(page));
    assert(expectedFingerprint.floors.length === 1, "Floor was not created before save", expectedFingerprint);
    assert(expectedFingerprint.columns.length === 1, "Column was not created before save", expectedFingerprint);
    assert(expectedFingerprint.sections.length === 1, "Section was not created before save", expectedFingerprint);
    assert(expectedFingerprint.worktops.length === 1, "Worktop was not created before save", expectedFingerprint);
    assert(expectedFingerprint.instances.length === 1, "Module was not created before save", expectedFingerprint);

    await page.click("button[data-quick-action='save']");
    await page.waitForFunction(() => document.body.textContent.includes("Projekt je ulozeny."), null, { timeout: 15000 });

    const savedProject = await findProjectByName(page.context(), projectName);
    await assertProjectPreviewHasContent(page, savedProject);
    let versions = await getProjectVersions(page.context(), savedProject.projectId);
    assert(versions.length === 1 && versions[0].versionNumber === 1, "First save did not create version 1", versions);

    const sameSessionSaveResponse = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.url().endsWith("/save") && response.request().method() === "POST", { timeout: 20000 });
    await page.click("button[data-quick-action='save']");
    await sameSessionSaveResponse;
    versions = await getProjectVersions(page.context(), savedProject.projectId);
    assert(versions.length === 1 && versions[0].versionNumber === 1, "Repeated save in one open session should stay on version 1", versions);

    await openProjectManagerFromWorkspace(page);
    await page.getByRole("button", { name: new RegExp(projectName) }).click();
    await waitForWorkspace(page);

    const afterLoad = await readSnapshot(page);
    assert(afterLoad.walls.length === 1, "Loaded project did not restore the saved wall", afterLoad);
    assert(afterLoad.walls[0].id === firstWall.id, "Loaded wall id changed", { firstWall, afterLoad });
    assertFingerprintContains(entityFingerprint(afterLoad), expectedFingerprint, "Loaded project roundtrip");
    const afterLoadView = await readViewState(page);
    assert(
      afterLoadView.walls.some((wall) => wall.id === firstWall.id && wall.cutoutCount >= 2),
      "Loaded wall ignored saved door/window openings",
      afterLoadView.walls
    );

    const recentText = await page.locator("[data-recent-activity]").innerText();
    const recentCount = await page.locator("[data-recent-activity-count]").innerText();
    assert(
      /wall|stena/i.test(recentText) && !recentCount.startsWith("0 "),
      "Recent activity was not restored after loading the saved project",
      { recentText, recentCount }
    );

    await clickBottomView(page, "3D");
    await page.waitForFunction(() => window.__kitchenDebug.viewState().activeViewerTab === "3d", null, { timeout: 10000 });
    const view3d = await readViewState(page);
    assert(view3d.viewMode === "3d", "3D view did not activate after load", view3d);

    await clickBottomView(page, "Pôdorys");
    await page.waitForFunction(() => window.__kitchenDebug.viewState().activeViewerTab === "floorplan", null, { timeout: 10000 });
    const floorplan = await readViewState(page);
    assert(floorplan.viewMode === "2d", "Floorplan view did not activate after load", floorplan);

    await clickButtonByText(page, "Stena");
    const joinPoint = { x: 1200, z: -800 };
    const branchEnd = { x: 1200, z: 800 };
    const joinScreen = await planPointToViewport(page, joinPoint);
    const endScreen = await planPointToViewport(page, branchEnd);
    await page.mouse.click(joinScreen.x, joinScreen.y);
    await page.waitForTimeout(150);
    await page.mouse.click(endScreen.x, endScreen.y);
    await page.waitForTimeout(900);

    const afterSecondWall = await readSnapshot(page);
    const wallIds = afterSecondWall.walls.map((wall) => wall.id);
    const uniqueWallIds = new Set(wallIds);
    assert(
      afterSecondWall.walls.length === 2 && uniqueWallIds.size === 2 && wallIds.includes(firstWall.id),
      "Drawing a connected wall after load removed the loaded wall or reused its id",
      { firstWall, afterSecondWall }
    );
    assert(
      afterSecondWall.walls.some((wall) =>
        (wall.params.aMm.x === joinPoint.x && wall.params.aMm.z === joinPoint.z) ||
        (wall.params.bMm.x === joinPoint.x && wall.params.bMm.z === joinPoint.z)
      ),
      "Connected wall draw did not keep the expected shared endpoint",
      { joinPoint, afterSecondWall }
    );

    await clickBottomView(page, "3D");
    await page.waitForTimeout(800);
    const visibleWalls = (await readViewState(page)).walls;
    assert(
      visibleWalls.length === 2 && visibleWalls.every((wall) => wall.meshVisible || wall.outlineVisible),
      "Walls are not visible after adding a wall to a loaded project",
      visibleWalls
    );

    const secondSessionSaveResponse = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.url().endsWith("/save") && response.request().method() === "POST", { timeout: 20000 });
    await page.click("button[data-quick-action='save']");
    await secondSessionSaveResponse;
    versions = await getProjectVersions(page.context(), savedProject.projectId);
    assert(
      versions.length === 2 && versions[0].versionNumber === 2 && versions[1].versionNumber === 1,
      "Saving after reopening should create version 2",
      versions
    );

    const restoredV1 = await restoreProjectVersionForTest(page.context(), savedProject.projectId, 1);
    assert(restoredV1.appState?.layout?.snapshot?.walls?.length === 1, "Restoring version 1 did not restore the one-wall save", restoredV1.appState?.layout);
    versions = await getProjectVersions(page.context(), savedProject.projectId);
    assert(
      versions.length === 3 && versions[0].versionNumber === 3,
      "Restoring an old version should create a new history version",
      versions
    );

    const finalErrors = consoleErrors.filter((entry) => !entry.includes("favicon"));
    assert(finalErrors.length === 0, "Console errors during save/load stability flow", finalErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectName,
      checks: [
        "create-non-empty-project",
        "save-project",
        "project-preview-screenshot",
        "load-project",
        "recent-activity-restored",
        "all-layout-entities-restored",
        "door-window-cutouts-restored",
        "views-switch-after-load",
        "loaded-wall-survives-new-wall",
        "project-versions-session-numbering",
        "project-version-restore",
        "console-errors"
      ]
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.context) console.error(JSON.stringify(error.context, null, 2));
  process.exit(1);
});
