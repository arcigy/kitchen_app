// Runs before the body and stylesheet paint. Keep this tiny boot policy aligned
// with themeController (covered by themeController.test.ts).
(() => {
  let preference = "system";
  try {
    const value = localStorage.getItem("arcigy.ui.theme");
    if (value === "light" || value === "dark") preference = value;
  } catch { /* Private/blocked storage uses the system preference. */ }
  const theme = preference === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
})();
