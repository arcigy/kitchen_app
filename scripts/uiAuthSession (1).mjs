const SESSION_STORAGE_KEY = "arcigy:kitchen:client-session:v1";

const testSession = {
  version: 1,
  userId: "user_arcigy_owner",
  clientId: "client_arcigy_demo",
  role: "owner",
  displayName: "Arcigy",
  authenticatedAt: "2026-01-01T00:00:00.000Z"
};

export async function installAuthSession(page) {
  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SESSION_STORAGE_KEY, session: testSession }
  );
}
