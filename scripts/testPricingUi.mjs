import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";
// Local fixture servers can opt their synthetic tenant into Delfi's server policy.
const expectSheetMargin = process.env.ARCIGY_UI_EXPECT_DELFI_MARGIN === "1";

async function verifyMarginPerSquareMeter(browser) {
  if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) throw new Error("Margin fixture requires isolated localhost.");
  const ready = await fetch(new URL("/ready", baseUrl));
  if (!ready.ok || (await ready.json()).storage !== "file") throw new Error("Margin fixture requires disposable file storage.");
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const metric = () => page.locator('[data-margin-summary-value="margin-per-m2"]');
  const openMargins = async () => {
    const response = page.waitForResponse(response => /\/api\/projects\/[^/]+\/margins$/.test(new URL(response.url()).pathname) && response.request().method() === "GET");
    await page.locator('[data-workspace-nav="margins"]').click();
    const result = await response;
    assert(result.ok(), "Authoritative margins load successfully");
    await page.locator("[data-margin-default-input]").waitFor();
    const view = (await result.json()).view;
    if (expectSheetMargin) await metric().waitFor();
    else {
      assert(!("sheetMaterial" in view.summary), "Other tenant receives the original API summary");
      assert(await metric().count() === 0, "Other tenant retains the original margin UI");
    }
    return view;
  };
  const save = async () => {
    const response = page.waitForResponse(response => response.url().endsWith("/save") && response.request().method() === "POST");
    await page.locator("button[data-quick-action='save']").click();
    assert((await response).ok(), "Project saves before margin calculation");
  };
  const assertMetric = async view => {
    if (!expectSheetMargin) {
      assert(!("sheetMaterial" in view.summary) && await metric().count() === 0, "Other tenant stays unchanged after editing");
      return;
    }
    const sheet = view.summary.sheetMaterial;
    assert(sheet?.areaM2 > 0 && sheet.marginPerM2 != null,
      `Complete board measurement and price: ${JSON.stringify({ summary: view.summary, warnings: view.warnings })}`);
    const expected = Math.round((view.summary.marginAmount / sheet.areaM2 + Number.EPSILON) * 100) / 100;
    assert(sheet.marginPerM2 === expected, "API rate equals complete margin divided by qualifying area");
    const displayed = Number((await metric().locator("strong").innerText()).replace(/[^\d,.-]/g, "").replace(",", "."));
    assert(displayed === expected, "Visible rate matches the authoritative result");
  };
  try {
    await installAuthSession(page, { autoStartWorkspace: false });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-project-manager-form]", { state: "attached" });
    if (!(await page.locator("[data-project-manager-form]").isVisible())) await page.locator("[data-project-manager-new]").click();
    await page.locator("input[name='name']").fill(`QA Margin per m2 ${Date.now()}`);
    await page.locator("input[name='address']").fill("QA");
    await page.locator("input[name='contactName']").fill("QA");
    await page.locator('[data-project-manager-form] button[type="submit"]').click();
    await page.waitForFunction(() => !!window.__kitchenDebug);
    await save();
    const empty = await openMargins();
    if (expectSheetMargin) {
      assert(empty.summary.sheetMaterial.areaM2 === 0 && empty.summary.sheetMaterial.marginPerM2 === null, "Empty project has no division by zero");
      assert((await metric().locator("strong").innerText()) === "—", "Empty project displays a dash");
    }
    await page.locator('[data-workspace-nav="design"]').click();
    const catalogResponse = await page.context().request.get(new URL("/api/catalog", baseUrl).toString());
    assert(catalogResponse.ok(), "Fixture uses the authenticated tenant catalog");
    const { catalog } = await catalogResponse.json();
    const pricedBoard = catalog.materials.find(material => material.pricingBasis === "sheet_area"
      && material.defaultThicknessMm >= 16 && Number.isFinite(catalog.priceList.prices[material.id]));
    assert(pricedBoard, "Synthetic catalog supplies a priced board");
    await page.evaluate(materialId => window.__kitchenDebug.createKitchenScenario({
      path: [{ x: 0, z: 0 }, { x: 4000, z: 0 }], addModule: false,
      ctxPatch: { worktopMaterialId: materialId }
    }), pricedBoard.id);
    await page.getByRole("button", { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).click();
    await page.getByRole("button", { name: /^(Pôdorys|Floorplan)$/ }).click();
    await page.getByRole("button", { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
    await page.evaluate(() => window.__kitchenDebug.startModulePlacement("fwm_catalog_base_open_end"));
    const point = await page.evaluate(() => window.__kitchenDebug.projectPlanPoint({ x: 1000, z: 300 }));
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => window.__kitchenDebug.placementState().valid);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^(Potvrdiť skupinu|Confirm group)$/ }).click();
    await save();
    const initial = await openMargins();
    await assertMetric(initial);
    const mutate = async (selector, value, button) => {
      const response = page.waitForResponse(response => /\/margins$/.test(new URL(response.url()).pathname) && response.request().method() === "PUT");
      await page.locator(selector).fill(String(value));
      await page.locator(button).click();
      const result = await response;
      assert(result.ok(), "Margin edit is saved through the existing API");
      const view = (await result.json()).view;
      if (expectSheetMargin) await page.waitForFunction(value => {
        const text = document.querySelector('[data-margin-summary-value="margin-per-m2"] strong')?.textContent ?? "";
        return Number(text.replace(/[^\d,.-]/g, "").replace(",", ".")) === value;
      }, view.summary.sheetMaterial.marginPerM2);
      await assertMetric(view);
      return view;
    };
    const changed = await mutate("[data-margin-default-input]", 35, "[data-margin-default-save]");
    assert(changed.summary.sheetMaterial?.areaM2 === initial.summary.sheetMaterial?.areaM2 && changed.summary.baseCost === initial.summary.baseCost, "Margin edit preserves geometry and costs");
    const labor = await mutate("[data-margin-additional-labor-input]", 200, "[data-margin-additional-labor-save]");
    assert(Math.round(labor.summary.baseCost * 100) === Math.round(changed.summary.baseCost * 100) + 20_000
      && Math.round(labor.summary.marginAmount * 100) === Math.round(changed.summary.marginAmount * 100) + 7_000,
      "Project labor contributes to the complete margin numerator");
    await page.locator('[data-workspace-nav="design"]').click();
    const reopened = await openMargins();
    assert(JSON.stringify(reopened.summary) === JSON.stringify(labor.summary), "Reopening margins restores the persisted settings and derived rate");
    if (expectSheetMargin) {
      const helpBox = await metric().locator("[data-margin-sheet-explanation]").boundingBox();
      assert(helpBox && helpBox.width <= 1 && helpBox.height <= 1, "Formula help stays accessible without stretching the footer");
    }
    await mkdir(".tmp/margin-per-m2-ui", { recursive: true });
    const screenshotPrefix = expectSheetMargin ? "delfi" : "standard";
    await page.screenshot({ path: `.tmp/margin-per-m2-ui/${screenshotPrefix}-desktop.png` });
    await page.setViewportSize({ width: 1080, height: 900 });
    if (expectSheetMargin) {
      await metric().scrollIntoViewIfNeeded();
      const box = await metric().boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1080 && box.y + box.height <= 900, "Rate remains visible in a compact window");
    }
    await page.screenshot({ path: `.tmp/margin-per-m2-ui/${screenshotPrefix}-compact.png` });
    assert(errors.length === 0, `Margin journey console errors: ${errors.join("; ")}`);
    return { checks: checks.length, consoleErrors: errors };
  } finally { await page.close(); }
}

async function clickToolbarButton(page, predicateSource) {
  const clicked = await page.evaluate((src) => {
    const predicate = new Function("title", "text", `return (${src})(title, text);`);
    const button = [...document.querySelectorAll("button")].find((item) =>
      predicate((item.getAttribute("title") || "").toLowerCase(), (item.textContent || "").toLowerCase())
    );
    if (!button) return false;
    button.click();
    return true;
  }, predicateSource);
  if (!clicked) throw new Error(`Toolbar button not found: ${predicateSource}`);
}

async function clickTopbarTab(page, labels) {
  const clicked = await page.evaluate((items) => {
    const wanted = items.map((item) => item.toLowerCase());
    const button = [...document.querySelectorAll(".revit-tab")].find((item) =>
      wanted.includes((item.textContent || "").trim().toLowerCase())
    );
    if (!button) return false;
    button.click();
    return true;
  }, labels);
  if (!clicked) throw new Error(`Topbar tab not found: ${labels.join(", ")}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await installAuthSession(page);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });
    await page.waitForSelector("button", { timeout: 30000 });

    await clickTopbarTab(page, ["View", "Zobrazenie"]);
    await clickToolbarButton(page, `(title, text) => title.includes("catalog") || title.includes("katal")`);
    await page.locator("h2").filter({ hasText: /Pricing Catalog|Cenový katalóg/i }).first().waitFor();
    const catalogScrollTop = await page.evaluate(() => {
      const overlay = [...document.body.children].find((item) =>
        item instanceof HTMLElement &&
        item.style.position === "fixed" &&
        /catalog|katal/.test((item.textContent || "").toLowerCase())
      );
      const panel = overlay?.firstElementChild;
      if (!(panel instanceof HTMLElement)) return -1;
      panel.scrollTop = panel.scrollHeight;
      return panel.scrollTop;
    });
    if (!(catalogScrollTop > 0)) throw new Error("Catalog modal did not scroll.");
    await page.evaluate(() => {
      const overlay = [...document.body.children].find((item) =>
        item instanceof HTMLElement &&
        item.style.position === "fixed" &&
        /catalog|katal/.test((item.textContent || "").toLowerCase())
      );
      overlay?.querySelector("button")?.click();
    });

    await clickToolbarButton(page, `(title, text) => title === "bom" || title.includes("kus") || text.includes("kus")`);
    const hasHeading = (await page.getByRole("heading", { name: /Commercial BOM & Costs|BOM|Kusovník/i }).count()) > 0;
    const hasEmpty = (await page.getByText(/Nie s[úu] umiestnen[ée]/i).count()) > 0;
    if (!hasHeading && !hasEmpty) throw new Error("BOM modal opened without expected content.");

    const bomScroller = page.locator(".bom-modal__panel").first();
    await bomScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const bomScrollTop = await bomScroller.evaluate((el) => el.scrollTop);
    if (!(bomScrollTop > 0 || hasEmpty)) throw new Error("BOM modal did not scroll.");
    await page.locator(".bom-modal__close").click();

    const marginPerSquareMeter = await verifyMarginPerSquareMeter(browser);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          marginPerSquareMeter,
          consoleErrors: consoleErrors.filter((entry) => !entry.includes("favicon"))
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
  process.exit(1);
});
