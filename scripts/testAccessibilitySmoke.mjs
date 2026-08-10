import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

function attachErrorCapture(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function auditSurface(page, surface) {
  const result = await page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const referencedText = (element, attribute) =>
      normalize(
        normalize(element.getAttribute(attribute))
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
      );
    const accessibleName = (element) => {
      const labelled = referencedText(element, "aria-labelledby");
      if (labelled) return labelled;
      const ariaLabel = normalize(element.getAttribute("aria-label"));
      if (ariaLabel) return ariaLabel;
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const label = normalize(Array.from(element.labels ?? []).map((item) => item.textContent ?? "").join(" "));
        if (label) return label;
      }
      if (element instanceof HTMLImageElement) return normalize(element.alt);
      const text = normalize(element.textContent);
      if (text) return text;
      return normalize(element.getAttribute("title"));
    };
    const descriptor = (element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      class: element.getAttribute("class") || undefined,
      type: element.getAttribute("type") || undefined
    });

    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const missingAriaReferences = [];
    for (const element of document.querySelectorAll("[aria-labelledby], [aria-describedby], [aria-controls], [aria-owns]")) {
      for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
        for (const id of normalize(element.getAttribute(attribute)).split(" ").filter(Boolean)) {
          if (!document.getElementById(id)) missingAriaReferences.push({ ...descriptor(element), attribute, id });
        }
      }
    }

    const controls = visible("button, a[href], input:not([type='hidden']), select, textarea");
    const unnamedControls = controls.filter((element) => !accessibleName(element)).map(descriptor);
    const unnamedDialogs = visible("[role='dialog'], dialog").filter((element) => !accessibleName(element)).map(descriptor);
    const imagesWithoutAlt = visible("img").filter((element) => !element.hasAttribute("alt")).map(descriptor);
    const canvasesWithoutName = visible("canvas")
      .filter((canvas) => {
        if (accessibleName(canvas)) return false;
        return !canvas.closest("[aria-label], [aria-labelledby]");
      })
      .map(descriptor);
    const positiveTabIndex = visible("[tabindex]")
      .filter((element) => Number(element.getAttribute("tabindex")) > 0)
      .map(descriptor);
    const mainLandmarks = visible("main, [role='main']");

    return {
      lang: normalize(document.documentElement.lang),
      title: normalize(document.title),
      duplicateIds,
      missingAriaReferences,
      unnamedControls,
      unnamedDialogs,
      imagesWithoutAlt,
      canvasesWithoutName,
      positiveTabIndex,
      mainLandmarkCount: mainLandmarks.length,
      visibleControlCount: controls.length,
      visibleCanvasCount: visible("canvas").length
    };
  });

  assert(result.lang === "sk-SK", `${surface}: expected Slovak BCP 47 document language`, result);
  assert(result.title, `${surface}: document title is missing`, result);
  assert(result.mainLandmarkCount === 1, `${surface}: expected exactly one visible main landmark`, result);
  assert(result.duplicateIds.length === 0, `${surface}: duplicate IDs found`, result);
  assert(result.missingAriaReferences.length === 0, `${surface}: broken ARIA references found`, result);
  assert(result.unnamedControls.length === 0, `${surface}: visible controls without accessible names found`, result);
  assert(result.unnamedDialogs.length === 0, `${surface}: visible dialogs without accessible names found`, result);
  assert(result.imagesWithoutAlt.length === 0, `${surface}: visible images without alt attributes found`, result);
  assert(result.canvasesWithoutName.length === 0, `${surface}: visible canvases without an accessible label found`, result);
  assert(result.positiveTabIndex.length === 0, `${surface}: positive tabindex found`, result);
  assert(result.visibleControlCount >= 3, `${surface}: too few visible controls for keyboard smoke`, result);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const focusStops = [];
  for (let index = 0; index < 12 && new Set(focusStops).size < 3; index += 1) {
    await page.keyboard.press("Tab");
    focusStops.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return "none";
        return [active.tagName.toLowerCase(), active.id, active.getAttribute("name"), active.getAttribute("aria-label"), active.textContent]
          .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(":")
          .slice(0, 180);
      })
    );
  }
  const uniqueFocusStops = [...new Set(focusStops.filter((item) => item !== "none"))];
  assert(uniqueFocusStops.length >= 3, `${surface}: keyboard Tab did not reach three distinct controls`, {
    ...result,
    focusStops: uniqueFocusStops
  });

  return { ...result, focusStops: uniqueFocusStops.slice(0, 3) };
}

async function loginAudit(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = attachErrorCapture(page);
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".auth-shell").waitFor({ state: "visible" });
    const result = await auditSurface(page, "login");
    const unexpectedErrors = errors.filter(
      (entry) => !entry.includes("Failed to load resource: the server responded with a status of 401 (Unauthorized)")
    );
    assert(unexpectedErrors.length === 0, "login: unexpected browser errors found", unexpectedErrors);
    return result;
  } finally {
    await context.close();
  }
}

async function projectManagerAudit(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = attachErrorCapture(page);
  try {
    await installAuthSession(page, { autoStartWorkspace: false });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".project-manager-shell").waitFor({ state: "visible" });
    await page.locator("[data-project-manager-new]").waitFor({ state: "visible" });
    const result = await auditSurface(page, "project-manager");
    assert(errors.length === 0, "project-manager: browser errors found", errors);
    return result;
  } finally {
    await context.close();
  }
}

async function editorAudit(browser) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = attachErrorCapture(page);
  try {
    await installAuthSession(page);
    await page.goto(new URL("/?workspace=1", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__kitchenDebug), undefined, { timeout: 120_000 });
    await page.locator("#viewer canvas").first().waitFor({ state: "visible", timeout: 120_000 });
    const result = await auditSurface(page, "editor");
    assert(errors.length === 0, "editor: browser errors found", errors);
    return result;
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const login = await loginAudit(browser);
    const projectManager = await projectManagerAudit(browser);
    const editor = await editorAudit(browser);
    console.log(
      JSON.stringify(
        {
          ok: true,
          note: "Automated accessibility baseline only; manual screen-reader, contrast and zoom acceptance remain required.",
          surfaces: { login, projectManager, editor }
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
  if (error.context) console.error(JSON.stringify(error.context, null, 2));
  process.exitCode = 1;
});
