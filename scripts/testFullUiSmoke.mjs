import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function clickButton(page, predicateSource) {
  return await page.evaluate((src) => {
    const predicate = new Function("title", "text", `return (${src})(title, text);`);
    const button = [...document.querySelectorAll("button")].find((item) =>
      predicate((item.getAttribute("title") || "").toLowerCase(), (item.textContent || "").toLowerCase())
    );
    if (!button) return false;
    button.click();
    return true;
  }, predicateSource);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("button", { timeout: 30000 });

    const boot = await page.evaluate(() => ({
      title: document.title,
      hasDebug: !!window.__kitchenDebug
    }));
    assert(boot.title === "Arcigy Kitchen Layout" && boot.hasDebug, "Boot/debug check failed", boot);

    const scenario = await page.evaluate(() =>
      window.__kitchenDebug.createKitchenScenario({
        path: [
          { x: 0, z: 0 },
          { x: 3000, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        addModule: true,
        moduleType: "drawer_low",
        segmentIndex: 0,
        offsetAlongMm: 700
      })
    );
    assert(scenario.group?.id && scenario.instances?.length === 1 && scenario.worktops?.length === 1, "Kitchen scenario failed", scenario);

    const patchResult = await page.evaluate(
      (id) => window.__kitchenDebug.patchModuleParams(id, { width: 700 }, { sourceKey: "width", preserveBackAnchor: true }),
      scenario.instances[0].id
    );
    assert(
      patchResult.ok && patchResult.instance.params.width === 700,
      "Module parameter patch failed",
      { ok: patchResult.ok, debug: patchResult.debug, width: patchResult.instance?.params?.width }
    );

    const addSwing = await page.evaluate(
      (id) => window.__kitchenDebug.addKitchenModule(id, { type: "swing_shelves_low", segmentIndex: 0, offsetAlongMm: 1700 }),
      scenario.group.id
    );
    assert(addSwing.instances?.length >= 2, "Adding second kitchen module failed", { count: addSwing.instances?.length });

    const floor = await page.evaluate(() =>
      window.__kitchenDebug.createFloor({
        name: "QA floor",
        materialId: "mat_oak_natural",
        heightMm: 0,
        thicknessMm: 18,
        boundary: [
          { x: -500, z: -1500 },
          { x: 3500, z: -1500 },
          { x: 3500, z: 1800 },
          { x: -500, z: 1800 }
        ]
      })
    );
    const wallA = await page.evaluate(() =>
      window.__kitchenDebug.createWall({ aMm: { x: -400, z: -1000 }, bMm: { x: 2600, z: -1000 }, thicknessMm: 100 })
    );
    const wallB = await page.evaluate(() =>
      window.__kitchenDebug.createWall({ aMm: { x: 2600, z: -1000 }, bMm: { x: 2600, z: 1200 }, thicknessMm: 100 })
    );
    assert(floor.id && wallA?.id && wallB?.id, "Floor/wall creation failed", { floor, wallA, wallB });

    const measure = await page.evaluate(() =>
      window.__kitchenDebug.createMeasure({ aMm: { x: 0, z: 0 }, bMm: { x: 1200, z: 0 } })
    );
    const measureState = await page.evaluate(() => window.__kitchenDebug.measureState());
    assert(measure?.id || measureState.measures.length > 0, "Measure creation failed", { measure, measureState });

    const snap = await page.evaluate(() => window.__kitchenDebug.planSnap({ x: 5, z: 0 }));
    assert(snap?.kind && snap.kind !== "none", "Plan snap failed", snap);

    await page.evaluate(() => {
      window.__qaCopiedText = null;
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            window.__qaCopiedText = text;
          }
        },
        configurable: true
      });
    });

    assert(await clickButton(page, `(title, text) => title === "export json"`), "Export button not found");
    const exported = await page.evaluate(() => window.__qaCopiedText);
    const exportedJson = JSON.parse(exported || "{}");
    assert(
      exportedJson.mode === "layout" &&
        exportedJson.units === "mm" &&
        exportedJson.modules?.length >= 2 &&
        exportedJson.floors?.length >= 1,
      "Export JSON payload invalid",
      exportedJson
    );

    assert(await clickButton(page, `(title, text) => title.includes("export") && title !== "export json"`), "Copy export button not found");
    assert(await page.evaluate((expected) => window.__qaCopiedText === expected, exported), "Copy Export did not reuse current export text");

    assert(await clickButton(page, `(title, text) => text.includes("bor")`), "File menu button not found");
    const menuOk = await page.evaluate(() => (document.querySelector(".app-menu-root")?.textContent || "").toLowerCase().includes("json"));
    assert(menuOk, "File menu missing JSON entries");
    await page.keyboard.press("Escape");

    assert(await clickButton(page, `(title, text) => title.includes("katal")`), "Pricing catalog button not found");
    await page.waitForFunction(() => document.body.textContent.toLowerCase().includes("materi"), null, { timeout: 10000 });
    await clickButton(page, `(title, text) => text.includes("zavrie")`);

    assert(await clickButton(page, `(title, text) => title.includes("kus") || text.includes("kus") || title === "bom"`), "BOM button not found");
    assert((await page.locator(".bom-modal").count()) === 1, "BOM modal did not open");
    await page.locator(".bom-modal__close").click();

    assert(await clickButton(page, `(title, text) => title === "dimension" || title.includes("kot") || text.includes("kot")`), "Dimension button not found");
    const dimensionState = await page.evaluate(() => window.__kitchenDebug.viewState());
    assert(dimensionState.layoutTool === "dimension", "Dimension tool did not activate", dimensionState);

    const finalErrors = consoleErrors.filter((entry) => !entry.includes("favicon"));
    assert(finalErrors.length === 0, "Console errors during full UI flow", finalErrors);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          checks: [
            "boot",
            "debug-api",
            "create-kitchen-scenario",
            "patch-module-params",
            "add-module",
            "create-floor",
            "create-walls",
            "create-measure",
            "plan-snap",
            "export-json-payload",
            "copy-export",
            "file-menu",
            "pricing-catalog-modal",
            "bom-modal",
            "dimension-tool",
            "console-errors"
          ],
          modules: exportedJson.modules.length,
          floors: exportedJson.floors.length,
          consoleErrors: finalErrors
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  if (error.context) console.error(JSON.stringify(error.context, null, 2));
  process.exit(1);
});
