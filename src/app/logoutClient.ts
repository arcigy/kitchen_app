export async function logoutClient(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  const { clearClientAppDataCaches } = await import("./catalogLoader");
  await clearClientAppDataCaches();
  window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
  window.location.assign("/");
}
