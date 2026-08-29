import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function rightClickAt(page, point) {
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.waitForSelector(".arcigy-context-menu", { state: "visible" });
}

async function menuActionIds(page) {
  return page.locator("[data-context-menu-action]").evaluateAll((items) => items.map((item) => item.getAttribute("data-context-menu-action")));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installAuthSession(page);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${message.text()} (${message.location().url || "unknown-url"})`);
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });
    const canvasBox = await page.locator("#viewer canvas").first().boundingBox();
    assert(canvasBox && canvasBox.width > 300 && canvasBox.height > 300, "Editor canvas is not visible", canvasBox);

    await rightClickAt(page, { x: canvasBox.x + 24, y: canvasBox.y + 24 });
    const blankActions = await menuActionIds(page);
    assert(blankActions.includes("undo") && blankActions.includes("redo") && blankActions.includes("reset-view") && blankActions.includes("save-project"), "Blank editor menu is incomplete", blankActions);
    await page.keyboard.press("Escape");

    const keyboardTarget = page.locator("[data-workspace-nav='design']");
    await keyboardTarget.focus();
    await page.keyboard.press("Shift+F10");
    await page.waitForSelector(".arcigy-context-menu", { state: "visible" });
    assert((await menuActionIds(page)).includes("view-properties"), "Keyboard context menu did not open the global provider");
    await page.keyboard.press("Escape");

    const wall = await page.evaluate(() => window.__kitchenDebug.createWall({
      aMm: { x: -700, z: 0 },
      bMm: { x: 700, z: 0 },
      thicknessMm: 100
    }));
    assert(wall?.id, "Debug wall could not be created", wall);
    const wallPoint = await page.evaluate(() => window.__kitchenDebug.projectPlanPoint({ x: 0, z: 0 }));
    await rightClickAt(page, wallPoint);
    const wallActions = await menuActionIds(page);
    assert(
      ["properties", "move", "rotate", "duplicate", "hide-selection", "isolate-selection", "delete"].every((id) => wallActions.includes(id)),
      "Selected wall menu is incomplete",
      wallActions
    );

    await page.locator("[data-context-menu-action='move']").click();
    await rightClickAt(page, wallPoint);
    const commandActions = await menuActionIds(page);
    assert(commandActions.includes("cancel-command") && commandActions.includes("toggle-snap") && !commandActions.includes("delete"), "Move command menu is not command-scoped", commandActions);
    await page.locator("[data-context-menu-action='cancel-command']").click();

    await rightClickAt(page, { x: canvasBox.x + canvasBox.width - 2, y: canvasBox.y + canvasBox.height - 2 });
    const menuBox = await page.locator(".arcigy-context-menu").boundingBox();
    const viewport = page.viewportSize();
    assert(menuBox && viewport && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= viewport.width && menuBox.y + menuBox.height <= viewport.height, "Context menu escaped the viewport", { menuBox, viewport });
    await page.keyboard.press("Escape");

    const nativeEditableMenu = await page.evaluate(() => {
      const input = document.querySelector("input");
      if (!(input instanceof HTMLInputElement)) return null;
      return input.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    assert(nativeEditableMenu !== false, "An editable input lost its native context menu", nativeEditableMenu);
    assert(consoleErrors.length === 0, "Unexpected browser console errors", consoleErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      checks: ["blank-editor", "keyboard-open", "wall-target-selection", "move-command", "viewport-clamp", "native-input-menu", "console-errors"],
      consoleErrors
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  if (error?.context) console.error(JSON.stringify(error.context, null, 2));
  process.exitCode = 1;
});
