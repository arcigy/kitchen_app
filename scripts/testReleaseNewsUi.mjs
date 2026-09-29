import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const output = "outputs/release-news";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
let acknowledgements = 0;
await page.route("**/api/release-news**", async (route) => {
  if (route.request().method() === "PUT") {
    acknowledgements += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ acknowledgement: { noticeId: "2026-09-kitchen-pricing-and-production" } }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notices: [{
    id: "2026-09-kitchen-pricing-and-production", date: "2026-09-29",
    title: { en: "More accurate production and pricing", cs: "Přesnější výroba a ceny", sk: "Presnejšia výroba a ceny" },
    summary: { en: "Summary", cs: "Shrnutí", sk: "Súhrn" },
    changes: [{ en: "Change", cs: "Změna", sk: "Zmena" }],
    tryIt: [{ en: "Step", cs: "Krok", sk: "Krok" }]
  }], acknowledgedNoticeIds: [] }) });
});
await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }));

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const [{ createReleaseNewsController }, { getUiScaleController }, { setCurrentLanguage }, { createAccountMenu }] = await Promise.all([
      import("/src/app/releaseNewsController.ts"), import("/src/app/uiScaleController.ts"), import("/src/i18n/index.ts"), import("/src/ui/account/accountMenu.ts")
    ]);
    setCurrentLanguage("sk");
    const mountHome = document.createElement("div");
    const mountTopbar = document.createElement("div");
    document.body.append(mountHome, mountTopbar);
    const menuArgs = { users: [], currentUserId: "" };
    createAccountMenu({ ...menuArgs, mount: mountHome, showName: true });
    createAccountMenu({ ...menuArgs, mount: mountTopbar, showName: false });
    (window).__releaseNewsController = createReleaseNewsController({ uiScale: getUiScaleController() });
  });

  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(await dialog.locator("h2").innerText(), /Presnejšia výroba/);
  await page.screenshot({ path: `${output}/first-open.png` });
  await dialog.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await dialog.waitFor({ state: "detached" });
  assert.equal(acknowledgements, 0, "Escape must not acknowledge the notice");

  const homeMenu = page.locator(".account-menu-root").first();
  await homeMenu.locator(".account-menu-trigger").click();
  await homeMenu.getByRole("menuitem", { name: "Čo je nové?" }).click();
  await dialog.waitFor();
  assert.equal(await dialog.locator(".release-news-date").count(), 1);
  const focusables = dialog.locator("button:not([disabled])");
  await focusables.last().focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("release-news-date")), true);
  await page.screenshot({ path: `${output}/archive-sk.png` });
  await dialog.getByRole("button", { name: "Rozumiem" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(acknowledgements, 1, "Confirmation must persist an acknowledgement");

  await homeMenu.locator(".account-menu-trigger").click();
  await homeMenu.getByRole("menuitem", { name: "Nastavenia" }).click();
  const settings = page.getByRole("dialog", { name: "Nastavenia zobrazenia" });
  await settings.waitFor();
  await settings.getByRole("button", { name: "Zväčšená" }).click();
  assert.equal(await page.locator("html").getAttribute("data-ui-scale"), "large");
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await homeMenu.locator(".account-menu-trigger").click();
  await homeMenu.getByRole("menuitem", { name: "Čo je nové?" }).click();
  await dialog.waitFor();
  const bounds = await dialog.boundingBox();
  assert(bounds && bounds.width <= 390, "Dialog should fit a mobile viewport");
  await page.screenshot({ path: `${output}/archive-mobile.png` });
  assert.deepEqual(errors, [], `Browser console errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, acknowledgements, viewport: "390x844", consoleErrors: errors.length }));
} finally {
  await page.evaluate(() => (window).__releaseNewsController?.dispose()).catch(() => undefined);
  await browser.close();
}
