import { actionIconInfo } from "./actionIcons";

const tooltipId = "arcigy-icon-tooltip";
let installed = false;
let activeTrigger: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;

type TooltipCopy = { title: string; description: string; shortcut?: string };

export function installIconTooltips(): void {
  if (installed) return;
  installed = true;

  document.addEventListener("pointerover", (event) => {
    const trigger = findTrigger(event.target);
    if (!trigger || trigger === activeTrigger) return;
    scheduleShow(trigger, false);
  });
  document.addEventListener("pointerout", (event) => {
    const trigger = findTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget as Node | null)) return;
    scheduleHide();
  });
  document.addEventListener("focusin", (event) => {
    const trigger = findTrigger(event.target);
    if (trigger) scheduleShow(trigger, true);
  });
  document.addEventListener("focusout", (event) => {
    const trigger = findTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget as Node | null)) return;
    scheduleHide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  });
  document.addEventListener("scroll", hideTooltip, true);
}

export function bindIconTooltip(element: HTMLElement, fallback: Partial<TooltipCopy> = {}): void {
  const icon = element.querySelector<HTMLElement>("[data-action-icon]");
  const defined = actionIconInfo(icon?.dataset.actionIcon);
  // A control can reuse a generic icon while representing a more specific
  // action (for example the cabinet icon on "New group"). Its explicit copy
  // must remain authoritative for accessibility, test automation and the
  // tooltip itself.
  const title = fallback.title ?? defined?.title ?? element.getAttribute("aria-label") ?? element.title ?? "Action";
  const description = fallback.description ?? defined?.description ?? `Use this control to ${title.toLocaleLowerCase()}.`;
  element.dataset.iconTooltip = "true";
  element.dataset.iconTooltipTitle = title;
  element.dataset.iconTooltipDescription = description;
  if (defined?.shortcut ?? fallback.shortcut) element.dataset.iconTooltipShortcut = defined?.shortcut ?? fallback.shortcut ?? "";
  else delete element.dataset.iconTooltipShortcut;
  // Keep the native title as a stable, accessible action name. The custom
  // tooltip adds richer guidance, while existing keyboard/browser tooling and
  // UI smoke tests still rely on the semantic title being present.
  element.setAttribute("title", title);
  if (!element.hasAttribute("aria-label")) element.setAttribute("aria-label", title);
}

function findTrigger(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const explicit = target.closest<HTMLElement>("[data-icon-tooltip]");
  if (explicit) return explicit;
  const button = target.closest<HTMLButtonElement>("button");
  return button?.querySelector("svg, img") ? button : null;
}

function scheduleShow(trigger: HTMLElement, immediate: boolean): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  showTimer = window.setTimeout(() => showTooltip(trigger), immediate ? 0 : 350);
}

function scheduleHide(): void {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideTooltip, 100);
}

function tooltipCopy(trigger: HTMLElement): TooltipCopy {
  const icon = trigger.querySelector<HTMLElement>("[data-action-icon]");
  const defined = actionIconInfo(icon?.dataset.actionIcon);
  const title = trigger.dataset.iconTooltipTitle ?? defined?.title ?? trigger.getAttribute("aria-label") ?? trigger.title ?? "Action";
  return {
    title,
    description: trigger.dataset.iconTooltipDescription ?? defined?.description ?? `Use this control to ${title.toLocaleLowerCase()}.`,
    shortcut: trigger.dataset.iconTooltipShortcut || defined?.shortcut || undefined
  };
}

function showTooltip(trigger: HTMLElement): void {
  if (!trigger.isConnected) return;
  hideTooltip();
  const copy = tooltipCopy(trigger);
  const tooltip = document.createElement("div");
  tooltip.id = tooltipId;
  tooltip.className = "arcigy-icon-tooltip";
  tooltip.setAttribute("role", "tooltip");
  const title = document.createElement("strong");
  title.textContent = copy.title;
  const description = document.createElement("span");
  description.textContent = copy.description;
  tooltip.append(title, description);
  if (copy.shortcut) {
    const shortcut = document.createElement("kbd");
    shortcut.textContent = copy.shortcut;
    tooltip.appendChild(shortcut);
  }
  document.body.appendChild(tooltip);
  positionTooltip(trigger, tooltip);
  trigger.setAttribute("aria-describedby", tooltipId);
  activeTrigger = trigger;
}

function positionTooltip(trigger: HTMLElement, tooltip: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const maxLeft = window.innerWidth - tooltip.offsetWidth - margin;
  const centered = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
  const left = Math.max(margin, Math.min(maxLeft, centered));
  const below = rect.bottom + margin;
  const top = below + tooltip.offsetHeight <= window.innerHeight - margin
    ? below
    : Math.max(margin, rect.top - tooltip.offsetHeight - margin);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function hideTooltip(): void {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  document.getElementById(tooltipId)?.remove();
  activeTrigger?.removeAttribute("aria-describedby");
  activeTrigger = null;
}
