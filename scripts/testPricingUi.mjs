import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

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

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
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
