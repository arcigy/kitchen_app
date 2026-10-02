import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { installAuthSession } from './uiAuthSession.mjs';

const baseUrl = process.env.KITCHEN_UI_BASE_URL;
if (!baseUrl || !['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Isolated local runtime required');
if ((await (await fetch(new URL('/ready', baseUrl))).json()).storage !== 'file') throw new Error('Disposable file storage required');
const output = '.tmp/materials-feedback-51-55-ui'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const snapshot = page => page.evaluate(() => window.__kitchenDebug.layoutSnapshot());
let page;
async function createProject(label, importPackage = false) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const current = await context.newPage();
  current.on('pageerror', error => errors.push(String(error)));
  current.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAuthSession(current, { autoStartWorkspace: false }); await current.goto(baseUrl);
  if (importPackage) {
    const ok = await current.evaluate(async () => {
      const { extendedFurnitureModulePackages } = await import('/src/system/module-packages/extendedFurniture.ts');
      const pkg = structuredClone(extendedFurnitureModulePackages.find(p => p.module.moduleType === 'fwm_catalog_base_drawers'));
      return (await fetch('/api/modules/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: pkg }) })).ok;
    });
    assert(ok, 'Cabinet fixture is assigned to the isolated company'); await current.reload();
  }
  await current.waitForSelector('[data-project-manager-form]', { state: 'attached' });
  if (await current.locator('dialog[open]').count()) await current.keyboard.press('Escape');
  if (!await current.locator('[data-project-manager-form]').isVisible()) await current.locator('[data-project-manager-new]').click();
  await current.locator('input[name="name"]').fill(`QA Materials ${label} ${Date.now()}`);
  await current.locator('input[name="address"]').fill('QA'); await current.locator('input[name="contactName"]').fill('QA');
  await current.locator('[data-project-manager-form] button[type="submit"]').click();
  await current.waitForFunction(() => !!window.__kitchenDebug);
  const fixture = await current.evaluate(() => window.__kitchenDebug.createKitchenScenario({ path: [{ x: 0, z: 0 }, { x: 4000, z: 0 }], moduleType: 'fwm_catalog_base_drawers', offsetAlongMm: 200 }));
  await current.getByRole('button', { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).click();
  const id = fixture.instances[0].id;
  await current.evaluate(id => window.__kitchenDebug.selectModule(id), id);
  return { page: current, id, group: fixture.group.id };
}
async function selectPreset(current, id, presetId) {
  await current.evaluate(id => window.__kitchenDebug.selectModule(id), id);
  await current.locator('[data-module-parameter-preset-trigger]').click();
  await current.locator(`[data-parameter-preset-id="${presetId}"]`).click();
  await current.waitForFunction(({ id, presetId }) => window.__kitchenDebug.layoutSnapshot().instances.find(i => i.id === id)?.params.moduleLabor?.preset?.presetId === presetId, { id, presetId });
}
const projectIdsByPage = new WeakMap();
async function save(current) {
  await current.locator('body.project-save-blocking').waitFor({ state: 'hidden' });
  const projectId = projectIdsByPage.get(current);
  if (!projectId) {
    const [response] = await Promise.all([
      current.waitForResponse(r => r.url().endsWith('/save') && r.request().method() === 'POST', { timeout: 90_000 }),
      current.locator('[data-quick-action="save"]').click(),
    ]);
    if (!response.ok()) throw new Error(await response.text());
    const saved = (await response.json()).save;
    projectIdsByPage.set(current, saved.projectId);
    return saved;
  }
  const completed = current.evaluate(() => new Promise(resolve => {
    const body = document.body;
    let observedLock = body.classList.contains('project-save-blocking');
    const observer = new MutationObserver(records => {
      if (body.classList.contains('project-save-blocking') || records.some(record =>
        (record.oldValue ?? '').split(/\s+/).includes('project-save-blocking')
      )) observedLock = true;
      if (observedLock && !body.classList.contains('project-save-blocking')) {
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve(true);
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 90_000);
    observer.observe(body, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  }));
  await current.locator('[data-quick-action="save"]').click();
  if (!await completed) throw new Error('Project save did not finish within 90 seconds.');
  const response = await current.request.get(new URL(`/api/projects/${encodeURIComponent(projectId)}/load`, baseUrl).toString());
  if (!response.ok()) throw new Error(await response.text());
  return (await response.json()).save;
}

try {
  const fixture = await createProject('clipboard and boards', true); page = fixture.page;
  const original = await save(page); const projectId = original.projectId;
  const view = async () => (await (await page.request.get(new URL(`/api/projects/${projectId}/materials`, baseUrl).toString())).json()).view;
  const assignment = async category => (await view()).assignments.assignments.find(item => item.assignmentId === `material-assignment:${category}`);
  const row = category => page.locator(`[data-material-assignment-id="material-assignment:${category}"]`).first();
  await page.locator('[data-workspace-nav="materials"]').click();
  await row('corpus').waitFor();
  const source = await assignment('corpus'), oldBottom = await assignment('drawer_bottom');
  await row('corpus').click(); await page.keyboard.press('Control+c');
  await page.getByRole('status').filter({ hasText: 'Materiál je skopírovaný.' }).waitFor();
  assert(await page.locator('.app-toast--top').count() === 1, 'Copy confirmation appears at top center');
  await row('drawer_bottom').click(); await page.keyboard.press('Control+v');
  await page.getByRole('status').filter({ hasText: 'Materiál bol vložený.' }).waitFor();
  assert(isDeepStrictEqual((await assignment('drawer_bottom')).snapshots, source.snapshots), 'Ctrl+C/V copies product and captured price to a compatible category');
  const beforeBad = await assignment('worktop'); await row('worktop').click(); await page.keyboard.press('Control+v');
  await page.getByRole('alert').filter({ hasText: 'kompatibil' }).waitFor();
  assert(isDeepStrictEqual(await assignment('worktop'), beforeBad), 'Incompatible paste shows error and preserves destination');
  await row('drawer_bottom').click(); await page.keyboard.press('Meta+x'); await page.getByRole('status').filter({ hasText: 'vystrihnutý' }).waitFor();
  assert(!(await assignment('drawer_bottom')).materialId, 'Command+X clears the product');
  await page.keyboard.press('Meta+z'); await page.getByRole('status').filter({ hasText: 'vrátená' }).waitFor();
  assert((await assignment('drawer_bottom')).materialId === source.materialId, 'Command+Z restores the cut material');
  await page.keyboard.press('Delete'); await page.getByRole('status').filter({ hasText: 'vymazané' }).waitFor();
  await page.keyboard.press('Control+z'); await page.getByRole('status').filter({ hasText: 'vrátená' }).waitFor();
  assert((await assignment('drawer_bottom')).materialId === source.materialId, 'Delete and Ctrl+Z persist a reversible change');
  await page.locator('[data-add-board="dimensions"]').click(); await page.getByRole('dialog', { name: 'Pridať doskový dielec', exact: true }).waitFor();
  await page.getByLabel('Názov dielca', { exact: true }).fill('QA cover panel');
  await page.getByLabel('Hrúbka (mm)', { exact: true }).fill('18.1');
  await page.getByLabel('Dĺžka (mm)', { exact: true }).fill('720'); await page.getByLabel('Šírka / výška dielca (mm)', { exact: true }).fill('360');
  await page.locator('body.project-secondary-writer').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Pridať dielec', exact: true }).click(); await page.getByRole('dialog', { name: 'Pridať doskový dielec', exact: true }).waitFor({ state: 'detached' });
  const board = (await snapshot(page)).customFurniture.find(item => item.params.name === 'QA cover panel');
  assert(board?.params.boards[0].profile[2].x === 720 && board.params.boards[0].profile[2].y === 360 && board.params.boards[0].thicknessMm === 18, 'Decimal supplier thickness is accepted and uses the existing whole-millimetre board normalization');
  await page.getByRole('button', { name: 'Close Custom Furniture Editor', exact: true }).click();
  await save(page); await page.locator('[data-workspace-nav="margins"]').click();
  await page.locator('[data-margin-construction-input]').fill('10');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/margins') && r.request().method() === 'PUT'), page.locator('[data-margin-construction-save]').click()]);
  // The response may precede the UI rerender, so read the persisted authority as well.
  const margins = (await (await page.request.get(new URL(`/api/projects/${projectId}/margins`, baseUrl).toString())).json()).view;
  assert(margins.settings.constructionLaborPercent === 10 && margins.constructionLabor.amount > 0, 'Construction percentage is persisted and recalculated from the live kitchen price');
  await page.locator('[data-workspace-nav="materials"]').click();
  await row('corpus').waitFor();
  const addedScopes = (await view()).scopes.filter(scope => scope.kind === 'addition');
  assert(addedScopes.some(scope => scope.items.some(item => item.layoutTarget?.furnitureId === board.id)), 'Added board appears in Materials Additions and BOM');
  assert(await page.locator('[data-create-backsplash]').count() > 0, 'An empty backsplash explains missing geometry and provides creation action');
  await page.locator('[data-add-board="draw"]').click();
  await page.getByRole('button', { name: 'Accept current tool', exact: true }).waitFor();
  await page.getByRole('button', { name: /^(Rectangle|Obdĺžnik)$/ }).waitFor();
  assert(true, 'Standalone board opens the existing rectangle drawing tool directly');
  await page.getByRole('button', { name: 'Cancel current tool', exact: true }).click();
  assert((await snapshot(page)).customFurniture.length === 1, 'Cancelling an empty board sketch leaves no saved phantom entity');
  await page.locator('[data-workspace-nav="materials"]').click();
  await page.locator('[data-add-board="draw"]').click();
  await page.getByRole('button', { name: 'Accept current tool', exact: true }).waitFor();
  await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
  for (const point of [{ x: 50, z: 50 }, { x: 550, z: 350 }]) {
    const screen = await page.evaluate(point => window.__kitchenDebug.projectPlanPoint(point), point);
    await page.mouse.move(screen.x, screen.y); await page.mouse.click(screen.x, screen.y);
  }
  await page.getByRole('button', { name: 'Accept current tool', exact: true }).click();
  const drawn = (await snapshot(page)).customFurniture.find(item => item.id !== board.id);
  assert(drawn?.params.boards.length === 1 && drawn.params.boards[0].profile.length === 4, 'Two viewport clicks and Accept create a real board directly');
  await page.getByRole('button', { name: 'Close Custom Furniture Editor', exact: true }).click();
  const saved = await save(page);
  const envelope = await (await page.request.get(new URL(`/api/projects/${projectId}/download`, baseUrl).toString())).text();
  const imported = await page.request.post(new URL('/api/projects/import', baseUrl).toString(), { data: { envelope } });
  assert(imported.ok(), 'Edited project exports and imports as encrypted FQP');
  const restored = (await imported.json()).save;
  assert(isDeepStrictEqual(restored.appState.layout.snapshot.customFurniture, saved.appState.layout.snapshot.customFurniture), 'FQP preserves additional board dimensions, product and edges');
  assert(restored.appState.quoteSettings.constructionLaborPercent === 10, 'FQP preserves the construction labor percentage');
  assert(restored.appState.materialAssignments.assignments.find(item => item.category === 'drawer_bottom').materialId === source.materialId, 'FQP preserves clipboard assignment');
  assert(errors.length === 0, `Console errors: ${errors.join('; ')}`);
  await page.screenshot({ path: `${output}/result.png` }); await writeFile(`${output}/result.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`Materials and feedback UI: ${checks.length} checks passed.`);
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); await writeFile(`${output}/failure.txt`, `${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`); }
  throw error;
} finally { await browser.close(); }
