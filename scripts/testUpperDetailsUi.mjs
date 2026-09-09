import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { installAuthSession } from './uiAuthSession.mjs';
const baseUrl = process.env.KITCHEN_UI_BASE_URL;
if (!baseUrl || !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname)) {
  throw new Error('Requires an explicit isolated localhost test runtime.');
}
const readinessResponse = await fetch(new URL('/ready', baseUrl));
const readiness = await readinessResponse.json();
if (!readinessResponse.ok || readiness.storage !== 'file') {
  throw new Error('Upper details UI requires disposable file storage, never a shared database.');
}
const reportDir = 'docs/audits/2026-09-07-upper-details';
await mkdir(reportDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [], checks = [], failedResponses = [];
page.on('response', async response => {
  if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status(),
    body: (await response.text().catch(() => '')).slice(0, 1000) });
});
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const assert = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
await installAuthSession(page, { autoStartWorkspace: false });
const state = () => page.evaluate(() => window.__kitchenDebug.placementState());
const snap = group => page.evaluate(g => window.__kitchenDebug.snapshot(g), group);
const hover = async (x, z) => {
  const p = await page.evaluate(p => window.__kitchenDebug.projectPlanPoint(p), { x, z });
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(200); return p;
};
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-project-manager-form]', { state: 'attached' });
  if (!(await page.locator('[data-project-manager-form]').isVisible())) await page.locator('[data-project-manager-new]').click();
  await page.locator("input[name='name']").fill(`QA Upper Details ${Date.now()}`);
  await page.locator("input[name='address']").fill('QA');
  await page.locator("input[name='contactName']").fill('QA');
  await page.locator('[data-project-manager-form] button[type="submit"]').click();
  await page.waitForFunction(() => !!window.__kitchenDebug);
  const fixture = await page.evaluate(() => window.__kitchenDebug.createKitchenScenario({
    path: [{ x: 0, z: 50 }, { x: 2400, z: 50 }], addModule: false
  }));
  const group = fixture.group.id;
  await page.getByRole('button', { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).click();
  await page.getByRole('button', { name: /^(Pôdorys|Floorplan)$/ }).click();
  await page.getByRole('button', { name: /^(Upravovať vrchné moduly|Edit upper modules)$/ }).click();
  await page.evaluate(() => {
    for (const [a, b] of [[[0,0],[6000,0]], [[6000,0],[6000,4000]], [[6000,4000],[0,4000]], [[0,4000],[0,0]]])
      window.__kitchenDebug.createWall({ aMm: { x:a[0],z:a[1] }, bMm: { x:b[0],z:b[1] }, thicknessMm:100 });
  });
  await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
  await page.getByRole('button', { name: 'Horna rohova skrinka 90', exact: true }).click();
  assert((await state()).active, 'Catalog click starts insertion');
  await page.keyboard.press('Escape');
  assert(!(await state()).active, 'Escape cancels insertion before the first pointer preview');
  let p = await hover(200, 200); await page.mouse.click(p.x, p.y);
  assert((await snap(group)).instances.length === 0, 'Click after Escape does not insert a module');
  await page.evaluate(() => window.__kitchenDebug.startModulePlacement('flap_shelves_low'));
  p = await hover(1200, 200); assert((await state()).valid, 'Straight upper preview is valid');
  await page.mouse.click(p.x, p.y); await page.keyboard.press('Escape');
  let upper = (await snap(group)).instances[0];
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), upper.id);
  await page.waitForTimeout(200);
  const hit = page.locator('.kitchen-run-dimension-chain svg rect');
  const count = await hit.count();
  assert(count >= 3, 'Selected upper has editable width and clearances');
  await hit.nth(count - 3).click();
  const input = page.locator('#kitchen-run-dimension-input');
  const expectedGap = Math.round(upper.worldBoxM.min.x * 1000 - 50);
  assert(Number(await input.inputValue()) === expectedGap, 'Displayed clearance starts on the inside face of the wall');
  await input.fill('0'); await input.press('Enter');
  upper = (await snap(group)).instances.find(i => i.id === upper.id);
  assert(Math.abs(upper.worldBoxM.min.x - .05) < .001, 'Entering zero aligns the actual 3D cabinet to the room-side face');
  await page.keyboard.press('Control+z');
  assert((await snap(group)).instances.find(i => i.id === upper.id).worldBoxM.min.x > .1, 'Undo restores clearance edit');
  await page.keyboard.press('Control+y');
  assert(Math.abs((await snap(group)).instances.find(i => i.id === upper.id).worldBoxM.min.x - .05) < .001, 'Redo restores zero clearance');
  await page.evaluate(id => window.__kitchenDebug.deleteModule(id), upper.id);
  // The kitchen fit frames the worktop. Pan the room into the canvas before
  // placing the variants at corners beyond that worktop.
  const navigation = page.getByRole('toolbar', { name: 'Nástroje navigácie zobrazenia' });
  await navigation.getByRole('button', { name: 'Posunúť', exact: true }).click();
  p = await hover(200, 200); await page.mouse.down();
  await page.mouse.move(p.x - 115, p.y - 75, { steps: 8 }); await page.mouse.up();
  await navigation.getByRole('button', { name: 'Vybrať', exact: true }).click();
  // The system fixture has one catalog card for these three variants. Supply
  // the same initialParams used by the tenant's individual preset cards.
  for (const [label, x, z] of [['corner_90',200,200], ['corner_chamfered',5800,200], ['corner_open_chamfered',5800,3800]]) {
    await page.evaluate(async variant => {
      const { makeDefaultFwmFurnitureParams } = await import('/src/modules/fwmFurniture/types.ts');
      window.__kitchenDebug.startModulePlacement('fwm_catalog_wall_cabinet', undefined,
        { ...makeDefaultFwmFurnitureParams('fwm_catalog_wall_cabinet'), variant, width: 700 });
    }, label);
    p = await hover(x,z);
    assert((await state()).valid && (await state()).binding?.kind === 'wall-corner', `${label}: both wall faces support the preview`);
    await page.mouse.click(p.x,p.y); await page.keyboard.press('Escape');
  }
  let corners = (await snap(group)).instances;
  assert(corners.length === 3, 'All three catalog corner variants commit');
  assert(corners.every(i => i.worldBoxM.min.x >= .049 && i.worldBoxM.max.x <= 5.951 && i.worldBoxM.min.z >= .049 && i.worldBoxM.max.z <= 3.951), 'All real corner geometry stays inside the room faces');
  await page.evaluate(g => window.__kitchenDebug.addKitchenModule(g, { type: 'fwm_tall_open_end', offsetAlongMm: 4000 }), group);
  const niche = (await snap(group)).instances.find(i => i.type === 'fwm_tall_open_end' || i.params?.type === 'fwm_tall_open_end');
  assert(!!niche, 'Actual tall niche fixture exists');
  const polygon = niche.planPolygonM;
  const extent = key => Math.max(...polygon.map(p=>p[key])) - Math.min(...polygon.map(p=>p[key]));
  assert(extent('x') > .25 && extent('z') > .5, 'Tall niche floorplan covers its real width and depth');
  await page.screenshot({ path: `${reportDir}/DETAILS-PLAN.png` });
  for (const label of ['3D', 'Pôdorys', '3D', 'Pôdorys']) await page.getByRole('button', { name: label, exact: true }).click();
  const after = (await snap(group)).instances.find(i => i.id === niche.id);
  assert(JSON.stringify(after.planPolygonM) === JSON.stringify(polygon), 'Repeated 2D/3D switches retain the same niche footprint');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
  await page.waitForTimeout(1000); // Let the view transition finish before the evidence image.
  await page.screenshot({ path: `${reportDir}/DETAILS-3D.png` });
  const upperLayer = () => page.getByRole('button', { name: /^(Upravovať vrchné moduly|Edit upper modules)$/ });
  const baseLayer = () => page.getByRole('button', { name: /^(Upravovať spodné moduly|Edit lower modules)$/ });
  const baseCards = () => page.locator('.module-catalog-card[data-module-type="fwm_catalog_base_doors"]');
  const upperCards = () => page.locator('.module-catalog-card[data-module-type="fwm_catalog_wall_cabinet"]');
  const tallCards = () => page.locator('.module-catalog-card[data-module-type="fwm_catalog_tall_cabinet"]');
  assert(await upperLayer().getAttribute('aria-pressed') === 'true', '3D retains the active upper catalog layer');
  assert(await baseCards().count() === 0 && await upperCards().count() > 0, 'Upper catalog excludes lower cabinets in 3D');
  assert(await tallCards().count() > 0, 'Tall cabinets remain available in upper layer');
  await page.evaluate(() => window.__kitchenDebug.startModulePlacement('flap_shelves_low'));
  await baseLayer().click();
  assert(!(await state()).active, 'Layer switch cancels in-progress insertion');
  assert(await baseCards().count() > 0 && await upperCards().count() === 0, 'Lower layer updates the catalog immediately');
  assert(await tallCards().count() > 0, 'Tall cabinets remain available in lower layer');
  await page.evaluate(g => window.__kitchenDebug.addKitchenModule(g, { type: 'fwm_catalog_base_doors', offsetAlongMm: 1400 }), group);
  const lower = (await snap(group)).instances.find(i => i.params?.type === 'fwm_catalog_base_doors');
  assert(!!lower, 'Lower cabinet fixture exists');
  await page.getByRole('button', { name: /^(Pôdorys|Floorplan)$/ }).click();
  await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
  const selectedIds = () => page.evaluate(() => window.__kitchenDebug.layoutSnapshot().selected.instIds);
  const box = lower.structuralWorldBoxM;
  p = await hover((box.min.x + box.max.x) * 500, (box.min.z + box.max.z) * 500);
  await page.mouse.click(p.x, p.y);
  assert((await selectedIds()).includes(lower.id), 'Click selects lower cabinet in its active floorplan layer');
  await upperLayer().click();
  assert(!(await selectedIds()).includes(lower.id), 'Layer switch clears an invalid floorplan selection');
  await page.mouse.click(p.x, p.y);
  assert(!(await selectedIds()).includes(lower.id), 'Inactive lower cabinet cannot be selected by clicking');
  const end = await hover(box.min.x * 1000 - 30, box.min.z * 1000 - 30);
  const start = await hover(box.max.x * 1000 + 30, box.max.z * 1000 + 30);
  await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  assert(!(await selectedIds()).includes(lower.id), 'Crossing selection excludes inactive floorplan cabinets');
  await baseLayer().click();
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  assert((await selectedIds()).includes(lower.id), 'The same crossing selection includes the active cabinet');
  await upperLayer().click();
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/save') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Ulo/ }).click();
  const response = await saveResponse;
  assert(response.ok(), 'Kitchen with active upper layer saves successfully');
  const saved = (await response.json()).save;
  assert(saved.appState.kitchen.activeEdit.moduleEditLayer === 'upper', 'Saved kitchen records the active upper layer');
  const download = await page.context().request.get(new URL(`/api/projects/${saved.projectId}/download`, baseUrl).toString());
  assert(download.ok(), 'Kitchen FQP download succeeds');
  const importedResponse = await page.context().request.post(new URL('/api/projects/import', baseUrl).toString(), {
    data: { envelope: await download.text() },
  });
  assert(importedResponse.ok(), 'Kitchen FQP imports as a new project');
  const imported = (await importedResponse.json()).save;
  assert(imported.appState.kitchen.activeEdit.moduleEditLayer === 'upper', 'FQP transfer retains the active layer');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__kitchenDebug);
  assert(await upperLayer().getAttribute('aria-pressed') === 'true', 'Page reload restores the active upper layer');
  await page.locator("button[data-quick-action='open']").click();
  const saveExit = page.locator("[data-project-exit='save']");
  if (await saveExit.isVisible()) await saveExit.click();
  await page.waitForSelector('[data-project-manager-list]');
  await page.getByRole('button', { name: new RegExp(imported.project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await page.waitForFunction(() => !!window.__kitchenDebug);
  assert(await upperLayer().getAttribute('aria-pressed') === 'true', 'Reopened kitchen restores the upper layer switch');
  assert(await upperCards().count() > 0 && await baseCards().count() === 0, 'Reopened kitchen restores the matching catalog');
  assert(errors.length === 0, 'Browser console and page errors are zero');
  await writeFile(`${reportDir}/DETAILS-UI.json`, JSON.stringify({ ok:true,checks,errors,snapshot:await snap(group) },null,2));
  console.log(`Upper details UI: ${checks.length} checks passed.`);
} catch (error) {
  await page.screenshot({ path: `${reportDir}/DETAILS-failure.png` });
  await writeFile(`${reportDir}/DETAILS-failure.json`, JSON.stringify({ error:String(error),checks,errors,failedResponses,placement:await state(),text:await page.locator('body').innerText() },null,2));
  throw error;
} finally { await browser.close(); }
