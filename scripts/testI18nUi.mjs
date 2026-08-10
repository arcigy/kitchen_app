import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const variants = [
  ["sk", "sk-SK", "Súbor", "Prihlásenie", "Nový projekt", "Prázdne pracovisko", "Materiály", "Marže", "Kusovník / kalkulácia"],
  ["cs", "cs-CZ", "Soubor", "Přihlášení", "Nový projekt", "Prázdné pracovní prostředí", "Materiály", "Marže", "Kusovník / ocenění"],
  ["en", "en-GB", "File", "Sign in", "New project", "Blank workspace", "Materials", "Margins", "BOM / pricing"]
];
const expectedTopbar = {
  sk: ["Otvoriť", "Tlačiť", "Stav cloudu"],
  cs: ["Otevřít", "Tisknout", "Stav cloudu"],
  en: ["Open", "Print", "Cloud status"]
};
const selectedLanguage = process.env.I18N_UI_LANGUAGE;
const selectedMode = process.env.I18N_UI_MODE ?? "all";

async function setLanguage(page, language, locale) {
  const actualLocale = await page.evaluate(async (nextLanguage) => {
    const module = await import("/src/i18n/index.ts");
    module.setCurrentLanguage(nextLanguage);
    return document.documentElement.lang;
  }, language);
  if (actualLocale !== locale) throw new Error(`language switch expected ${locale}, received ${actualLocale}`);
}

async function expectVisibleText(page, language, text, surface) {
  const found = await page.evaluate((expected) => Array.from(document.querySelectorAll("button, [title], [aria-label], h1, h2, h3, p, span, label, strong"))
    .some((element) => {
      const html = element;
      return html.textContent?.trim() === expected
        || html.getAttribute("title") === expected
        || html.getAttribute("aria-label") === expected;
    }), text);
  if (found) return;
  const nearby = await page.evaluate(() => Array.from(document.querySelectorAll("button, [title], [aria-label], h1, h2, h3, p, span, label, strong"))
    .map((element) => element.textContent?.trim() || element.getAttribute("title") || element.getAttribute("aria-label") || "")
    .filter((value) => /bom|pricing|kusovník|kalkul/i.test(value))
    .slice(0, 12));
  throw new Error(`${language}: ${surface} is missing ${JSON.stringify(text)}; nearby=${JSON.stringify(nearby)}`);
}

async function waitFor(page, phase, predicate, timeout = 5_000) {
  console.log(`[i18n-ui] ${phase}`);
  try {
    await page.waitForFunction(predicate, undefined, { timeout });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({ title: document.title }));
    throw new Error(`${phase} timed out: ${JSON.stringify(diagnostic)}; ${error instanceof Error ? error.message : String(error)}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const [language, locale, expectedFile, expectedSignIn, expectedNewProject, expectedBlankWorkspace, expectedMaterials, expectedMargins, expectedBom] of variants.filter(([language]) => !selectedLanguage || language === selectedLanguage)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((nextLanguage) => localStorage.setItem("kitchen.app.language", nextLanguage), language);
    const loginPage = await context.newPage();
    const errors = [];
    loginPage.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
    loginPage.on("pageerror", (error) => errors.push(error.message));
    loginPage.on("requestfailed", (request) => errors.push(`failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
    await loginPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 5_000 });
    await waitFor(loginPage, `${language}: login bootstrap`, () => Boolean(document.querySelector(".auth-panel")));
    await expectVisibleText(loginPage, language, expectedSignIn, "login");
    if (await loginPage.evaluate(() => document.documentElement.lang) !== locale) throw new Error(`${language}: login language is not ${locale}`);
    // An unauthenticated session probe intentionally returns 401 before the
    // test installs its server-issued session; do not attribute that expected
    // transport response to the authenticated application console audit.
    errors.length = 0;
    await loginPage.close();
    const projectManagerPage = await context.newPage();
    const requests = [];
    projectManagerPage.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
    projectManagerPage.on("pageerror", (error) => errors.push(error.message));
    projectManagerPage.on("requestfailed", (request) => requests.push(`failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
    projectManagerPage.on("response", (response) => { if (response.status() >= 400) requests.push(`${response.status()} ${response.url()}`); });
    await installAuthSession(projectManagerPage, { autoStartWorkspace: false });
    await projectManagerPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 5_000 });
    await waitFor(projectManagerPage, `${language}: project-manager bootstrap`, () => Boolean(document.querySelector("[data-project-manager-new]")));
    await setLanguage(projectManagerPage, language, locale);
    await projectManagerPage.waitForTimeout(300);
    for (const required of [expectedNewProject, expectedBlankWorkspace]) {
      await expectVisibleText(projectManagerPage, language, required, "project manager");
    }

    if (selectedMode === "project-manager") {
      if (errors.length || requests.length) throw new Error(`${language}: project-manager browser failures: ${[...errors, ...requests].join(" | ")}`);
      results.push({ language, locale, projectManager: [expectedNewProject, expectedBlankWorkspace], consoleErrors: errors });
      await context.close();
      continue;
    }

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
      if (process.env.I18N_UI_DEBUG && message.type() !== "debug") console.log(`[i18n-ui:${language}] ${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => requests.push(`failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
    page.on("response", (response) => {
      if (response.status() >= 400) requests.push(`${response.status()} ${response.url()}`);
      if (process.env.I18N_UI_DEBUG && response.status() >= 400) console.log(`[i18n-ui:${language}] HTTP ${response.status()} ${response.url()}`);
    });
    await installAuthSession(page);
    await page.goto(new URL("/?workspace=1", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 5_000 });
    // The renderer/debug API is initialized after the asynchronous 3D scene.
    // Localization belongs to the shell and must be testable before that work
    // completes, otherwise a slow GPU masks a language regression.
    await waitFor(page, `${language}: workspace shell`, () => Boolean(document.getElementById("viewer") && document.getElementById("ribbon")));
    await setLanguage(page, language, locale);
    const workspaceLocale = await page.evaluate(() => document.documentElement.lang);
    if (workspaceLocale !== locale) throw new Error(`${language}: editor shell language is ${workspaceLocale}, expected ${locale}`);
    const fileMenuLabel = await page.evaluate(async () => (await import("/src/i18n/index.ts")).t("File"));
    if (fileMenuLabel !== expectedFile) throw new Error(`${language}: file menu label is ${JSON.stringify(fileMenuLabel)}, expected ${JSON.stringify(expectedFile)}`);
    for (const required of [expectedMaterials, expectedMargins, expectedBom]) {
      await expectVisibleText(page, language, required, "workspace shell");
    }
    for (const required of expectedTopbar[language]) {
      await expectVisibleText(page, language, required, "editor topbar");
    }
    if (errors.length || requests.length) throw new Error(`${language}: browser failures: ${[...errors, ...requests].join(" | ")}`);
    results.push({ language, locale, login: expectedSignIn, projectManager: [expectedNewProject, expectedBlankWorkspace], editor: [expectedFile, expectedMaterials, expectedMargins, expectedBom, ...expectedTopbar[language]], consoleErrors: errors });
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, variants: results }, null, 2));
} finally {
  await browser.close();
}
