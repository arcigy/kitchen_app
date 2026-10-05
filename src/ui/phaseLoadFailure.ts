export function mountPhaseLoadFailure(container: HTMLElement, message: string, retry: () => Promise<unknown>): void {
  const status = document.createElement("div");
  status.className = "materials-phase__status materials-phase__status--error";
  status.dataset.marginError = "";
  status.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Skúsiť znova";
  button.dataset.phaseRetry = "";
  button.addEventListener("click", () => { button.disabled = true; void retry().catch(() => undefined); });
  const notice = container.querySelector<HTMLElement>("[data-phase-load-notice]");
  if (notice) notice.appendChild(button);
  else {
    status.append(text, button);
    container.appendChild(status);
  }
}
