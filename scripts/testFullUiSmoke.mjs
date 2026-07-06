import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

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
    const button = [...document.querySelectorAll("button")].find((item) => {
      const rect = item.getBoundingClientRect();
      const style = window.getComputedStyle(item);
      const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      return (
        visible &&
        !item.disabled &&
        predicate((item.getAttribute("title") || "").toLowerCase(), (item.textContent || "").toLowerCase())
      );
    });
    if (!button) return false;
    button.click();
    return true;
  }, predicateSource);
}

async function clickTopbarTab(page, labels) {
  return await page.evaluate((items) => {
    const wanted = items.map((item) => item.toLowerCase());
    const button = [...document.querySelectorAll(".revit-tab")].find((item) =>
      wanted.includes((item.textContent || "").trim().toLowerCase())
    );
    if (!button) return false;
    button.click();
    return true;
  }, labels);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await installAuthSession(page);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });
    await page.waitForSelector("button", { timeout: 30000 });

    const boot = await page.evaluate(() => ({
      title: document.title,
      hasDebug: !!window.__kitchenDebug
    }));
    assert(boot.title === "Arcigy Kitchen Layout" && boot.hasDebug, "Boot/debug check failed", boot);

    assert(await clickTopbarTab(page, ["Kitchen", "Kuchyňa"]), "Kitchen tab not found");
    const kitchenTab = await page.evaluate(() => {
      const rows = document.querySelector(".topbar-rows");
      const row = rows?.querySelector(".topbar");
      const catalog = document.querySelector("#moduleCatalog");
      const children = [...(row?.children ?? [])].map((el) => ({
        title: (el.querySelector(".topbar-group-title")?.textContent || "").trim().toLowerCase(),
        flex: el instanceof HTMLElement ? el.style.flex : ""
      }));
      const text = (rows?.textContent || "").toLowerCase();
      const toolTitles = [...(rows?.querySelectorAll("button") ?? [])].map((button) =>
        (button.getAttribute("title") || button.textContent || "").trim().toLowerCase()
      );
      const catalogButtons = [...(catalog?.querySelectorAll("button") ?? [])].map((button) => ({
        text: (button.textContent || "").trim().toLowerCase(),
        disabled: button.disabled
      }));
      const catalogRect = catalog?.getBoundingClientRect();
      const viewerRect = document.querySelector("#viewer")?.getBoundingClientRect();
      const cardRects = [...(catalog?.querySelectorAll(".module-catalog-card") ?? [])].map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top)
        };
      });
      const maxCardsPerRow = Math.max(
        0,
        ...Object.values(
          cardRects.reduce((groups, rect) => {
            groups[rect.top] = (groups[rect.top] ?? 0) + 1;
            return groups;
          }, {})
        )
      );
      return {
        cardRects,
        catalogButtons,
        catalogHidden: catalog?.hasAttribute("hidden") ?? true,
        catalogWidth: catalogRect?.width ?? 0,
        catalogText: (catalog?.textContent || "").toLowerCase(),
        children,
        maxCardsPerRow,
        text,
        toolTitles,
        viewerWidth: viewerRect?.width ?? 0
      };
    });
    assert(
      !kitchenTab.toolTitles.some((title) => /worktop|pracovn|drawer|cabinet|skrinka|polic/.test(title)) &&
        !kitchenTab.toolTitles.some((title) => title === "kitchen" || title === "kuchyňa"),
      "Kitchen modules or worktops are still in the topbar",
      kitchenTab
    );
    assert(!kitchenTab.catalogHidden && /modul/.test(kitchenTab.catalogText), "Kitchen module catalog is not visible", kitchenTab);
    assert(kitchenTab.catalogWidth >= 280 && kitchenTab.catalogWidth <= 360 && kitchenTab.viewerWidth > kitchenTab.catalogWidth * 2, "Kitchen module catalog layout is stretched", kitchenTab);
    assert(
      kitchenTab.maxCardsPerRow >= 5 &&
        kitchenTab.cardRects.some((rect) => rect.width <= 60 && rect.height <= 64 && Math.abs(rect.width - rect.height) <= 8),
      "Kitchen module catalog cards are not compact five-column squares",
      kitchenTab
    );
    assert(
      kitchenTab.catalogButtons.some((button) => /nov/.test(button.text) && !button.disabled) &&
        kitchenTab.catalogButtons.some((button) => /pracovn/.test(button.text) && button.disabled) &&
        kitchenTab.catalogButtons.some((button) => /skrinka|corner|modul|chlad/.test(button.text) && button.disabled),
      "Kitchen module catalog does not start with disabled module/worktop actions",
      kitchenTab
    );
    assert(await clickButton(page, `(title, text) => title.includes("new group") || title.includes("nov") && title.includes("skup")`), "New kitchen group button not found");
    const hasAcceptGroup = await page.evaluate(() => {
      const titles = [...document.querySelectorAll(".topbar-rows button")].map((button) =>
        (button.getAttribute("title") || button.textContent || "").trim().toLowerCase()
      );
      return titles.some((title) => title.includes("accept group") || title.includes("potvr"));
    });
    assert(hasAcceptGroup, "Accept group button not shown while editing kitchen group");
    assert(await clickButton(page, `(title, text) => title.includes("discard") || title.includes("zru") || text.includes("zru")`), "Discard kitchen group button not found");
    assert(await clickTopbarTab(page, ["Architecture", "Architektúra"]), "Architecture tab not found");

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

    const addTemporary = await page.evaluate(
      (id) => window.__kitchenDebug.addKitchenModule(id, { type: "drawer_low", segmentIndex: 0, offsetAlongMm: 2300 }),
      scenario.group.id
    );
    const temporaryId = addTemporary.instances?.at(-1)?.id;
    assert(temporaryId && addTemporary.instances.length >= 3, "Adding temporary kitchen module failed", addTemporary);
    const afterDelete = await page.evaluate((id) => window.__kitchenDebug.deleteModule(id), temporaryId);
    assert(
      afterDelete.instances?.length === addSwing.instances.length &&
        !afterDelete.instances.some((instance) => instance.id === temporaryId),
      "Deleting kitchen module failed",
      { temporaryId, beforeCount: addTemporary.instances?.length, afterDelete }
    );

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
    const column = await page.evaluate(() =>
      window.__kitchenDebug.createColumn({ xMm: 4200, zMm: 2600, widthMm: 400, depthMm: 600, shape: "rectangular" })
    );
    const columnSnap = await page.evaluate(() => window.__kitchenDebug.planSnap({ x: 4210, z: 2605 }));
    assert(column?.id && columnSnap?.owner === "column" && columnSnap.kind === "midpoint", "Column plan snap failed", { column, columnSnap });
    const section = await page.evaluate(() =>
      window.__kitchenDebug.createSection({ name: "QA Section", aMm: { x: 5200, z: 2800 }, bMm: { x: 6200, z: 2800 }, mirrored: false })
    );
    const sectionSnap = await page.evaluate(() => window.__kitchenDebug.planSnap({ x: 5205, z: 2800 }));
    assert(section?.id && sectionSnap?.owner === "section" && sectionSnap.kind === "endpoint", "Section plan snap failed", { section, sectionSnap });

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

    assert(await clickTopbarTab(page, ["View", "Zobrazenie"]), "View tab not found");
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
    await page.waitForFunction(() => !document.querySelector(".app-menu-root"), null, { timeout: 5000 });

    const pricingCatalogButton = page.locator('button[title*="katal" i], button[title*="catalog" i]').first();
    assert(await pricingCatalogButton.count(), "Pricing catalog button not found");
    await pricingCatalogButton.click();
    await page.waitForSelector(".pricing-catalog-modal", { timeout: 10000 });
    const pricingCatalogText = await page.locator(".pricing-catalog-modal").textContent();
    assert(pricingCatalogText?.toLowerCase().includes("materi"), "Pricing catalog modal missing materials section", pricingCatalogText);
    await page.locator(".pricing-catalog-modal__close").click();

    assert(await clickButton(page, `(title, text) => title.includes("kus") || text.includes("kus") || title === "bom"`), "BOM button not found");
    assert((await page.locator(".bom-modal").count()) === 1, "BOM modal did not open");
    await page.locator(".bom-modal__close").click();

    assert(await clickTopbarTab(page, ["Modify", "Upraviť"]), "Modify tab not found");
    assert(
      await clickButton(page, `(title, text) => title === "dimension" || title.includes("kot") || title.includes("kót") || text.includes("kot") || text.includes("kót")`),
      "Dimension button not found"
    );
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
            "delete-module",
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
