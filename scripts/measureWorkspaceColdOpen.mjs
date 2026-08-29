import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = new URL(process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/");

function assertIsolatedLoopbackTarget() {
  if (process.env.ALLOW_ARCIGY_BROWSER_PERF !== "true") {
    throw new Error("Set ALLOW_ARCIGY_BROWSER_PERF=true to run the isolated browser performance harness.");
  }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(baseUrl.hostname)) {
    throw new Error("Workspace cold-open measurement is restricted to an isolated loopback runtime.");
  }
}

async function main() {
  assertIsolatedLoopbackTarget();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const appDataResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const route = new URL(response.url()).pathname;
    if (route !== "/api/app-data/revision" && route !== "/api/catalog/bootstrap" && route !== "/api/modules") return;
    const timing = response.request().timing();
    appDataResponses.push({
      route,
      status: response.status(),
      startedAtEpochMs: timing.startTime,
      durationMs: Math.round(Math.max(0, timing.responseEnd)),
      compressedBytes: Number(response.headers()["content-length"] ?? 0)
    });
  });

  await page.addInitScript(() => {
    const state = {
      startedAt: 0,
      longTasks: [],
      observer: null
    };
    window.__arcigyColdOpenMeasurement = state;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      state.observer = new PerformanceObserver((list) => {
        if (!state.startedAt) return;
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
      });
      state.observer.observe({ entryTypes: ["longtask"] });
    }
  });

  try {
    await installAuthSession(page, { autoStartWorkspace: false });
    await page.goto(baseUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-project-manager-blank]", { timeout: 30_000 });
    const workspaceClickEpochMs = await page.evaluate(() => {
      const measurement = window.__arcigyColdOpenMeasurement;
      measurement.startedAt = performance.now();
      measurement.longTasks = [];
      const button = document.querySelector("[data-project-manager-blank]");
      if (!(button instanceof HTMLButtonElement)) throw new Error("Blank workspace button is unavailable.");
      button.click();
      return Date.now();
    });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 90_000 });
    const result = await page.evaluate(() => {
      const measurement = window.__arcigyColdOpenMeasurement;
      measurement.observer?.disconnect();
      const resources = performance.getEntriesByType("resource")
        .map((entry) => ({ entry, path: new URL(entry.name).pathname }))
        .filter(({ path }) => path === "/api/app-data/revision" || path === "/api/catalog/bootstrap" || path === "/api/modules")
        .map(({ entry, path }) => {
          const timing = entry;
          return {
            route: path,
            startOffsetMs: Math.round(timing.startTime - measurement.startedAt),
            durationMs: Math.round(timing.duration),
            transferBytes: timing.transferSize,
            encodedBodyBytes: timing.encodedBodySize,
            decodedBodyBytes: timing.decodedBodySize
          };
        });
      const longTasks = measurement.longTasks;
      return {
        workspaceStartMs: Math.round(performance.now() - measurement.startedAt),
        longTaskCount: longTasks.length,
        maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
        totalLongTaskMs: Math.round(longTasks.reduce((sum, duration) => sum + duration, 0)),
        resources
      };
    });
    if (consoleErrors.length > 0) throw new Error(`Unexpected browser console errors: ${consoleErrors.join(" | ")}`);
    const responses = appDataResponses.map((response) => ({
      route: response.route,
      status: response.status,
      startOffsetFromClickMs: Math.round(response.startedAtEpochMs - workspaceClickEpochMs),
      durationMs: response.durationMs,
      compressedBytes: response.compressedBytes
    }));
    console.log(JSON.stringify({ ok: true, target: baseUrl.origin, ...result, responses, consoleErrors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
