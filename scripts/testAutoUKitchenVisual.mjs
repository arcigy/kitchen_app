import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function clickVisibleButton(page, label) {
  return page.evaluate((wanted) => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      (item.textContent || "").trim().toLowerCase() === wanted
    );
    if (!button) return false;
    button.click();
    return true;
  }, label.toLowerCase());
}

async function analyzePngInPage(page, pngBuffer) {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Missing 2D canvas context.");
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sampled = 0;
    let nonBlank = 0;
    const buckets = new Set();
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const offset = (y * canvas.width + x) * 4;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;
        sampled += 1;
        const nearWhite = r > 238 && g > 238 && b > 238;
        const nearBlack = r < 18 && g < 18 && b < 18;
        if (!nearWhite && !nearBlack) {
          nonBlank += 1;
          buckets.add(`${Math.round(r / 32)}:${Math.round(g / 32)}:${Math.round(b / 32)}`);
        }
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      sampled,
      nonBlank,
      nonBlankRatio: nonBlank / Math.max(1, sampled),
      coarseColorBuckets: buckets.size
    };
  }, dataUrl);
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
    await page.evaluate(() => window.__kitchenDebug.reset());
    const autoU = await page.evaluate(() => window.__kitchenDebug.createRequestedUKitchen());
    assert(autoU.createdInMs < 10000, "Auto U kitchen is too slow", autoU);
    assert(autoU.plan.moduleCount >= 20 && autoU.snapshot.worktops.length >= 2, "Auto U kitchen did not create the requested assembly", autoU);

    await clickVisibleButton(page, "3D");
    await page.waitForTimeout(750);
    const canvas = page.locator("#viewer canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 10000 });
    const png = await canvas.screenshot({ timeout: 10000 });
    const visual = await analyzePngInPage(page, png);
    const partColors = new Set(
      autoU.snapshot.instances.flatMap((instance) =>
        (instance.parts ?? []).map((part) => part.colorHex).filter((color) => typeof color === "string")
      )
    );

    assert(
      visual.width >= 800 &&
        visual.height >= 500 &&
        visual.nonBlankRatio > 0.04 &&
        visual.coarseColorBuckets >= 8 &&
        partColors.size >= 5,
      "Auto U 3D visual check failed",
      { visual, partColors: [...partColors].slice(0, 20), createdInMs: autoU.createdInMs }
    );

    const finalErrors = consoleErrors.filter((entry) => !entry.includes("favicon"));
    assert(finalErrors.length === 0, "Console errors during Auto U visual check", finalErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      createdInMs: autoU.createdInMs,
      moduleCount: autoU.plan.moduleCount,
      worktops: autoU.snapshot.worktops.length,
      visual,
      partColorCount: partColors.size,
      consoleErrors: finalErrors
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
