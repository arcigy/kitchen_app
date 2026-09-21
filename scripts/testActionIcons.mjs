import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const output = "outputs/action-icons";

await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const icons = await page.evaluate(async () => {
    const { actionIconDetails, actionIconMarkup } = await import("/src/ui/actionIcons.ts");
    const ids = Object.keys(actionIconDetails);
    document.body.innerHTML = `
      <main style="padding:24px;color:#17263d;background:#ffffff;font-family:system-ui,sans-serif">
        <h1>Action icon regression</h1>
        <div id="action-icon-grid" style="display:grid;grid-template-columns:repeat(8, 1fr);gap:16px"></div>
      </main>
    `;
    const grid = document.querySelector("#action-icon-grid");
    grid.innerHTML = ids.map(id => `
      <div style="display:grid;justify-items:center;gap:6px;padding:10px;border:1px solid #d2dae6;border-radius:8px">
        ${actionIconMarkup(id)}
        <span>${id}</span>
      </div>
    `).join("");

    return [...document.querySelectorAll(".arcigy-action-icon")].map(icon => {
      const shapes = [...icon.querySelectorAll("path, rect, circle, polygon, line")];
      const hasGeometry = shapes.some(shape => {
        const box = shape.getBBox();
        return box.width > 0 || box.height > 0;
      });
      return {
        id: icon.getAttribute("data-action-icon"),
        externalUseCount: icon.querySelectorAll("use").length,
        shapeCount: shapes.length,
        hasGeometry
      };
    });
  });

  assert(icons.length > 0, "No action icons were rendered.");
  assert(
    icons.every(icon => icon.externalUseCount === 0 && icon.shapeCount > 0 && icon.hasGeometry),
    `An action icon has no inline visible artwork: ${JSON.stringify(icons)}`
  );
  assert.deepEqual(errors, [], `Browser console errors: ${errors.join(" | ")}`);
  await page.screenshot({ path: `${output}/all-icons.png`, fullPage: true });
  console.log(JSON.stringify({ ok: true, iconCount: icons.length }));
} finally {
  await browser.close();
}
