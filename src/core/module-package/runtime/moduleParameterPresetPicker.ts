import type { FurnQuoteModulePackage, ModuleParameterPreset } from "../module-package-types";
import { renderCatalogPreviewImage, renderModuleCatalogPreview } from "../../../layout/moduleCatalogPreview";
import { resolveFwmModulePresetPreviewImage } from "../../../modules/fwmFurniture/modulePresetPreviewImages";
import { applyModuleParameterPreset } from "./module-runtime-adapter";

function fallbackPreview(label: string): string {
  const candidate = label.trim().slice(0, 1).toLocaleUpperCase("sk");
  const initial = /^[\p{L}\p{N}]$/u.test(candidate) ? candidate : "?";
  return `<span class="module-type-picker-preview-fallback" aria-hidden="true">${initial}</span>`;
}

function appendPresetPreview(
  host: HTMLElement,
  modulePackage: FurnQuoteModulePackage,
  preset: ModuleParameterPreset | null,
  label: string
): void {
  const previewImage = preset
    ? resolveFwmModulePresetPreviewImage(modulePackage.module.moduleType, preset.presetId)
    : undefined;
  if (!previewImage) {
    renderModuleCatalogPreview({
      host,
      modulePackage,
      fallbackSvg: () => fallbackPreview(label),
      loading: "eager",
      fetchPriority: "high"
    });
    return;
  }
  renderCatalogPreviewImage({
    host,
    previewImage,
    fallbackSvg: () => fallbackPreview(label),
    loading: "eager",
    fetchPriority: "high"
  });
}

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
  onSelect: (presetId: string) => void;
}): ModuleParameterPresetPicker {
  let selectedPresetId = args.selectedPresetId ?? "";
  let renderedPresetSignature = "";
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
    appendPresetPreview(icon, args.modulePackage, selected, text);
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
    renderedPresetSignature = JSON.stringify(presets.map(({ presetId, label, note }) => ({ presetId, label, note })));
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
      appendPresetPreview(icon, args.modulePackage, preset, preset.label);
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
    if (selectionChanged || trigger.childElementCount === 0) renderTrigger();
    const presets = args.modulePackage.parameterPresets?.presets ?? [];
    const nextSignature = JSON.stringify(presets.map(({ presetId, label, note }) => ({ presetId, label, note })));
    if (nextSignature !== renderedPresetSignature) renderOptions();
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
