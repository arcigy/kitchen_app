export type ToastTone = "success" | "error" | "info";

export function showToast(message: string, tone: ToastTone = "info"): void {
  const existing = document.querySelector<HTMLElement>(".app-toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("app-toast-out");
    window.setTimeout(() => toast.remove(), 180);
  }, 2300);
}
