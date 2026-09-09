import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const output = "outputs/ui-appearance";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];

async function theme(page, preference, resolved = preference) {
  const trigger = page.locator(".account-menu-trigger");
  if (await trigger.count() && !await page.locator(".theme-picker").isVisible()) await trigger.click();
  await page.locator(`.theme-picker input[value="${preference}"]`).check();
  await page.waitForFunction(value => document.documentElement.dataset.theme === value, resolved);
  if (await trigger.count()) await trigger.click();
}

async function audit(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
  const state = await page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
        && rect.top < innerHeight && rect.left < innerWidth;
    };
    const rgb = value => value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    const blend = (front, back) => {
      const alpha = front[3] ?? 1;
      return front.slice(0, 3).map((v, i) => v * alpha + back[i] * (1 - alpha));
    };
    const luminance = color => color.slice(0, 3).map(v => {
      const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => {
      const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
      return (high + 0.05) / (low + 0.05);
    };
    const failures = [];
    const tested = [];
    const selectors = ".revit-tab, .archux-side-nav-item, .theme-picker span, .auth-form button, .props-title, .materials-phase-tabs button";
    for (const element of document.querySelectorAll(selectors)) {
      if (!visible(element)) continue;
      const ancestors = [];
      for (let current = element; current; current = current.parentElement) ancestors.unshift(current);
      let background = [255, 255, 255];
      for (const current of ancestors) background = blend(rgb(getComputedStyle(current).backgroundColor), background);
      const style = getComputedStyle(element);
      const endpoints = [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => blend(rgb(m[0]), background));
      const ratio = Math.min(...(endpoints.length ? endpoints : [background]).map(bg => contrast(blend(rgb(style.color), bg), bg)));
      const text = element.textContent.trim();
      tested.push({ text, ratio: +ratio.toFixed(2) });
      if (ratio < 4.5) failures.push({ text, ratio, color: style.color, background: style.background });
    }
    return {
      theme: document.documentElement.dataset.theme,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      failures, tested
    };
  });
  assert.deepEqual(state.failures, [], `${name}: unreadable controls`);
  assert.equal(state.pageOverflow, false, `${name}: horizontal page overflow`);
  if (name.startsWith("editor-")) {
    const actionsFit = await page.locator(".archux-pricing-summary__actions").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const footer = element.closest(".archux-bottom").getBoundingClientRect();
      return rect.bottom <= footer.bottom && rect.top >= footer.top;
    });
    assert(actionsFit, `${name}: pricing actions clipped by the footer`);
  }
  await page.screenshot({ path: `${output}/${name}.png` });
  reports.push({ name, ...state });
}

try {
  // The login screen must resolve a system preference before its first paint.
  const loginContext = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
  const login = await loginContext.newPage();
  await login.goto(baseUrl);
  await login.locator(".auth-form").waitFor();
  assert.equal(await login.locator("html").getAttribute("data-theme"), "dark");
  await audit(login, "login-dark");
  await theme(login, "light");
  await login.reload();
  await login.locator(".auth-form").waitFor();
  assert.equal(await login.locator("html").getAttribute("data-theme"), "light");
  await audit(login, "login-light");
  await login.emulateMedia({ colorScheme: "dark" });
  assert.equal(await login.locator("html").getAttribute("data-theme"), "light");
  await theme(login, "system", "dark");
  await login.emulateMedia({ colorScheme: "light" });
  await login.waitForFunction(() => document.documentElement.dataset.theme === "light");
  // Arrow keys switch the native radio selection without losing focus.
  await login.locator('.theme-picker input[value="system"]').focus();
  await login.keyboard.press("ArrowRight");
  assert.equal(await login.locator("html").getAttribute("data-theme-preference"), "light");
  await login.setViewportSize({ width: 390, height: 844 });
  await audit(login, "login-mobile-light");
  await loginContext.close();

  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await installAuthSession(page, { autoStartWorkspace: false });
  await page.goto(baseUrl);
  await page.locator("[data-project-manager-new]").waitFor();
  await audit(page, "projects-light");
  await theme(page, "dark");
  await audit(page, "projects-dark");
  await page.goto(new URL("?workspace=1", baseUrl).href);
  await page.waitForFunction(() => Boolean(window.__kitchenDebug), null, { timeout: 120_000 });
  await page.evaluate(() => window.__kitchenDebug.createKitchenScenario({
    path: [{ x: 0, z: 0 }, { x: 3000, z: 0 }], justification: "back",
    addModule: true, moduleType: "drawer_low", offsetAlongMm: 700
  }));
  for (const value of ["dark", "light"]) {
    const before = await page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
    await theme(page, value);
    await audit(page, `editor-${value}`);
    assert.deepEqual(await page.evaluate(() => window.__kitchenDebug.layoutSnapshot()), before, "Appearance changed project data");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.waitForFunction(() => window.__kitchenDebug.viewState().viewMode === "3d");
    await page.waitForFunction(() => {
      const modules = window.__kitchenDebug.viewState().modules;
      return modules.length > 0 && modules.every(module => module.meshVisible && !module.outlineVisible);
    });
    const modes = await page.locator(".viewer-display-menu [data-mode]").evaluateAll(items => items.map(item => item.dataset.mode));
    assert.deepEqual(modes, ["solid", "realistic"], "Only surface display modes may be offered");
    for (const mode of ["realistic", "solid"]) {
      await page.locator(".viewer-display-button").click();
      await page.locator(`.viewer-display-menu [data-mode="${mode}"]`).click();
      assert.equal(await page.locator(".viewer-display-menu-active").getAttribute("data-mode"), mode);
    }
    await audit(page, `editor-3d-${value}`);
    await page.getByRole("button", { name: "Pôdorys", exact: true }).click();
    await page.locator('[data-workspace-nav="materials"]').click();
    await page.locator(".materials-group").first().waitFor();
    await audit(page, `materials-${value}`);
    await page.locator('[data-workspace-nav="design"]').click();
    for (const nav of ["sheets", "schedules", "settings"]) {
      await page.locator(`[data-workspace-nav="${nav}"]`).click();
      await page.locator(".workspace-dialog, .coming-soon-dialog").first().waitFor();
      await audit(page, `${nav}-${value}`);
      const close = page.locator("[data-workspace-close]");
      if (await close.count()) await close.click();
      else await page.keyboard.press("Escape");
    }
  }
  // Storage events synchronize another live page without a reload.
  const sibling = await context.newPage();
  await sibling.goto(baseUrl);
  await sibling.locator(".account-menu-trigger").waitFor();
  await theme(page, "dark");
  await sibling.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await sibling.close();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator(".account-menu-trigger").evaluate(e => getComputedStyle(e).transitionDuration);
  assert(duration.split(",").every(v => parseFloat(v) < 0.001), "Reduced motion still animates controls");
  await page.locator('[data-workspace-nav="design"]').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await audit(page, "editor-compact-dark");
  await page.emulateMedia({ media: "print" });
  await page.waitForFunction(() => getComputedStyle(document.body).color === "rgb(23, 38, 61)");
  assert.equal(await page.locator("body").evaluate(e => getComputedStyle(e).color), "rgb(23, 38, 61)");
  assert.deepEqual(errors, [], "Browser console errors");
  await context.close();
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ ok: true, reports }, null, 2));
  console.log(JSON.stringify({ ok: true, surfaces: reports.map(r => r.name), consoleErrors: errors.length }));
} finally {
  await browser.close();
}
