import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { installAuthSession } from './uiAuthSession.mjs';

const baseUrl = process.env.KITCHEN_UI_BASE_URL;
if (!baseUrl || !['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Requires an isolated localhost runtime.');
const ready = await fetch(new URL('/ready', baseUrl));
if (!ready.ok || (await ready.json()).storage !== 'file') throw new Error('Requires disposable file storage.');
const out = '.tmp-direct-drag-ui';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const assert = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
const project = point => page.evaluate(p => window.__kitchenDebug.projectPlanPoint(p), point);
let group, id;
const snapshot = () => page.evaluate(g => window.__kitchenDebug.snapshot(g), group);
const module = async () => (await snapshot()).instances.find(item => item.id === id);
const select = () => page.evaluate(id => window.__kitchenDebug.selectModule(id), id);
const samePose = (a, b) => JSON.stringify([a.positionM, a.rotationYRad, a.kitchenPlacement]) === JSON.stringify([b.positionM, b.rotationYRad, b.kitchenPlacement]);
try {
  await installAuthSession(page, { autoStartWorkspace: false });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-project-manager-form]', { state: 'attached' });
  if (!(await page.locator('[data-project-manager-form]').isVisible())) await page.locator('[data-project-manager-new]').click();
  await page.locator("input[name='name']").fill(`QA Direct Drag ${Date.now()}`);
  await page.locator("input[name='address']").fill('QA');
  await page.locator("input[name='contactName']").fill('QA');
  await page.locator('[data-project-manager-form] button[type="submit"]').click();
  await page.waitForFunction(() => !!window.__kitchenDebug);
  const fixture = await page.evaluate(() => window.__kitchenDebug.createKitchenScenario({ path: [{ x: 0, z: 0 }, { x: 4000, z: 0 }], addModule: false }));
  group = fixture.group.id;
  await page.getByRole('button', { name: /^(Upraviť kuchyňu|Edit kitchen)$/ }).click();
  await page.getByRole('button', { name: /^(Pôdorys|Floorplan)$/ }).click();
  await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__kitchenDebug.startModulePlacement('fwm_catalog_base_doors'));
  const insert = await project({ x: 1000, z: 300 });
  await page.mouse.move(insert.x, insert.y); await page.waitForTimeout(200);
  assert(await page.evaluate(() => window.__kitchenDebug.placementState().valid), 'Base insertion preview is valid');
  await page.mouse.click(insert.x, insert.y); await page.keyboard.press('Escape');
  id = (await snapshot()).instances[0]?.id;
  assert(!!id, 'Base module inserted through the normal placement owner');

  for (const view of ['Pôdorys', '3D']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.waitForTimeout(900);
    await page.evaluate(g => window.__kitchenDebug.selectKitchenGroup(g), group);
    await page.getByRole('button', { name: /^(Prispôsobiť pohľad|Fit view)$/ }).click();
    await page.waitForTimeout(900);
    if (view === '3D') {
      await page.mouse.move(840, 500);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(500);
    }
    for (const edge of [false, true]) {
      await select();
      const before = await module(), box = before.worldBoxM;
      const grab = {
        x: (edge ? box.max.x - .09 : (box.min.x + box.max.x) / 2) * 1000,
        y: view === '3D' ? (box.min.y + (box.max.y - box.min.y) * .65) * 1000 : 0,
        z: (view === '3D' ? box.max.z : (box.min.z + box.max.z) / 2) * 1000,
      };
      const start = await project(grab);
      if (view === '3D' && !edge) await page.screenshot({ path: `${out}/3d-before.png` });
      await page.mouse.click(start.x, start.y);
      assert(samePose(before, await module()), `${view}/${edge}: ordinary click does not move`);
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 2, start.y + 1);
      assert(samePose(before, await module()), `${view}/${edge}: movement below threshold does not move`);
      const end = await project({ ...grab, x: grab.x + 180 });
      await page.mouse.move(end.x, end.y, { steps: 10 }); await page.waitForTimeout(150);
      const preview = await module();
      assert(Math.abs(preview.positionM.x - before.positionM.x - .18) < .012, `${view}/${edge}: grabbed point follows cursor without a center jump (${preview.positionM.x - before.positionM.x})`);
      assert(preview.positionM.y === before.positionM.y, `${view}/${edge}: height remains unchanged`);
      const cursors = await page.locator('canvas').evaluateAll(elements => elements.map(el => ({ cursor: el.style.cursor, width: el.getBoundingClientRect().width })));
      assert(cursors.some(item => item.width > 500 && item.cursor.endsWith('grabbing')), `${view}/${edge}: dragging cursor is visible`);
      await page.screenshot({ path: `${out}/${view === '3D' ? '3d' : 'plan'}-${edge ? 'edge' : 'center'}.png` });
      await page.mouse.up();
      if (view === '3D' && !edge) await page.screenshot({ path: `${out}/3d-released.png` });
      assert(samePose(preview, await module()), `${view}/${edge}: release retains the exact displayed position and binding`);
      await page.keyboard.press('Control+z');
      assert(samePose(before, await module()), `${view}/${edge}: one undo restores the whole drag`);
      await page.keyboard.press('Control+y');
      assert(samePose(preview, await module()), `${view}/${edge}: redo restores the final position`);
      await select();
      const cancelStart = await project({ ...grab, x: grab.x + 180 });
      const cancelEnd = await project({ ...grab, x: grab.x + 360 });
      await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
      await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 8 });
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert(samePose(preview, await module()), `${view}/${edge}: Escape restores full original pose and binding`);
      assert(await page.getByRole('button', { name: /^(Upravovať vrchné moduly|Edit upper modules)$/ }).isVisible(), `${view}/${edge}: Escape keeps kitchen editing open`);
    }
  }
  await page.getByRole('button', { name: 'Pôdorys', exact: true }).click();
  await page.waitForTimeout(700);
  const targetId = id, target = await module();
  await page.evaluate(() => window.__kitchenDebug.startModulePlacement('fwm_catalog_base_doors'));
  const insertion = await project({ x: (target.worldBoxM.min.x - .34) * 1000, z: 300 });
  await page.mouse.move(insertion.x, insertion.y); await page.waitForTimeout(150);
  const insertionPreview = await page.evaluate(() => window.__kitchenDebug.placementState());
  assert(insertionPreview.valid, 'Neighbor insertion preview remains valid');
  await page.mouse.click(insertion.x, insertion.y); await page.keyboard.press('Escape');
  id = (await snapshot()).instances.find(item => item.id !== targetId).id;
  let adjacent = await module();
  assert(Math.abs(adjacent.worldBoxM.max.x - target.worldBoxM.min.x) < .00001, 'Insertion closes the 40 mm gap exactly');
  assert(adjacent.params.width === 600, 'Insertion adjacency preserves cabinet width');
  assert(adjacent.positionM.x === insertionPreview.position[0], 'Insertion commits the displayed snap without a final jump');
  const dragBy = async (distanceMm, finish = 'release') => {
    await select();
    const before = await module();
    const grab = { x: before.positionM.x * 1000, z: 300 };
    const start = await project(grab), end = await project({ ...grab, x: grab.x + distanceMm });
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 }); await page.waitForTimeout(100);
    const preview = await module();
    if (finish === 'cancel') {
      await page.locator('canvas').first().evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
    }
    await page.mouse.up();
    return { before, preview, after: await module() };
  };
  let moved = await dragBy(-220);
  assert(Math.abs(moved.after.positionM.x - adjacent.positionM.x + .22) < .001, 'Direct drag detaches from the neighbor');
  moved = await dragBy(180);
  assert(Math.abs(moved.after.worldBoxM.max.x - target.worldBoxM.min.x) < .00001, 'Direct drag closes the neighbor gap exactly');
  assert(samePose(moved.preview, moved.after), 'Snapped drag release keeps the preview exactly');
  assert(samePose(target, (await snapshot()).instances.find(item => item.id === targetId)), 'Independent neighbor stays in place');
  moved = await dragBy(-200, 'cancel');
  assert(samePose(moved.before, moved.after), 'Pointer cancellation restores pose and binding');
  moved = await dragBy(-220);
  await page.mouse.move(920, 550);
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(400);
  await select();
  await page.keyboard.press('m');
  const moveStart = await project({ x: moved.after.positionM.x * 1000, z: 300 });
  const moveEnd = await project({ x: moved.after.positionM.x * 1000 + 180, z: 300 });
  await page.mouse.click(moveStart.x, moveStart.y);
  await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 8 }); await page.waitForTimeout(100);
  const movePreview = await module();
  await page.mouse.click(moveEnd.x, moveEnd.y); await page.keyboard.press('Escape');
  assert(Math.abs((await module()).worldBoxM.max.x - target.worldBoxM.min.x) < .00001, 'Move closes the neighbor gap exactly');
  assert(samePose(movePreview, await module()), 'Move commits the displayed snap');
  assert(samePose(target, (await snapshot()).instances.find(item => item.id === targetId)), 'Move leaves the independent neighbor untouched');
  assert(errors.length === 0, 'Browser console and page errors are zero');
  await writeFile(`${out}/result.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`Direct drag UI: ${checks.length} checks passed.`);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), checks, errors, snapshot: group ? await snapshot() : null, text: await page.locator('body').innerText() }, null, 2));
  throw error;
} finally { await browser.close(); }
