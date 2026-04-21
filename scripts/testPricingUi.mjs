import { chromium } from "playwright";

const baseUrl = process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("button", { timeout: 30000 });

    await page.getByRole("button", { name: /Catalog/i }).click();
    await page.getByRole("heading", { name: /Pricing Catalog/i }).first().waitFor();
    const catalogScroller = page.locator("body > div[style*='position: fixed'] > div").first();
    await catalogScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const catalogScrollTop = await catalogScroller.evaluate((el) => el.scrollTop);
    if (!(catalogScrollTop > 0)) throw new Error("Catalog modal did not scroll.");
    await page.getByRole("button", { name: /Zavrieť|Close/i }).click();

    await page.getByRole("button", { name: /^BOM$/i }).click();
    const hasHeading = (await page.getByRole("heading", { name: /Commercial BOM & Costs/i }).count()) > 0;
    const hasEmpty = (await page.getByText(/Nie s[úu] umiestnen[ée]/i).count()) > 0;
    if (!hasHeading && !hasEmpty) throw new Error("BOM modal opened without expected content.");

    const bomScroller = page.locator("body > div[style*='position: fixed'] > div").first();
    await bomScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const bomScrollTop = await bomScroller.evaluate((el) => el.scrollTop);
    if (!(bomScrollTop > 0 || hasEmpty)) throw new Error("BOM modal did not scroll.");
    await page.getByRole("button", { name: /Zavrieť|Close/i }).click();

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
