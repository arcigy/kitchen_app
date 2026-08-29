const defaultBaseUrl = process.env.KITCHEN_UI_BASE_URL ?? process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

export function readUiTestCredentials() {
  const company = process.env.ARCIGY_UI_TEST_COMPANY?.trim();
  const username = process.env.ARCIGY_UI_TEST_USERNAME?.trim();
  const password = process.env.ARCIGY_UI_TEST_PASSWORD;
  if (!company || !username || !password) {
    throw new Error("UI authentication tests require ARCIGY_UI_TEST_COMPANY, ARCIGY_UI_TEST_USERNAME, and ARCIGY_UI_TEST_PASSWORD.");
  }
  return { company, username, password };
}

export async function installAuthSession(page, options = {}) {
  const credentials = readUiTestCredentials();
  const autoStartWorkspace = options.autoStartWorkspace ?? true;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;
  await page.addInitScript((shouldAutoStart) => {
    if (shouldAutoStart) {
      window.localStorage.setItem("arcigy.kitchen.autostartWorkspace", "1");
      return;
    }
    window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
  }, autoStartWorkspace);
  const response = await page.context().request.post(new URL("/api/auth/login", baseUrl).toString(), {
    data: credentials
  });
  if (!response.ok()) {
    throw new Error(`Failed to install auth session: HTTP ${response.status()}`);
  }
}
