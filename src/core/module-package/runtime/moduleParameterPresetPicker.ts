import type { FurnQuoteModulePackage, ModuleParameterPreset } from "../module-package-types";
import type { ClientCatalog } from "../../catalog/catalog-types";
import { applyModuleParameterPreset } from "./module-runtime-adapter";
import { requestModulePresetPreview } from "./modulePresetPreview";

function valuesMatch(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 0.001;
  return JSON.stringify(left) === JSON.stringify(right);
}

function controlledKeys(preset: ModuleParameterPreset, applied: Record<string, unknown>): Set<string> {
  const keys = new Set(Object.keys(preset.parameterValues));
  for (const ratio of preset.ratioParameters ?? []) {
    keys.add(ratio.countParameter);
    keys.add(ratio.parameterKey);
    if (!ratio.indexedParameterPrefix || !ratio.indexedParameterSuffix) continue;
    for (let index = 1; index <= 12; index += 1) {
      const key = `${ratio.indexedParameterPrefix}${index}${ratio.indexedParameterSuffix}`;
      if (Object.prototype.hasOwnProperty.call(applied, key)) keys.add(key);
    }
  }
  return keys;
}

export function resolveMatchingModuleParameterPresetId(
  modulePackage: FurnQuoteModulePackage,
  params: Record<string, unknown>
): string {
  for (const preset of modulePackage.parameterPresets?.presets ?? []) {
    const applied = applyModuleParameterPreset({ modulePackage, parameters: params, presetId: preset.presetId });
    const keys = controlledKeys(preset, applied);
    if (keys.size > 0 && [...keys].every((key) => valuesMatch(params[key], applied[key]))) return preset.presetId;
  }
  return "";
}

export type ModuleParameterPresetPicker = {
  element: HTMLElement;
  refresh: (selectedPresetId?: string) => void;
};

export function createModuleParameterPresetPicker(args: {
  modulePackage: FurnQuoteModulePackage;
  selectedPresetId?: string;
  parameters: Record<string, unknown>;
  clientCatalog: ClientCatalog;
  onSelect: (presetId: string) => void;
}): ModuleParameterPresetPicker {
  let selectedPresetId = args.selectedPresetId ?? "";
  let renderedPresetSignature = "";
  let renderedGeometrySignature = "";
  let renderGeneration = 0;
  const host = document.createElement("div");
  host.className = "module-parameter-preset-picker";
  host.dataset.moduleParameterPresetPicker = "true";

  const label = document.createElement("div");
  label.className = "module-type-picker-label";
  label.textContent = "Preset parametrov";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "module-type-picker-trigger module-parameter-preset-trigger";
  trigger.dataset.moduleParameterPresetTrigger = "true";
  trigger.setAttribute("aria-expanded", "false");

  const optionsHost = document.createElement("div");
  optionsHost.className = "module-catalog-grid module-type-picker-options module-parameter-preset-options";
  optionsHost.hidden = true;

  const previews = new Map<HTMLElement, () => void>();
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    if (!host.isConnected) { observer?.disconnect(); previews.clear(); return; }
    for (const entry of entries) if (entry.isIntersecting || !entry.target.isConnected) {
      observer?.unobserve(entry.target);
      if (entry.isIntersecting) previews.get(entry.target as HTMLElement)?.();
      previews.delete(entry.target as HTMLElement);
    }
  }) : null;

  const appendPreview = (icon: HTMLElement, preset: ModuleParameterPreset | null, text: string) => {
    const generation = renderGeneration;
    icon.dataset.previewState = "loading";
    icon.textContent = "Pripravujem náhľad…";
    icon.style.fontSize = "10px";
    icon.style.textAlign = "center";
    const render = () => {
      if (generation !== renderGeneration || !host.isConnected) return;
      void requestModulePresetPreview({ modulePackage: args.modulePackage, parameters: args.parameters, presetId: preset?.presetId, catalog: args.clientCatalog }).then(dataUrl => {
        if (generation !== renderGeneration || !icon.isConnected) return;
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = text;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "contain";
        icon.replaceChildren(image);
        icon.dataset.previewState = "ready";
      }).catch(() => {
        if (generation !== renderGeneration || !icon.isConnected) return;
        icon.textContent = "Náhľad nedostupný";
        icon.title = "Náhľad sa nepodarilo vytvoriť. Preset môžete stále použiť.";
        icon.dataset.previewState = "error";
      });
    };
    if (observer) { previews.set(icon, render); observer.observe(icon); }
    else setTimeout(render, 0);
  };

  const closeOptions = () => {
    optionsHost.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  const renderTrigger = () => {
    const presets = args.modulePackage.parameterPresets?.presets ?? [];
    const selected = presets.find((preset) => preset.presetId === selectedPresetId) ?? null;
    const text = selected?.label ?? (presets.length === 0 ? "Žiadne presety" : "Vybrať preset");
    trigger.disabled = presets.length === 0;
    trigger.title = selected?.note ?? text;
    trigger.replaceChildren();
    const icon = document.createElement("span");
    icon.className = "module-catalog-card-icon module-type-picker-trigger-icon";
    appendPreview(icon, selected, text);
    const currentLabel = document.createElement("span");
    currentLabel.className = "module-catalog-card-label module-type-picker-trigger-label";
    currentLabel.textContent = text;
    const chevron = document.createElement("span");
    chevron.className = "module-type-picker-chevron";
    chevron.textContent = "⌄";
    trigger.append(icon, currentLabel, chevron);
  };

  const renderOptions = () => {
    const presets = args.modulePackage.parameterPresets?.presets ?? [];
    renderedPresetSignature = JSON.stringify(presets);
    optionsHost.replaceChildren();
    for (const preset of presets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "module-catalog-card";
      button.dataset.parameterPresetId = preset.presetId;
      button.title = preset.note;
      const isCurrent = preset.presetId === selectedPresetId;
      button.classList.toggle("module-type-picker-card-current", isCurrent);
      button.setAttribute("aria-current", isCurrent ? "true" : "false");
      const icon = document.createElement("span");
      icon.className = "module-catalog-card-icon";
      appendPreview(icon, preset, preset.label);
      const optionLabel = document.createElement("span");
      optionLabel.className = "module-catalog-card-label";
      optionLabel.textContent = preset.label;
      button.append(icon, optionLabel);
      button.addEventListener("click", () => {
        args.onSelect(preset.presetId);
        refresh(preset.presetId);
        closeOptions();
      });
      optionsHost.appendChild(button);
    }
  };

  const syncOptionSelection = () => {
    for (const button of optionsHost.querySelectorAll<HTMLButtonElement>("[data-parameter-preset-id]")) {
      const isCurrent = button.dataset.parameterPresetId === selectedPresetId;
      button.classList.toggle("module-type-picker-card-current", isCurrent);
      button.setAttribute("aria-current", isCurrent ? "true" : "false");
    }
  };

  const refresh = (nextSelectedPresetId = "") => {
    const selectionChanged = selectedPresetId !== nextSelectedPresetId;
    selectedPresetId = nextSelectedPresetId;
    const geometrySignature = JSON.stringify([args.parameters, args.modulePackage.geometry, args.modulePackage.parameterPresets, args.clientCatalog.meta]);
    const geometryChanged = geometrySignature !== renderedGeometrySignature;
    if (geometryChanged) {
      renderedGeometrySignature = geometrySignature;
      renderGeneration += 1;
      observer?.disconnect();
      previews.clear();
    }
    if (geometryChanged || selectionChanged || trigger.childElementCount === 0) renderTrigger();
    const presets = args.modulePackage.parameterPresets?.presets ?? [];
    const nextSignature = JSON.stringify(presets);
    if (geometryChanged || nextSignature !== renderedPresetSignature) renderOptions();
    else syncOptionSelection();
  };

  trigger.addEventListener("click", () => {
    optionsHost.hidden = !optionsHost.hidden;
    trigger.setAttribute("aria-expanded", optionsHost.hidden ? "false" : "true");
  });

  host.append(label, trigger, optionsHost);
  refresh(selectedPresetId);
  return { element: host, refresh };
}
