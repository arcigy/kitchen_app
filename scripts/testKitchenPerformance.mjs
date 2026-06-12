import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const maxInteractiveMs = Number(process.env.KITCHEN_PERF_MAX_MS ?? 500);

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function clickButton(page, predicateSource) {
  return await page.evaluate((src) => {
    const predicate = new Function("title", "text", `return (${src})(title, text);`);
    const button = [...document.querySelectorAll("button")].find((item) =>
      predicate((item.getAttribute("title") || "").toLowerCase(), (item.textContent || "").toLowerCase())
    );
    if (!button) return { ok: false, ms: 0, title: "", text: "" };
    const startedAt = performance.now();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return {
      ok: true,
      ms: Math.round(performance.now() - startedAt),
      title: button.getAttribute("title") || "",
      text: button.textContent || ""
    };
  }, predicateSource);
}

async function monitorMainThread(page, durationMs = 650) {
  return await page.evaluate(
    (durationMs) =>
      new Promise((resolve) => {
        const startedAt = performance.now();
        let maxLongTaskMs = 0;
        let longTasks = 0;
        let observer = null;
        if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              longTasks += 1;
              maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
            }
          });
          observer.observe({ entryTypes: ["longtask"] });
        }
        window.setTimeout(() => {
          observer?.disconnect();
            resolve({
              ok: true,
              longTasks,
              maxLongTaskMs: Math.round(maxLongTaskMs),
              observedMs: Math.round(performance.now() - startedAt)
            });
        }, durationMs);
      }),
    durationMs
  );
}

async function measureCanvasPointerAction(page, label, action, durationMs = 650) {
  return await page.evaluate(
    ({ label, action, durationMs }) =>
      new Promise((resolve) => {
        const canvas = document.querySelector("#viewer canvas");
        if (!(canvas instanceof HTMLCanvasElement)) {
          resolve({ ok: false, label, ms: 0, longTasks: 0, maxLongTaskMs: 0, frameCount: 0, maxFrameGapMs: 0 });
          return;
        }
        const rect = canvas.getBoundingClientRect();
        let maxLongTaskMs = 0;
        let longTasks = 0;
        let observer = null;
        if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              longTasks += 1;
              maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
            }
          });
          observer.observe({ entryTypes: ["longtask"] });
        }

        let frameCount = 0;
        let maxFrameGapMs = 0;
        let previousFrameAt = performance.now();
        let running = true;
        const trackFrame = (now) => {
          if (!running) return;
          frameCount += 1;
          maxFrameGapMs = Math.max(maxFrameGapMs, now - previousFrameAt);
          previousFrameAt = now;
          requestAnimationFrame(trackFrame);
        };
        requestAnimationFrame(trackFrame);

        const point = (xRatio, yRatio) => ({
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        });
        const dispatchPointer = (type, xRatio, yRatio, extra = {}) => {
          const p = point(xRatio, yRatio);
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: extra.pointerId ?? 1,
              pointerType: "mouse",
              button: extra.button ?? 0,
              buttons: extra.buttons ?? (type === "pointermove" ? 0 : 1),
              clientX: p.clientX,
              clientY: p.clientY
            })
          );
        };
        const startedAt = performance.now();
        if (action === "place-center" || action === "place-right") {
          const x = action === "place-center" ? 0.52 : 0.62;
          dispatchPointer("pointermove", x, 0.55, { buttons: 0 });
          dispatchPointer("pointerdown", x, 0.55);
          dispatchPointer("pointerup", x, 0.55, { buttons: 0 });
          canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...point(x, 0.55) }));
        } else if (action === "ghost-sweep") {
          for (let i = 0; i < 12; i += 1) dispatchPointer("pointermove", 0.42 + i * 0.018, 0.52 + (i % 3) * 0.018, { buttons: 0 });
        } else if (action === "orbit") {
          dispatchPointer("pointerdown", 0.58, 0.48, { pointerId: 2, buttons: 1 });
          for (let i = 0; i < 36; i += 1) dispatchPointer("pointermove", 0.58 + i * 0.006, 0.48 + Math.sin(i / 4) * 0.025, { pointerId: 2, buttons: 1 });
          dispatchPointer("pointerup", 0.8, 0.5, { pointerId: 2, buttons: 0 });
        }
        const dispatchMs = Math.round(performance.now() - startedAt);
        window.setTimeout(() => {
          running = false;
          observer?.disconnect();
          resolve({
            ok: true,
            label,
            ms: dispatchMs,
            longTasks,
            maxLongTaskMs: Math.round(maxLongTaskMs),
            frameCount,
            maxFrameGapMs: Math.round(maxFrameGapMs),
            observedMs: Math.round(performance.now() - startedAt)
          });
        }, durationMs);
      }),
    { label, action, durationMs }
  );
}

async function measureNumberInput(page, labelIncludes, value, eventName = "change", settleMs = 650) {
  return await page.evaluate(
    ({ labelIncludes, value, eventName, settleMs }) =>
      new Promise((resolve) => {
      const row = [...document.querySelectorAll(".props-row")].find((candidate) =>
        (candidate.firstElementChild?.textContent || "").toLowerCase().includes(labelIncludes)
      );
      const input = row?.querySelector('input[type="number"]');
      if (!(input instanceof HTMLInputElement)) {
        resolve({
          ok: false,
          ms: 0,
          maxLongTaskMs: 0,
          labelIncludes,
          labels: [...document.querySelectorAll(".props-row")]
            .map((candidate) => candidate.firstElementChild?.textContent || "")
            .slice(0, 30)
        });
        return;
      }
      const startedAt = performance.now();
      let maxLongTaskMs = 0;
      let longTasks = 0;
      let observer = null;
      if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks += 1;
            maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      }
      input.value = String(value);
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
      const dispatchMs = Math.round(performance.now() - startedAt);
      window.setTimeout(() => {
        observer?.disconnect();
        resolve({
          ok: true,
          ms: dispatchMs,
          maxLongTaskMs: Math.round(maxLongTaskMs),
          longTasks,
          observedMs: Math.round(performance.now() - startedAt),
          eventName,
          labelIncludes
        });
      }, settleMs);
    }),
    { labelIncludes, value, eventName, settleMs }
  );
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

    const scenario = await page.evaluate(() =>
      window.__kitchenDebug.createKitchenScenario({
        addModule: false,
        path: [
          { x: 0, z: 0 },
          { x: 5200, z: 0 }
        ]
      })
    );
    const groupId = scenario.group.id;
    const frontMaterialId = scenario.group.ctx.frontsMaterialId;
    const lookupResult = await page.evaluate(async (materialId) => {
      const lookupUrl = new URL("/api/catalog/lookup", window.location.origin);
      lookupUrl.searchParams.set("kind", "material");
      lookupUrl.searchParams.set("family", "front");
      lookupUrl.searchParams.set("id", materialId);
      const response = await fetch(lookupUrl, { credentials: "same-origin" });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null)
      };
    }, frontMaterialId);
    assert(
      lookupResult.ok && lookupResult.body?.material?.id === frontMaterialId,
      "Backend exact material lookup failed",
      { status: lookupResult.status, lookupBody: lookupResult.body, frontMaterialId }
    );

    await page.evaluate((id) => window.__kitchenDebug.selectKitchenGroup(id), groupId);
    const domSelected = await page.evaluate(() => ({
      total: document.querySelectorAll("*").length,
      options: document.querySelectorAll("option").length,
      inputs: document.querySelectorAll("input").length,
      selects: document.querySelectorAll("select").length
    }));
    assert(domSelected.options <= 5 && domSelected.total < 1200, "Kitchen props DOM is too heavy", domSelected);

    const kitchenTab = await clickButton(page, `(title, text) => text.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").includes("kuch")`);
    assert(kitchenTab.ok, "Kitchen tab not found", kitchenTab);
    await page.waitForTimeout(1800);

    const editGroup = await clickButton(page, `(title, text) => title.includes("uprav") && title.includes("skup")`);
    assert(editGroup.ok && editGroup.ms < maxInteractiveMs, "Kitchen group edit is too slow", editGroup);
    const editSettle = await monitorMainThread(page, 650);
    assert(editSettle.maxLongTaskMs < maxInteractiveMs, "Kitchen group edit causes delayed main-thread jank", editSettle);

    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".props-row")].some((candidate) => {
          const label = (candidate.firstElementChild?.textContent || "").toLowerCase();
          return label.includes("horn") && candidate.querySelector('input[type="number"]');
        }),
      null,
      { timeout: 5000 }
    );
    const typing = await measureNumberInput(page, "horn", 731, "input");
    const upperChange = await measureNumberInput(page, "horn", 732, "change");
    const worktopDepth = await measureNumberInput(page, "pracovnej", 650, "change");
    for (const item of [typing, upperChange, worktopDepth]) {
      assert(item.ok && item.ms < maxInteractiveMs, "Kitchen context edit is too slow", item);
      assert(item.maxLongTaskMs < maxInteractiveMs, "Kitchen context edit causes delayed main-thread jank", item);
    }

    const drawerButton = await clickButton(page, `(title, text) => title === "fwm_base_drawer_cabinet"`);
    assert(drawerButton.ok && drawerButton.ms < maxInteractiveMs, "FWM module button is too slow", drawerButton);
    const drawerSettle = await monitorMainThread(page, 650);
    assert(drawerSettle.maxLongTaskMs < maxInteractiveMs, "FWM module insert causes delayed main-thread jank", drawerSettle);

    const ghostMove = await measureCanvasPointerAction(page, "ghost-sweep-1", "ghost-sweep", 650);
    assert(ghostMove.ok && ghostMove.ms < maxInteractiveMs, "Placement ghost move is too slow", ghostMove);
    assert(ghostMove.maxLongTaskMs < maxInteractiveMs, "Placement ghost move causes delayed main-thread jank", ghostMove);

    const placeFirst = await measureCanvasPointerAction(page, "place-module-1", "place-center", 650);
    assert(placeFirst.ok && placeFirst.ms < maxInteractiveMs, "First module placement is too slow", placeFirst);
    assert(placeFirst.maxLongTaskMs < maxInteractiveMs, "First module placement causes delayed main-thread jank", placeFirst);

    const shelfButton = await clickButton(page, `(title, text) => title === "fwm_base_shelf_cabinet"`);
    assert(shelfButton.ok && shelfButton.ms < maxInteractiveMs, "Second FWM module button is too slow", shelfButton);
    const shelfSettle = await monitorMainThread(page, 650);
    assert(shelfSettle.maxLongTaskMs < maxInteractiveMs, "Second FWM module insert causes delayed main-thread jank", shelfSettle);

    const ghostMoveSecond = await measureCanvasPointerAction(page, "ghost-sweep-2", "ghost-sweep", 650);
    assert(ghostMoveSecond.ok && ghostMoveSecond.ms < maxInteractiveMs, "Second placement ghost move is too slow", ghostMoveSecond);
    assert(ghostMoveSecond.maxLongTaskMs < maxInteractiveMs, "Second placement ghost move causes delayed main-thread jank", ghostMoveSecond);

    const placeSecond = await measureCanvasPointerAction(page, "place-module-2", "place-right", 650);
    assert(placeSecond.ok && placeSecond.ms < maxInteractiveMs, "Second module placement is too slow", placeSecond);
    assert(placeSecond.maxLongTaskMs < maxInteractiveMs, "Second module placement causes delayed main-thread jank", placeSecond);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const state = window.__kitchenDebug?.viewState?.();
      if (state?.activeViewerTab === "3d") return;
      const button = [...document.querySelectorAll("button")].find((item) => (item.textContent || "").trim().toLowerCase() === "3d");
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(250);
    const orbit = await measureCanvasPointerAction(page, "3d-orbit", "orbit", 900);
    assert(orbit.ok && orbit.maxLongTaskMs < maxInteractiveMs, "3D orbit causes delayed main-thread jank", orbit);

    await page.keyboard.press("Escape");

    const finalErrors = consoleErrors.filter((entry) => !entry.includes("favicon"));
    assert(finalErrors.length === 0, "Console errors during kitchen performance test", finalErrors);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          maxInteractiveMs,
          lookup: { materialId: frontMaterialId },
          domSelected,
          timings: {
            editGroup,
            editSettle,
            drawerButton,
            drawerSettle,
            placeFirst,
            shelfButton,
            shelfSettle,
            ghostMoveSecond,
            placeSecond,
            orbit,
            ghostMove,
            typing,
            upperChange,
            worktopDepth
          }
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
