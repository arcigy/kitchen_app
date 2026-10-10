import { isDeepStrictEqual } from 'node:util';

// Runs only through the parent test's authenticated disposable file-backed tenant.
export async function auditFeedback50Corrections({ page, id, snapshot, save, baseUrl, output, assert }) {
  const before = (await snapshot(page)).instances.find(instance => instance.id === id).params;
  assert(await page.locator('[data-parameter-key$="MaterialId"], [data-parameter-key$="MaterialGroup"]').count() === 0,
    'Module parameters omit duplicate material IDs');
  assert(await page.getByText(/Materiály a marže|Materials and margins/).count() > 0,
    'The canonical Materials and margins panel remains available');
  assert(await page.locator('[data-module-labor] select').count() === 0,
    'Cabinet and preset labor have no currency picker');
  assert(await page.locator('[data-module-labor] [data-labor-currency]').count() > 0,
    'Labor inputs display the tenant currency as a fixed unit');
  assert(isDeepStrictEqual((await snapshot(page)).instances.find(instance => instance.id === id).params, before),
    'Removing duplicate controls leaves all persisted module parameters unchanged');
  await page.getByRole('heading', { name: /^(Materiály a marže|Materials and margins)$/ }).scrollIntoViewIfNeeded();
  await page.mouse.move(600, 300);
  await page.screenshot({ path: `${output}/module-properties-corrected.png` });

  await page.locator('[data-create-backsplash]').click();
  const dialog = page.getByRole('dialog', { name: 'Návrh zásteny', exact: true });
  await dialog.waitFor();
  assert(await dialog.locator('svg').count() > 0, 'Kitchen topbar opens a generated backsplash preview');
  const baseline = await snapshot(page);
  await dialog.getByRole('button', { name: 'Zrušiť', exact: true }).click();
  assert(isDeepStrictEqual(await snapshot(page), baseline), 'Cancelling backsplash creation leaves model and parameters unchanged');
  await page.locator('[data-create-backsplash]').click();
  const materialId = await dialog.getByLabel('Materiál zásteny', { exact: true }).locator('option').evaluateAll(options => options.find(option => option.value)?.value);
  await dialog.getByLabel('Materiál zásteny', { exact: true }).selectOption(materialId);
  await dialog.getByRole('button', { name: 'Potvrdiť zástenu', exact: true }).click();
  const created = (await snapshot(page)).customFurniture.find(item => item.params.backsplash);
  assert(created?.params.boards.length > 0 && created.params.boards.every(board => board.materialId === materialId && board.workplane.type === 'vertical'),
    'Confirming the topbar action creates real vertical backsplash boards with the chosen material');
  await page.screenshot({ path: `${output}/backsplash-created.png` });
  await page.getByRole('button', { name: /^(Close Custom Furniture Editor|Zavrieť editor vlastného nábytku)$/ }).click();
  await page.locator('[data-quick-action="undo"]').click();
  assert(!(await snapshot(page)).customFurniture.some(item => item.id === created.id), 'Undo removes the newly created backsplash');
  await page.locator('[data-quick-action="redo"]').click();
  assert(isDeepStrictEqual((await snapshot(page)).customFurniture.find(item => item.id === created.id).params, created.params),
    'Redo restores exact backsplash parameters and stable board IDs');
  const saved = await save(page);
  assert(isDeepStrictEqual(saved.appState.layout.snapshot.customFurniture.find(item => item.id === created.id).params, created.params),
    'The project save stores the generated backsplash exactly');
  const envelope = await (await page.request.get(new URL(`/api/projects/${saved.projectId}/download`, baseUrl).toString())).text();
  const imported = await page.request.post(new URL('/api/projects/import', baseUrl).toString(), { data: { envelope } });
  if (!imported.ok()) throw new Error(await imported.text());
  const restored = (await imported.json()).save;
  assert(isDeepStrictEqual(restored.appState.layout.snapshot.customFurniture.find(item => item.id === created.id).params, created.params),
    'Encrypted FQP download and import preserve the created backsplash boards and materials');
  await page.reload();
  await page.waitForFunction(id => !!window.__kitchenDebug?.layoutSnapshot().customFurniture?.some(item => item.id === id), created.id);
  assert(isDeepStrictEqual((await snapshot(page)).customFurniture.find(item => item.id === created.id).params, created.params),
    'Reload restores the saved backsplash model');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForFunction(() => window.__kitchenDebug.viewState().viewMode === '3d');
  assert(isDeepStrictEqual((await snapshot(page)).customFurniture.find(item => item.id === created.id).params, created.params), 'The created backsplash remains in the model when switching to 3D');
  await page.screenshot({ path: `${output}/backsplash-model-3d.png` });

  await page.locator('.app-toast').waitFor({ state: 'hidden', timeout: 20_000 });
  await page.mouse.move(600, 300);

  // Isolate historical activity rendering from the live editor's asynchronous
  // history updates; use the actual bottom-bar DOM and stylesheet, without a project.
  const overviewMarkup = await page.locator('.archux-bottom').evaluate(el => el.outerHTML);
  const activityPage = await page.context().browser().newPage({ viewport: { width: 1600, height: 1000 } });
  const activityErrors = [];
  activityPage.on('pageerror', error => activityErrors.push(String(error)));
  activityPage.on('console', message => { if (message.type() === 'error') activityErrors.push(message.text()); });
  await activityPage.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false }) }));
  try {
    await activityPage.goto(baseUrl);
    await activityPage.evaluate(async markup => {
      document.body.className = '';
      document.body.innerHTML = markup;
      const overview = document.querySelector('.archux-bottom');
      overview.style.cssText = 'position:absolute;left:16px;right:16px;bottom:16px;height:152px';
      const { createRecentActivityController } = await import('/src/app/recentActivityController.ts');
      const controller = createRecentActivityController({ S: { history: { current: null } }, getHelpers: () => ({}), selectTarget: () => {}, onRestore: () => {} });
      controller.restoreSaveState({ entries: [{ id: 1, label: 'Pridaná pracovná doska a zástena v kuchyni', createdAt: Date.now() - 18 * 60 * 60 * 1000, snapshot: null, target: { kind: null, id: null } }], idCounter: 2 });
    }, overviewMarkup);
    for (const width of [1600, 1280, 960]) {
      await activityPage.setViewportSize({ width, height: 1000 });
      const row = await activityPage.locator('[data-recent-activity] p').first().evaluate(row => {
        const label = row.querySelector('span'), time = row.querySelector('b');
        const a = label.getBoundingClientRect(), b = time.getBoundingClientRect();
        return { label: label.textContent, time: time.textContent, fullLabel: getComputedStyle(label).whiteSpace === 'normal' && getComputedStyle(label).textOverflow !== 'ellipsis', stacked: b.top >= a.bottom - 1, fits: row.scrollWidth <= row.clientWidth + 1 && label.scrollWidth <= label.clientWidth + 1 && time.scrollWidth <= time.clientWidth + 1 };
      });
      assert(row.fullLabel && row.stacked && row.fits && row.label.includes('zástena') && /18/.test(row.time),
        `The full activity label and 18-hour relative time wrap on separate lines at ${width}px: ${JSON.stringify(row)}`);
      await activityPage.screenshot({ path: `${output}/activity-corrected-${width}.png` });
      if (width === 1280) await activityPage.locator('.archux-activity').screenshot({ path: `${output}/activity-corrected-panel.png` });
    }
    assert(activityErrors.length === 0, `Activity renderer console errors: ${activityErrors.join('; ')}`);
  } finally { await activityPage.close(); }
}
