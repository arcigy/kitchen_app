import assert from "node:assert/strict";
import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

try {
  await installAuthSession(page, { autoStartWorkspace: false, baseUrl });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog");
  await page.waitForSelector(".project-manager-shell", { timeout: 30000 });
  await dialog.waitFor({ timeout: 10000 });
  assert((await dialog.locator("h2").innerText()).length > 0, "Home screen did not show the current release notice");

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  const homeAccount = page.locator("[data-project-manager-account]");
  await homeAccount.locator(".account-menu-trigger").click();
  await page.getByRole("menuitem", { name: /čo je nové|what's new/i }).click();
  await dialog.waitFor();
  assert((await dialog.locator(".release-news-date").count()) > 0, "Home account menu did not reopen the news archive");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });

  const response = await page.request.get(new URL("/api/release-news", baseUrl).toString());
  const data = await response.json();
  assert(response.ok() && data.notices.length > 0, "Release news API did not return its catalog");
  assert(!data.acknowledgedNoticeIds.includes(data.notices[0].id), "Escape or archive browsing incorrectly acknowledged the notice");
  assert.deepEqual(consoleErrors, [], `Home release-news console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, screen: "home", manuallyReopened: true, acknowledged: false, consoleErrors: 0 }));
} finally {
  await browser.close();
}
