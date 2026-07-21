import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { getModuleCatalogCardPresentation } from "../layout/moduleCatalogCardPresentation";
import { renderModuleCatalogPreview } from "../layout/moduleCatalogPreview";
import type { CompatibleModuleTypeOption } from "./moduleTypeReplacement";

function fallbackPreview(label: string): string {
  const candidate = label.trim().slice(0, 1).toLocaleUpperCase("sk");
  const initial = /^[\p{L}\p{N}]$/u.test(candidate) ? candidate : "?";
  return `<span class="module-type-picker-preview-fallback" aria-hidden="true">${initial}</span>`;
}

function appendPreview(
  host: HTMLElement,
  modulePackage: FurnQuoteModulePackage,
  label: string,
  renderFallback?: (modulePackage: FurnQuoteModulePackage) => string
): void {
  renderModuleCatalogPreview({
    host,
    modulePackage,
    fallbackSvg: () => renderFallback?.(modulePackage) || fallbackPreview(label),
    loading: "eager",
    fetchPriority: "high"
  });
}

export function createModuleTypePicker(args: {
  currentPackageId: string;
  options: readonly CompatibleModuleTypeOption[];
  onSelect: (option: CompatibleModuleTypeOption) => void;
  renderFallback?: (modulePackage: FurnQuoteModulePackage) => string;
}): HTMLElement {
  const current = args.options.find((option) => option.value === args.currentPackageId) ?? args.options[0];
  const presentation = getModuleCatalogCardPresentation(false);
  const host = document.createElement("div");
  host.className = "module-type-picker";
  host.dataset.moduleTypePicker = "true";

  const label = document.createElement("div");
  label.className = "module-type-picker-label";
  label.textContent = "Typ modulu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "module-type-picker-trigger";
  trigger.dataset.moduleTypeSelector = "true";
  trigger.disabled = args.options.length <= 1;
  trigger.setAttribute("aria-expanded", "false");

  if (current) {
    const currentIcon = document.createElement("span");
    currentIcon.className = "module-catalog-card-icon module-type-picker-trigger-icon";
    appendPreview(currentIcon, current.modulePackage, current.label, args.renderFallback);
    const currentLabel = document.createElement("span");
    currentLabel.className = "module-catalog-card-label module-type-picker-trigger-label";
    currentLabel.textContent = current.label;
    const chevron = document.createElement("span");
    chevron.className = "module-type-picker-chevron";
    chevron.textContent = "⌄";
    trigger.append(currentIcon, currentLabel, chevron);
    trigger.title = current.label;
  }

  const optionsHost = document.createElement("div");
  optionsHost.className = `${presentation.gridClassName} module-type-picker-options`;
  optionsHost.hidden = true;

  for (const option of args.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = presentation.cardClassName;
    button.dataset.modulePackageId = option.value;
    button.title = option.label;
    const isCurrent = option.value === args.currentPackageId;
    button.classList.toggle("module-type-picker-card-current", isCurrent);
    button.setAttribute("aria-current", isCurrent ? "true" : "false");

    const icon = document.createElement("span");
    icon.className = "module-catalog-card-icon";
    appendPreview(icon, option.modulePackage, option.label, args.renderFallback);
    const optionLabel = document.createElement("span");
    optionLabel.className = presentation.labelClassName;
    optionLabel.textContent = option.label;
    button.append(icon, optionLabel);
    button.addEventListener("click", () => {
      if (isCurrent) {
        optionsHost.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        return;
      }
      args.onSelect(option);
    });
    optionsHost.appendChild(button);
  }

  trigger.addEventListener("click", () => {
    optionsHost.hidden = !optionsHost.hidden;
    trigger.setAttribute("aria-expanded", optionsHost.hidden ? "false" : "true");
  });

  host.append(label, trigger, optionsHost);
  return host;
}
