const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

export async function installAuthSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("arcigy.kitchen.autostartWorkspace", "1");
  });
  const response = await page.context().request.post(new URL("/api/auth/login", baseUrl).toString(), {
    data: { username: "arcigy", password: "kitchen2026" }
  });
  if (!response.ok()) {
    throw new Error(`Failed to install auth session: HTTP ${response.status()}`);
  }
}
