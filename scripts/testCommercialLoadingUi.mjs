import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { installAuthSession } from './uiAuthSession.mjs';

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? 'http://127.0.0.1:5180/';
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Requires an isolated localhost runtime');
if ((await (await fetch(new URL('/ready', baseUrl))).json()).storage !== 'file') throw new Error('Requires disposable file storage');
const output = '.tmp/commercial-loading-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1745, height: 859 } });
const errors = [], checks = [], layouts = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
let saves = 0;
page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/save')) saves++; });
try {
  await installAuthSession(page, { autoStartWorkspace: false });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-project-manager-form]', { state: 'attached' });
  const newsClose = page.locator('.release-news-close');
  if (await newsClose.isVisible()) await page.keyboard.press("Escape");
  if (!await page.locator('[data-project-manager-form]').isVisible()) await page.locator('[data-project-manager-new]').click();
  await page.locator('input[name="name"]').fill(`QA Commercial loading ${Date.now()}`);
  await page.locator('input[name="address"]').fill('QA');
  await page.locator('input[name="contactName"]').fill('QA');
  await page.locator('[data-project-manager-form] button[type="submit"]').click();
  await page.waitForFunction(() => Boolean(window.__kitchenDebug));
  await page.evaluate(() => {
    const api = window.__kitchenDebug;
    const fixture = api.createKitchenScenario({ path: [{ x: 0, z: 0 }, { x: 6000, z: 0 }], moduleType: 'fwm_catalog_base_doors', offsetAlongMm: 300 });
    for (let index = 1; index < 6; index++) api.addKitchenModule(fixture.group.id, { type: 'fwm_catalog_base_doors', offsetAlongMm: 300 + index * 700 });
  });
  const saving = page.waitForResponse(response => response.url().endsWith('/save') && response.request().method() === 'POST');
  await page.locator('[data-quick-action="save"]').click();
  const saved = await (await saving).json();
  const projectId = saved.save.projectId;
  const endpoint = new URL(`/api/projects/${projectId}/margins`, baseUrl).toString();
  const actual = (await (await page.request.get(endpoint)).json()).view;
  assert(actual.source?.projectId === projectId && actual.source?.phaseId === saved.save.activePhaseId, 'API returns project, phase and source revisions');
  const firstScope = actual.groups.flatMap(group => group.items).find(item => item.scopeId.startsWith('module:'))?.scopeId;
  assert(Boolean(firstScope), 'Real six-cabinet project produces module margin items');
  let count = 6;
  await page.route(endpoint, async route => {
    const view = structuredClone(actual);
    for (const group of view.groups) {
      const moduleItems = group.items.filter(item => item.scopeId === firstScope);
      group.items = [...group.items.filter(item => !item.scopeId.startsWith('module:')),
        ...Array.from({ length: count }, (_, index) => moduleItems.map(item => ({ ...item, scopeId: `module:qa-${index}`, scopeLabel: `Skrinka #${index + 1}`, targetId: `qa-${index}:${item.itemId}` }))).flat()];
    }
    await route.fulfill({ json: { ok: true, view } });
  });
  const openMargins = async () => {
    await page.locator('[data-workspace-nav="margins"]').click();
    await page.waitForFunction(() => document.querySelector('[data-margin-phase-state]')?.getAttribute('data-margin-phase-state') === 'ready');
    await page.locator('[data-margin-settings-tab="general"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-manufacturing-save]:not(:disabled)')));
  };
  // Desktop zoom changes the CSS viewport. Test both physical window sizes at
  // the equivalent CSS dimensions of 100%, 125% and 150% browser zoom.
  for (count of [6, 30, 100]) for (const [width, height] of [[1745, 859], [1366, 768]]) for (const zoom of [1, 1.25, 1.5]) {
    await page.setViewportSize({ width: 1745, height: 859 });
    await page.locator('[data-workspace-nav="design"]').click();
    await openMargins();
    await page.setViewportSize({ width: Math.round(width / zoom), height: Math.round(height / zoom) });
    for (const settingsTab of ['general', 'modules', 'additions']) {
    await page.locator(`[data-margin-settings-tab="${settingsTab}"]`).click();
    if (settingsTab === 'general') {
      const settings = page.locator('[data-margin-project-controls]');
      if (await settings.evaluate(element => element.open)) await settings.locator('summary').click();
      await page.locator('[data-margin-settings-scroll]').evaluate(scroll => { scroll.scrollTop = 0; });
      const density = await page.locator('[data-margin-groups]').evaluate(groups => {
        const scroll = groups.closest('[data-margin-settings-scroll]').getBoundingClientRect();
        const cards = [...groups.querySelectorAll('[data-margin-group]')].map(card => card.getBoundingClientRect());
        return { columns: new Set(cards.filter(card => card.top === cards[0]?.top).map(card => card.left)).size,
          visible: cards.filter(card => card.top >= scroll.top && card.bottom <= scroll.bottom).length,
          overflow: document.querySelector('[data-margin-settings-scroll]').scrollWidth > document.querySelector('[data-margin-settings-scroll]').clientWidth };
      });
      assert(!density.overflow, 'Category overview has no horizontal overflow at every tested zoom');
      if (zoom === 1) assert(density.columns >= (width === 1745 ? 4 : 3) && density.visible >= (width === 1745 ? 8 : 6), `Dense category overview shows ${density.visible} complete cards in ${density.columns} columns at ${width}, including missing-price notices`);
      await settings.locator('summary').click();
    }
    if (settingsTab === 'modules') {
      const scopes = page.locator('[data-margin-scope-select]');
      if (await scopes.count()) await scopes.selectOption(`module:qa-${count - 1}`);
    }
    const controls = page.locator('#marginsPhase [data-margin-settings-scroll] input, #marginsPhase [data-margin-settings-scroll] button, #marginsPhase [data-margin-settings-scroll] select');
    const measurement = await page.locator('[data-margin-settings-scroll]').evaluate(scroll => ({ height: scroll.clientHeight, total: scroll.scrollHeight }));
    assert(measurement.height > 40, `${count} cabinets / ${width}×${height} / ${zoom * 100}% has a usable scroll region`);
    // Every currently displayed control must be inside the scroll owner and
    // reachable without scrolling the hidden phase host.
    const reachability = await controls.evaluateAll(elements => {
      const scroll = document.querySelector('[data-margin-settings-scroll]');
      const inaccessible = [];
      for (const element of elements) {
        if (!element.getClientRects().length) continue;
        element.scrollIntoView({ block: 'center' });
        const outer = scroll.getBoundingClientRect(), rect = element.getBoundingClientRect();
        if (rect.bottom < outer.top || rect.top > outer.bottom || rect.top < 0 || rect.bottom > innerHeight) inaccessible.push(element.outerHTML.slice(0, 100));
      }
      return inaccessible;
    });
    assert(reachability.length === 0, `All ${await controls.count()} ${settingsTab} controls are reachable at ${count}/${width}/${zoom}`);
    const navigation = await page.locator('.margins-navigation').boundingBox();
    assert(navigation && navigation.y >= 0 && navigation.y + navigation.height < Math.round(height / zoom), `Tabs, search and filters remain visible above the scroll at ${count}/${width}/${zoom}: ${JSON.stringify(navigation)}`);
    assert(await page.locator('[data-preassembly-instance]').count() <= 1, 'Only selected cabinet preassembly is rendered');
    layouts.push({ count, windowWidth: width, windowHeight: height, zoom, settingsTab, ...measurement });
    }
  }
  await page.setViewportSize({ width: 1745, height: 859 });
  await page.locator('[data-margin-settings-tab="modules"]').click();
  await page.locator('[data-margin-search]').fill('Skrinka 100');
  assert(await page.locator('[data-margin-scope-select] option').count() === 1, 'Search finds the last of 100 cabinets');
  assert(await page.locator('[data-margin-scope-select]').inputValue() === 'module:qa-99', 'Search displays matching cabinet details');
  await page.locator('[data-margin-search-clear]').click();
  await page.locator('[data-margin-settings-tab="general"]').click();
  await page.locator('[data-margin-settings-scroll]').evaluate(scroll => { scroll.scrollTop = 0; });
  await page.screenshot({ path: `${output}/margins-project.png` });
  await page.locator('[data-margin-settings-tab="modules"]').click();
  await page.locator('[data-margin-settings-scroll]').evaluate(scroll => { scroll.scrollTop = 0; });
  await page.screenshot({ path: `${output}/margins-cabinet.png` });
  const before = saves;
  await page.locator('[data-workspace-nav="design"]').click(); await openMargins();
  await page.locator('[data-workspace-nav="design"]').click(); await openMargins();
  assert(saves === before, 'Reopening an unchanged project does not save it again');

  await page.locator('[data-workspace-nav="design"]').click();
  await page.unroute(endpoint);
  let pendingRoute;
  await page.route(endpoint, route => { pendingRoute = route; });
  await page.locator('[data-workspace-nav="margins"]').click();
  await page.waitForFunction(() => Boolean(document.querySelector('.margins-phase__status')));
  await page.evaluate(() => {
    const panel = document.getElementById('marginsPhase');
    const button = document.querySelector('[data-workspace-nav="design"]');
    if (!panel || panel.hidden || !button) throw new Error('Pending margin navigation fixture is not visible');
    button.addEventListener('click', () => {
      performance.mark('qa-margin-navigation-click');
      const observer = new MutationObserver(() => {
        if (!panel.hidden) return;
        performance.mark('qa-margin-navigation-hidden');
        performance.measure('qa-margin-navigation', 'qa-margin-navigation-click', 'qa-margin-navigation-hidden');
        observer.disconnect();
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }, { capture: true, once: true });
  });
  // Measure the application's input-to-DOM response in the browser. The driver
  // also waits for actionability and protocol round trips on a shared CI runner.
  const driverStarted = performance.now();
  await page.locator('[data-workspace-nav="design"]').click();
  await page.waitForFunction(() => performance.getEntriesByName('qa-margin-navigation', 'measure').length === 1);
  const driverNavigationMs = performance.now() - driverStarted;
  const navigationMs = await page.evaluate(() => performance.getEntriesByName('qa-margin-navigation', 'measure')[0].duration);
  assert(navigationMs < 250, `Navigation during a pending read took ${Math.round(navigationMs)} ms; driver took ${Math.round(driverNavigationMs)} ms`);
  if (pendingRoute) await pendingRoute.abort().catch(() => {});
  await page.unroute(endpoint);
  let failNextRead = true;
  await page.route(endpoint, async route => {
    if (failNextRead) {
      failNextRead = false;
      await route.fulfill({ status: 503, json: { error: 'QA temporary server failure' } });
    } else await route.fulfill({ json: { ok: true, view: actual } });
  });
  await page.locator('[data-workspace-nav="margins"]').click();
  const retry = page.locator('[data-phase-retry]');
  await retry.waitFor();
  assert(await retry.isVisible(), 'Retry after a failed cached read is visible outside the long settings scroll');
  assert(await page.locator('[data-manufacturing-board-waste]').isDisabled(), 'Cached values remain read-only after a read failure');
  await retry.click();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-manufacturing-save]:not(:disabled)')));
  await page.unroute(endpoint);
  // Current healthy browser state is checked after intentional cancellation.
  errors.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kitchenDebug) && !document.querySelector('.viewer-startup'));
  if (await page.locator('.release-news-close').isVisible()) await page.keyboard.press('Escape');
  await page.locator('[data-workspace-nav="materials"]').click();
  await page.locator('.materials-settings-tabs').waitFor();
  await page.locator('[data-material-board-waste]').waitFor();
  assert(errors.length === 0, `Current console errors: ${errors.length}`);
  await page.screenshot({ path: `${output}/materials.png` });
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, layouts, errors, navigationMs, driverNavigationMs }, null, 2));
  console.log(JSON.stringify({ checks, layouts, errors, navigationMs, driverNavigationMs }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.txt`, String(error.stack) + '\n' + JSON.stringify(errors));
  throw error;
} finally { await browser.close(); }
