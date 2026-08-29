export async function logoutClient(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    await Promise.allSettled([
      import("./catalogLoader").then(({ clearClientAppDataCaches }) => clearClientAppDataCaches()),
      import("./project/projectRecoveryStore").then(({ clearProjectRecoveryForBrowser }) => clearProjectRecoveryForBrowser())
    ]);
    window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
    window.location.assign("/");
  }
}
