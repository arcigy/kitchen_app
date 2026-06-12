import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5185";
const url = `${baseUrl.replace(/\/$/, "")}/module-inspector`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/demos/material-lookup**", async (route) => {
  const query = new URL(route.request().url()).searchParams.get("q") ?? "";
  const isMdf = query.toLowerCase().includes("mdfl") || query.includes("473374");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      material: isMdf ? {
        query,
        source: "demos-cz",
        pageUrl: "https://www.demos-trade.cz/mdfl-bila-hladka-2-str-2440-2100-3-3/",
        productId: "348642",
        assortmentCode: "473374",
        title: "MDFL Bila hladka 2.STR 2440/2100/3,3",
        brand: "N/A",
        categoryPath: ["Plosne materialy", "Laminovane desky", "MDF laminovane"],
        materialKind: "mdf",
        availability: { label: "Skladem", inStock: true, tooltip: "Skladem pouze na centralnich skladech." },
        price: { amountWithoutVat: 1595.76, amountWithVat: 1930.87, pricePerM2WithoutVat: 310.95, currency: "CZK" },
        board: {
          thicknessMm: 3.3,
          formatMm: { width: 2440, height: 2100 },
          decorCode: null,
          decorName: "Bila",
          structure: "Hladka",
          colorTone: "Bila",
          decorType: "Uni",
          materialProperty: "MDF"
        },
        image: {
          originalUrl: "https://www.demos-trade.cz/content/images/product/original/186971.jpg",
          previewUrl: "https://www.demos-trade.cz/content/images/product/original/186971.jpg"
        },
        scrapedAt: new Date().toISOString()
      } : {
        query,
        source: "demos-cz",
        pageUrl: "https://www.demos-trade.cz/dtdl-k536-rw-barokni-dub-amber-2800-2070-18/",
        productId: "361222",
        assortmentCode: "494911",
        title: "DTDL K536 RW Barokni dub Amber 2800/2070/18",
        brand: "Kronospan",
        categoryPath: ["Plosne materialy", "Laminovane desky", "DTD laminovane"],
        materialKind: "dtd",
        availability: { label: "Skladem", inStock: true, tooltip: "Skladem pouze na centralnich skladech." },
        price: { amountWithoutVat: 2472.63, amountWithVat: 2991.88, pricePerM2WithoutVat: 426.61, currency: "CZK" },
        board: {
          thicknessMm: 18,
          formatMm: { width: 2800, height: 2070 },
          decorCode: "K536",
          decorName: "Barokni dub Amber",
          structure: "RW",
          colorTone: "Ostatni",
          decorType: "Drevo",
          materialProperty: "P2"
        },
        image: {
          originalUrl: "https://www.demos-trade.cz/content/images/product/original/192174.jpg",
          previewUrl: "https://www.demos-trade.cz/content/images/product/default/192174.jpg"
        },
        scrapedAt: new Date().toISOString()
      }
    })
  });
});
await page.route("**/api/demos/material-image**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mOcWw8AAjABZyqizpAAAAAASUVORK5CYII=", "base64")
  });
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("[data-mi-view] canvas", { timeout: 15000 });
await page.waitForSelector("[data-mi-param]", { timeout: 15000 });

const initialObjects = await page.locator(".mi-part").count();
if (initialObjects < 3) throw new Error(`Expected rendered parts, found ${initialObjects}`);

const priceText = await page.locator(".mi-price-total strong").innerText();
if (!/K./.test(priceText)) throw new Error(`Expected CZK price text by default: ${priceText}`);
const selectedCurrency = await page.locator("[data-mi-price-currency]").inputValue();
if (selectedCurrency !== "CZK") throw new Error(`Expected CZK display currency by default, got ${selectedCurrency}`);

const moduleResults = await page.evaluate(() => window.__moduleInspectorTestApi?.probeAllModules() ?? []);
if (moduleResults.length < 40) throw new Error(`Expected all registered modules, got ${moduleResults.length}`);
const failedModules = moduleResults.filter((result) => !result.ok);
if (failedModules.length > 0) throw new Error(`Module probe failures:\n${JSON.stringify(failedModules, null, 2)}`);

const widthInput = page.locator('[data-mi-param="width"]').first();
if (await widthInput.count()) {
  await widthInput.fill("720");
  await widthInput.dispatchEvent("change");
  await page.waitForTimeout(250);
}

const materialSelectorCount = await page.locator("[data-mi-material-slot], [data-mi-material-thickness]").count();
if (materialSelectorCount !== 0) throw new Error(`Material choices should be disconnected, found ${materialSelectorCount} selectors`);

const materialReadonlyCount = await page.locator(".mi-material-readonly").count();
if (materialReadonlyCount < 1) throw new Error("Expected read-only material groups");
const materialGroupsText = await page.locator(".mi-material-groups").first().innerText();
if (!materialGroupsText.includes("Back")) throw new Error(`Expected Back material group, got: ${materialGroupsText}`);

const demosLookupInput = page.locator("[data-mi-demos-lookup]").first();
if ((await demosLookupInput.count()) < 1) throw new Error("Expected Demos material lookup input");
await demosLookupInput.fill("494911");
await demosLookupInput.press("Enter");
await page.waitForSelector(".mi-demos-result", { timeout: 10000 });
const demosResultText = await page.locator(".mi-demos-result").first().innerText();
if (!demosResultText.includes("494911") || !/K./.test(demosResultText)) {
  throw new Error(`Demos lookup result missing expected scraped fields: ${demosResultText}`);
}

await demosLookupInput.fill("MDFL Bila hladka 2.STR 2440/2100/3,3");
await demosLookupInput.press("Enter");
await page.waitForFunction(() => document.querySelector(".mi-demos-result")?.textContent?.includes("473374"), null, { timeout: 10000 });
const demosMdfResultText = await page.locator(".mi-demos-result").first().innerText();
if (!demosMdfResultText.includes("473374") || !demosMdfResultText.includes("3.3")) {
  throw new Error(`MDFL lookup result missing expected scraped fields: ${demosMdfResultText}`);
}

await page.locator("[data-mi-section-enabled]").check();
await page.locator('[data-mi-section="maxY"]').fill("500");
await page.locator('[data-mi-section="maxY"]').dispatchEvent("change");
await page.waitForTimeout(250);

const firstPartToggle = page.locator("[data-mi-part-visible]").first();
const firstPartButton = page.locator(".mi-part button").first();
await firstPartButton.click();
let selectedText = await page.locator(".mi-selected").innerText();
let normalizedSelectedText = selectedText.toLowerCase();
if (!normalizedSelectedText.includes("dimensions") || !normalizedSelectedText.includes("material")) {
  throw new Error(`Selected part details missing expected fields: ${selectedText}`);
}

await firstPartToggle.uncheck();
await page.waitForTimeout(150);
if (await firstPartButton.isEnabled()) throw new Error("Hidden part should not be selectable from object list");
const hiddenSelectedCount = await page.locator(".mi-selected").count();
if (hiddenSelectedCount !== 0) throw new Error("Hiding the selected part should clear selection");

const hiddenViewBefore = await page.evaluate(() => window.__moduleInspectorTestApi?.readSceneSnapshot?.() ?? null);
if (!hiddenViewBefore?.hiddenLabels?.length) throw new Error(`Expected hidden object snapshot, got ${JSON.stringify(hiddenViewBefore)}`);
const depthInput = page.locator('[data-mi-param="depth"]').first();
await depthInput.fill("610");
await depthInput.dispatchEvent("change");
await page.waitForTimeout(250);
const hiddenViewAfter = await page.evaluate(() => window.__moduleInspectorTestApi?.readSceneSnapshot?.() ?? null);
const sameArray = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) < 1e-9);
if (!sameArray(hiddenViewBefore.cameraPosition, hiddenViewAfter?.cameraPosition)) {
  throw new Error(`Camera position changed after parameter edit: ${JSON.stringify({ before: hiddenViewBefore, after: hiddenViewAfter })}`);
}
if (!sameArray(hiddenViewBefore.controlsTarget, hiddenViewAfter?.controlsTarget)) {
  throw new Error(`Orbit target changed after parameter edit: ${JSON.stringify({ before: hiddenViewBefore, after: hiddenViewAfter })}`);
}
if (!hiddenViewAfter?.hiddenLabels?.includes(hiddenViewBefore.hiddenLabels[0])) {
  throw new Error(`Hidden part was not preserved after parameter edit: ${JSON.stringify({ before: hiddenViewBefore, after: hiddenViewAfter })}`);
}
if (await firstPartButton.isEnabled()) throw new Error("Hidden part should remain unselectable after parameter edit");
await firstPartToggle.check();

await firstPartButton.click();
selectedText = await page.locator(".mi-selected").innerText();
normalizedSelectedText = selectedText.toLowerCase();
if (!normalizedSelectedText.includes("dimensions") || !normalizedSelectedText.includes("material")) {
  throw new Error(`Selected part details missing expected fields: ${selectedText}`);
}

await page.locator("[data-mi-toggle-pricing]").click();
const hiddenText = await page.locator(".mi-panel").filter({ hasText: "Quote" }).innerText();
if (!hiddenText.includes("Calculation hidden")) throw new Error("Quote toggle did not hide calculation");
await page.locator("[data-mi-toggle-pricing]").click();

const canvasBox = await page.locator("[data-mi-view] canvas").boundingBox();
if (!canvasBox || canvasBox.width < 400 || canvasBox.height < 400) {
  throw new Error(`Canvas too small: ${JSON.stringify(canvasBox)}`);
}

if (errors.length > 0) throw new Error(`Console errors:\n${errors.join("\n")}`);

await browser.close();
console.log(JSON.stringify({ ok: true, url, initialObjects, priceText }, null, 2));
