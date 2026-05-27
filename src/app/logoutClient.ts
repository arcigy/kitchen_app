export async function logoutClient(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
  window.location.assign("/");
}
