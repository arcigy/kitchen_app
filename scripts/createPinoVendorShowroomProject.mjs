import { chromium } from "playwright";

const appUrl = process.env.APP_URL || "http://127.0.0.1:5180";
const company = process.env.PINO_COMPANY || "PINO/Nobilia VKH 2026";
const username = process.env.PINO_USERNAME || "pino_nobilia";
const password = process.env.PINO_NOBILIA_SEED_PASSWORD;
const projectName = process.env.PINO_SHOWROOM_PROJECT_NAME || "PINO showroom vsetky moduly";

if (!password) {
  console.error("Missing PINO_NOBILIA_SEED_PASSWORD.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ baseURL: appUrl });
  const login = await context.request.post("/api/auth/login", {
    data: { company, username, password }
  });
  if (!login.ok()) {
    console.error(`Login failed: ${login.status()} ${await login.text()}`);
    process.exit(1);
  }

  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Blank workspace/i }).click();
  await page.waitForFunction(() => !!window.__kitchenDebug?.createPinoVendorShowroomProject);

  const result = await page.evaluate(async ({ requestedProjectName }) => {
    return await window.__kitchenDebug.createPinoVendorShowroomProject({
      projectName: requestedProjectName
    });
  }, { requestedProjectName: projectName });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
