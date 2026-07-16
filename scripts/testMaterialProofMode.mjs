import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const delayedReferencePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zq9sAAAAASUVORK5CYII=",
    "base64"
  );
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await installAuthSession(page);
    await page.route("**/api/material-proof/reference-image**", async (route) => {
      if (route.request().resourceType() === "fetch") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.fulfill({ status: 200, contentType: "image/png", body: delayedReferencePng });
    });
    const startedAt = Date.now();
    await page.goto(new URL("/material-proof", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Material Proof Mode" }).waitFor({ timeout: 5000 });
    const firstRenderMs = Date.now() - startedAt;
    await page.getByText("NO DEMOS TEXTURE USED").first().waitFor({ timeout: 30000 });
    await page.locator(".material-proof-color-chip").first().waitFor({ timeout: 15000 });

    const proof = await page.evaluate(() => {
      const text = document.body.textContent || "";
      return {
        hasFinalComparison: text.includes("Final comparison: Demos photo vs our PBR approximation"),
        hasRealCsvCount: text.includes("20 boards loaded from real Demos CSV"),
        hasDemosPhoto: text.includes("Demos web photo"),
        hasOurEstimate: text.includes("Our internal material estimate"),
        hasSku: text.includes("495386"),
        hasTargetTemplate: text.includes("wood_fine_grain_neutral_template"),
        hasPbrAsset: text.includes("wood_light_plain"),
        noDemosTexture: text.includes("NO DEMOS TEXTURE USED")
      };
    });

    assert(proof.hasFinalComparison, "Final comparison grid did not render", proof);
    assert(proof.hasRealCsvCount, "First-20 real CSV count did not render", proof);
    assert(proof.hasDemosPhoto && proof.hasOurEstimate, "Side-by-side comparison did not render", proof);
    assert(proof.hasSku && proof.hasTargetTemplate && proof.hasPbrAsset, "Inferred first-board PBR mapping details did not render", proof);
    assert(proof.noDemosTexture, "No-Demos-texture indicator is missing", proof);
    assert(firstRenderMs < 5000, "Material Proof first render waited for reference-image sampling", { firstRenderMs });
    assert(consoleErrors.length === 0, "Console errors found in Material Proof Mode", consoleErrors);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
