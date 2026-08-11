const defaultBaseUrl = process.env.KITCHEN_UI_BASE_URL ?? process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const username = process.env.ARCIGY_UI_TEST_USERNAME ?? "arcigy";
const password = process.env.ARCIGY_UI_TEST_PASSWORD ?? "kitchen2026";

export async function installAuthSession(page, options = {}) {
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
    data: { username, password }
  });
  if (!response.ok()) {
    throw new Error(`Failed to install auth session: HTTP ${response.status()}`);
  }
}
