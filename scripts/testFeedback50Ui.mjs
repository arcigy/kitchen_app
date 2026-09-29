import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { installAuthSession } from './uiAuthSession.mjs';

const baseUrl = process.env.KITCHEN_UI_BASE_URL;
if (!baseUrl || !['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Isolated local runtime required');
if ((await (await fetch(new URL('/ready', baseUrl))).json()).storage !== 'file') throw new Error('Disposable file storage required');
const output = '.tmp/feedback-50-ui'; await mkdir(output, { recursive: true });
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
  if (!await current.locator('[data-project-manager-form]').isVisible()) await current.locator('[data-project-manager-new]').click();
  await current.locator('input[name="name"]').fill(`QA Labor ${label} ${Date.now()}`);
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
async function save(current) {
  const wait = current.waitForResponse(r => r.url().endsWith('/save') && r.request().method() === 'POST');
  await current.locator('[data-quick-action="save"]').click(); const response = await wait;
  if (!response.ok()) throw new Error(await response.text()); return (await response.json()).save;
}
const labor = (data, id) => data.instances.find(i => i.id === id)?.params.moduleLabor;
try {
  const a = await createProject('A', true); page = a.page;
  await page.evaluate(id => window.__kitchenDebug.patchModuleParams(id, { quantity: 3 }), a.id);
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.locator('.module-parameter-preset-create').click();
  const dialog = page.locator('[data-preset-dialog]');
  await dialog.getByRole('textbox', { name: /^(Názov|Name)$/ }).fill(`QA50 ${Date.now()}`);
  await dialog.locator('textarea').fill('Labor preset regression');
  await dialog.locator('[data-create-preset-labor]').fill('200');
  await dialog.getByLabel('Práca za jeden modul · mena', { exact: true }).selectOption('EUR');
  const creating = page.waitForResponse(r => r.url().endsWith('/parameter-presets') && r.request().method() === 'POST');
  await dialog.locator('button[type="submit"]').click();
  const createResponse = await creating; if (!createResponse.ok()) throw new Error(await createResponse.text());
  const created = await createResponse.json(), presetId = created.preset.presetId;
  assert(created.modulePackage.parameterPresets.presets.find(p => p.presetId === presetId).laborRate.amount === 200, 'Creating a preset stores its labor rate');
  assert(!labor(await snapshot(page), a.id), 'Saving a company preset does not change the placed cabinet');
  await selectPreset(page, a.id, presetId);
  assert(labor(await snapshot(page), a.id).inherited.rate.amount === 200, 'Project A captures 200 per cabinet');
  const savedA = await save(page);
  const b = await createProject('B'); await selectPreset(b.page, b.id, presetId);
  assert(labor(await snapshot(b.page), b.id).inherited.rate.amount === 200, 'Project B reuses the company rate');
  await save(b.page);
  await page.locator('[data-module-labor] details').evaluate(el => el.open = true);
  await page.locator('[data-preset-labor-rate]').fill('250');
  const updating = page.waitForResponse(r => r.url().endsWith(`/parameter-presets/${presetId}/labor`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Uložiť do presetu', exact: true }).click();
  assert((await updating).ok(), 'Preset rate can be edited through its versioned API');
  assert(labor(await snapshot(page), a.id).inherited.rate.amount === 200 && labor(await snapshot(b.page), b.id).inherited.rate.amount === 200, 'Editing the preset does not silently reprice either project');
  const c = await createProject('C'); await selectPreset(c.page, c.id, presetId);
  assert(labor(await snapshot(c.page), c.id).inherited.rate.amount === 250, 'New use in another project captures 250');
  const before = (await snapshot(page)).instances.find(i => i.id === a.id).params;
  await page.getByRole('button', { name: 'Prevziať sadzbu z presetu', exact: true }).click();
  const after = (await snapshot(page)).instances.find(i => i.id === a.id).params;
  const { moduleLabor: oldRate, ...oldGeometry } = before, { moduleLabor: newRate, ...newGeometry } = after;
  assert(newRate.inherited.rate.amount === 250 && isDeepStrictEqual(oldGeometry, newGeometry), 'Explicit adoption changes labor without changing cabinet configuration');
  await page.locator('[data-quick-action="undo"]').click();
  assert(labor(await snapshot(page), a.id).inherited.rate.amount === 200, 'Undo restores the previous captured labor rate');
  await page.locator('[data-quick-action="redo"]').click();
  assert(labor(await snapshot(page), a.id).inherited.rate.amount === 250, 'Redo restores the adopted labor rate');
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.locator('[data-module-labor-rate]').fill('0');
  await page.getByRole('button', { name: 'Uložiť pre túto skrinku', exact: true }).click();
  assert(labor(await snapshot(page), a.id).override.amount === 0, 'Explicit zero is preserved');
  await page.getByRole('button', { name: 'Obnoviť zdedenú sadzbu', exact: true }).click();
  assert(!labor(await snapshot(page), a.id).override, 'Reset restores the captured inherited rate');
  const saved = await save(page);
  const marginResponse = await page.request.get(new URL(`/api/projects/${saved.projectId}/margins`, baseUrl).toString());
  const view = (await marginResponse.json()).view;
  assert(view.groups.find(g => g.category === 'labor').items.find(i => i.scopeId === `module:${a.id}`).baseCost === 750, 'Server charges 3 × 250 exactly once');
  assert(Math.abs(view.summary.contribution.contributionAmount - (view.summary.finalPrice - view.summary.contribution.purchaseCost)) < 0.001, 'API contribution equals sale minus purchasing cost');
  await page.locator('[data-workspace-nav="margins"]').click();
  await page.locator('[data-margin-group="labor"]').waitFor();
  assert((await page.locator('[data-margin-group="labor"]').innerText()).includes('750'), 'Margins show the full labor contribution');
  await page.screenshot({ path: `${output}/margins.png` });
  const envelope = await (await page.request.get(new URL(`/api/projects/${saved.projectId}/download`, baseUrl).toString())).text();
  const imported = await page.request.post(new URL('/api/projects/import', baseUrl).toString(), { data: { envelope } });
  if (!imported.ok()) throw new Error(await imported.text());
  const restored = (await imported.json()).save;
  assert(isDeepStrictEqual(restored.appState.layout.snapshot.instances.find(i => i.id === a.id).params.moduleLabor, newRate), 'Encrypted FQP retains identity, version, currency and captured rate');
  const oldSave = (await (await b.page.request.get(new URL(`/api/projects/${(await save(b.page)).projectId}/load`, baseUrl).toString())).json()).save;
  assert(oldSave.appState.layout.snapshot.instances.find(i => i.id === b.id).params.moduleLabor.inherited.rate.amount === 200, 'Reloading project B retains its old quote after library changes');
  assert(savedA.projectId === saved.projectId, 'Changes remain in the same project');
  await page.locator('[data-workspace-nav="design"]').click();
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  if (await page.getByRole('button', { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).isVisible()) await page.getByRole('button', { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).click();
  await page.evaluate(group => window.__kitchenDebug.addKitchenModule(group, { type: 'fwm_catalog_base_drawers', offsetAlongMm: 2000 }), a.group);
  const spare = (await snapshot(page)).instances.find(i => i.id !== a.id).id;
  await selectPreset(page, spare, presetId);
  await page.locator('[data-module-labor-rate]').fill('180');
  await page.getByRole('button', { name: 'Uložiť pre túto skrinku', exact: true }).click();
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.locator('[data-module-labor] details').evaluate(el => el.open = true);
  await page.getByRole('button', { name: 'Načítať aktuálny preset', exact: true }).click();
  await page.locator('[data-preset-labor-rate]').fill('300');
  const bulkUpdate = page.waitForResponse(r => r.url().endsWith(`/parameter-presets/${presetId}/labor`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Uložiť do presetu', exact: true }).click();
  assert((await bulkUpdate).ok(), 'A subsequent company rate revision succeeds');
  await page.getByText('Sadzba je uložená vo firemnom presete. Existujúce skrinky sa nezmenili.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Prevziať pre všetky skrinky tohto presetu', exact: true }).click();
  const bulkSnapshot = await snapshot(page);
  assert(labor(bulkSnapshot, a.id).inherited.rate.amount === 300 && labor(bulkSnapshot, spare).override.amount === 180, 'Bulk adoption updates inherited rates and preserves explicit cabinet values');
  const beforeRecoverySave = await save(page);
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  const recoveryAfter = Date.now();
  await page.locator('[data-module-labor-rate]').fill('125');
  await page.getByRole('button', { name: 'Uložiť pre túto skrinku', exact: true }).click();
  const recoveryDeadline = Date.now() + 15000;
  let draftReady = false;
  while (Date.now() < recoveryDeadline) {
    draftReady = await page.evaluate(async ({ id, projectId, after, revision }) => {
      const records = await new Promise((resolve, reject) => {
        const request = indexedDB.open('arcigy-kitchen-project-recovery', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const query = db.transaction('active-drafts', 'readonly').objectStore('active-drafts').getAll(); query.onerror = () => { reject(query.error); db.close(); }; query.onsuccess = () => { resolve(query.result); db.close(); }; };
      });
      return records.some(record => { const draft = record.envelope ?? record; return draft.scope?.projectId === projectId && draft.baseServerRevision === revision && Date.parse(draft.updatedAt) >= after && draft.appState?.layout?.snapshot?.instances?.find(i => i.id === id)?.params.moduleLabor?.override?.amount === 125; });
    }, { id: a.id, projectId: saved.projectId, after: recoveryAfter, revision: beforeRecoverySave.integrity.saveRevision });
    if (draftReady) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(draftReady, 'IndexedDB contains the exact unsaved cabinet rate before refresh');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => window.__kitchenDebug?.layoutSnapshot().instances.find(i => i.id === id)?.params.moduleLabor?.override?.amount === 125, a.id);
  assert(labor(await snapshot(page), a.id).inherited.rate.amount === 300, 'Draft recovery restores both the unsaved override and the inherited preset snapshot');

  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.locator('[data-open-module-settings]').click();
  const editor = page.locator('dialog[data-module-settings]');
  await editor.locator('[data-module-labor-rate]').fill('140');
  await editor.getByRole('button', { name: 'Uložiť pre túto skrinku', exact: true }).click();
  assert(labor(await snapshot(page), a.id).override.amount === 125, 'Advanced editor keeps labor changes in its preview');
  await editor.locator('.module-settings-actions').getByRole('button', { name: 'Zrušiť', exact: true }).click();
  await page.locator('.module-settings-confirm').getByRole('button', { name: 'Zahodiť zmeny', exact: true }).click();
  assert(labor(await snapshot(page), a.id).override.amount === 125, 'Cancelling advanced settings preserves the prior labor rate');
  await page.locator('[data-open-module-settings]').click();
  await editor.locator('[data-module-labor-rate]').fill('140');
  await editor.getByRole('button', { name: 'Uložiť pre túto skrinku', exact: true }).click();
  await editor.locator('.module-settings-actions').getByRole('button', { name: 'Uložiť a zavrieť', exact: true }).click();
  assert(labor(await snapshot(page), a.id).override.amount === 140, 'Saving advanced settings commits the labor override');

  const beforeDuplicate = await snapshot(page);
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.getByRole('button', { name: /^(Upraviť|Modify)$/, exact: true }).click();
  await page.getByRole('button', { name: /^(Duplikovať|Duplicate)$/, exact: true }).click();
  const afterDuplicate = await snapshot(page);
  const duplicate = afterDuplicate.instances.find(instance => !beforeDuplicate.instances.some(old => old.id === instance.id));
  assert(duplicate && isDeepStrictEqual(duplicate.params.moduleLabor, labor(beforeDuplicate, a.id)), 'Duplicating through the toolbar retains the captured preset and cabinet override');
  const savedWithDuplicate = await save(page);
  const packageId = newRate.preset.modulePackageId;
  const currentPackage = (await (await page.request.get(new URL(`/api/modules/${packageId}`, baseUrl).toString())).json()).module;
  currentPackage.parameterPresets.presets = currentPackage.parameterPresets.presets.filter(preset => preset.presetId !== presetId);
  delete currentPackage.integrity.packageHash;
  const removingPreset = await page.request.post(new URL('/api/modules/import', baseUrl).toString(), { data: { package: currentPackage } });
  if (!removingPreset.ok()) throw new Error(await removingPreset.text());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => !!window.__kitchenDebug?.layoutSnapshot().instances.find(instance => instance.id === id), a.id);
  await page.evaluate(id => window.__kitchenDebug.selectModule(id), a.id);
  await page.locator('[data-module-labor] details').evaluate(element => element.open = true);
  await page.getByText('Preset už nie je v knižnici. Uložená sadzba skrinky zostáva zachovaná.', { exact: true }).waitFor();
  assert(isDeepStrictEqual(labor(await snapshot(page), a.id), labor(beforeDuplicate, a.id)), 'Removing a company preset leaves the saved cabinet identity, rate and override valid');
  const afterRemoval = (await (await page.request.get(new URL(`/api/projects/${savedWithDuplicate.projectId}/margins`, baseUrl).toString())).json()).view;
  assert(afterRemoval.groups.find(group => group.category === 'labor').items.find(item => item.scopeId === `module:${a.id}`).baseCost === 420, 'Server retains the quote after its company preset is removed');

  assert(errors.length === 0, `Console errors: ${errors.join('; ')}`);
  await writeFile(`${output}/result.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`Feedback 50 UI: ${checks.length} checks passed.`);
} catch (error) {
  if (page) { await writeFile(`${output}/failure-layout.json`, JSON.stringify(await snapshot(page).catch(() => ({})), null, 2)); await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); await writeFile(`${output}/failure.txt`, `${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`); }
  throw error;
} finally { await browser.close(); }
