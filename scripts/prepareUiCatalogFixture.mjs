import { chromium } from 'playwright';
import { installAuthSession } from './uiAuthSession.mjs';

const baseUrl = process.env.KITCHEN_UI_BASE_URL;
if (!baseUrl || !['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Catalog fixture requires an isolated localhost runtime.');
const ready = await fetch(new URL('/ready', baseUrl));
if (!ready.ok || (await ready.json()).storage !== 'file') throw new Error('Catalog fixture requires disposable file storage.');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await installAuthSession(page, { autoStartWorkspace: false });
  const response = await page.context().request.get(new URL('/api/auth/session', baseUrl).toString());
  const session = await response.json();
  if (!response.ok() || session.session?.clientId !== 'client_arcigy_demo') throw new Error('Catalog fixture is restricted to the synthetic demo tenant.');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const count = await page.evaluate(async () => {
    const { systemModulePackageTemplates } = await import('/src/system/module-packages/index.ts');
    for (const modulePackage of systemModulePackageTemplates) {
      const imported = await fetch('/api/modules/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: modulePackage }) });
      if (!imported.ok) throw new Error(`Cannot prepare module fixture ${modulePackage.module.moduleType}: HTTP ${imported.status}`);
    }
    return systemModulePackageTemplates.length;
  });
  console.log(`Prepared ${count} synthetic module packages through the normal tenant API.`);
} finally {
  await browser.close();
}
