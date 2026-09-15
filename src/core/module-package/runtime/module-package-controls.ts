import type { ClientCatalog } from "../../catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleParameterDefinition, ModuleUiDefinition } from "../module-package-types";
import type { ModuleControlsApi, ModuleControlsArgs } from "../../../modules/registry";
import { getModuleDescriptor } from "../../../modules/registry";
import { describeFwmModuleHeight } from "../../../modules/fwmFurniture/heightPresentation";
import { t, translateEnumLabel, translateParamLabel } from "../../../i18n";
import { applyModuleParameterPreset } from "./module-runtime-adapter";
import {
  createModuleParameterPresetPicker,
  resolveMatchingModuleParameterPresetId
} from "./moduleParameterPresetPicker";

type ControlRecord = {
  key: string;
  input: HTMLInputElement | HTMLSelectElement;
  row: HTMLElement;
  sync: () => void;
};

export type ModuleControlStrategy = "module_descriptor" | "module_package";

function displayValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function hasOwnParameterValue(params: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function readParameterValue(params: Record<string, unknown>, parameter: ModuleParameterDefinition): unknown {
  return hasOwnParameterValue(params, parameter.key) ? params[parameter.key] : parameter.defaultValue;
}

function createPackageParameterSnapshot(modulePackage: FurnQuoteModulePackage, params: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const parameter of modulePackage.parameters.parameters) {
    const value = readParameterValue(params, parameter);
    if (value !== undefined) snapshot[parameter.key] = value;
  }
  return snapshot;
}

function coerceInputValue(parameter: ModuleParameterDefinition, input: HTMLInputElement | HTMLSelectElement) {
  if (parameter.type === "number") {
    const value = Number(String(input.value).trim().replace(",", "."));
    return Number.isFinite(value) ? value : parameter.defaultValue;
  }
  if (parameter.type === "boolean") return input instanceof HTMLInputElement ? input.checked : input.value === "true";
  return input.value;
}

function appendOptions(select: HTMLSelectElement, options: Array<{ label: string; value: string }>, currentValue: unknown) {
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "-";
  select.appendChild(empty);

  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = translateEnumLabel(option.label);
    select.appendChild(el);
  }
  select.value = displayValue(currentValue);
}

function buildSelectOptions(parameter: ModuleParameterDefinition, catalog: ClientCatalog) {
  if (parameter.type === "material") {
    return catalog.materials
      .filter((material) => material.isActive)
      .map((material) => ({ label: material.displayName || material.name, value: material.id }));
  }
  if (parameter.type === "component") {
    return catalog.components
      .filter((component) => component.isActive)
      .map((component) => ({ label: component.displayName || component.name, value: component.id }));
  }
  return parameter.options ?? [];
}

function findParameter(modulePackage: FurnQuoteModulePackage, key: string): ModuleParameterDefinition | null {
  return modulePackage.parameters.parameters.find((parameter) => parameter.key === key) ?? null;
}

function isInternalSettingsParameter(parameter: ModuleParameterDefinition) {
  return parameter.uiVisibility === "internal" || parameter.uiVisibility === "technical" ||
    ["type", "moduleType", "typeId", "modulePackageId", "packageHash"].includes(parameter.key) || /MaterialGroup$/.test(parameter.key);
}

function sortedControls(modulePackage: FurnQuoteModulePackage) {
  return [...modulePackage.ui.controls].sort((a, b) => {
    const groupA = modulePackage.ui.groups.find((group) => group.id === a.groupId)?.order ?? 0;
    const groupB = modulePackage.ui.groups.find((group) => group.id === b.groupId)?.order ?? 0;
    return groupA - groupB || (a.order ?? 0) - (b.order ?? 0) || a.parameterKey.localeCompare(b.parameterKey);
  });
}

function isCatalogPicker(controlType: string | undefined, parameter: ModuleParameterDefinition) {
  return controlType === "materialPicker" || controlType === "componentPicker" || parameter.type === "material" || parameter.type === "component";
}

function hasComposedHostSlotControls(modulePackage: FurnQuoteModulePackage) {
  const uiControls = modulePackage.ui?.controls ?? [];
  if (uiControls.some((control) => /^tallSlot\d+(Type|HeightMm|OffsetMm)$/.test(control.parameterKey))) return true;
  return modulePackage.parameters?.parameters?.some((parameter) => /^tallSlot\d+(Type|HeightMm|OffsetMm)$/.test(parameter.key)) ?? false;
}

function isFwmCatalogPackage(modulePackage: FurnQuoteModulePackage) {
  return modulePackage.module.moduleType.startsWith("fwm_catalog_");
}

function withParameterPresetControl(
  container: HTMLElement,
  modulePackage: FurnQuoteModulePackage,
  params: Record<string, unknown>,
  args: ModuleControlsArgs,
  api: ModuleControlsApi
): ModuleControlsApi {
  const row = document.createElement("div");
  row.className = "module-package-control";
  row.style.display = "grid";
  row.style.gap = "8px";
  row.style.marginTop = "8px";

  const presetPicker = createModuleParameterPresetPicker({
    modulePackage,
    parameters: params,
    clientCatalog: args.clientCatalog,
    selectedPresetId: resolveMatchingModuleParameterPresetId(modulePackage, params),
    onSelect: (presetId) => {
      Object.assign(params, applyModuleParameterPreset({ modulePackage, parameters: params, presetId }));
      args.onChange();
      api.syncFromParams();
    }
  });

  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.textContent = t("Create preset");
  createButton.disabled = !args.createParameterPreset;
  createButton.className = "module-parameter-preset-create";

  createButton.addEventListener("click", () => {
    if (!args.createParameterPreset) return;
    openCreatePresetDialog({
      host: args.presetDialogHost,
      onSave: async ({ name, note }) => {
        const result = await args.createParameterPreset?.({
          modulePackage,
          parameters: createPackageParameterSnapshot(modulePackage, params),
          name,
          note
        });
        if (!result) return;
        Object.assign(modulePackage, result.modulePackage);
        presetPicker.refresh(result.presetId);
      }
    });
  });

  row.append(presetPicker.element, createButton);
  (args.presetHost ?? container).prepend(row);

  return {
    syncFromParams: () => {
      api.syncFromParams();
      presetPicker.refresh(resolveMatchingModuleParameterPresetId(modulePackage, params));
    },
    isAutoFitEnabled: () => api.isAutoFitEnabled(),
    highlightParamKeys: (keys) => api.highlightParamKeys(keys),
    clearHighlights: () => api.clearHighlights()
  };
}

function openCreatePresetDialog(args: { host?: HTMLElement; onSave: (values: { name: string; note: string }) => Promise<void> }) {
  const backdrop = document.createElement("div");
  backdrop.style.position = "fixed";
  backdrop.style.inset = "0";
  backdrop.style.zIndex = "9999";
  backdrop.style.background = "rgba(15, 23, 42, 0.35)";
  backdrop.style.display = "grid";
  backdrop.style.placeItems = "center";
  backdrop.dataset.presetDialog = "true";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", t("Create preset"));

  const panel = document.createElement("form");
  panel.style.width = "min(420px, calc(100vw - 32px))";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid rgba(15, 23, 42, 0.12)";
  panel.style.borderRadius = "8px";
  panel.style.boxShadow = "0 22px 70px rgba(15, 23, 42, 0.24)";
  panel.style.padding = "18px";
  panel.style.display = "grid";
  panel.style.gap = "12px";

  const title = document.createElement("strong");
  title.textContent = t("Create preset");

  const name = document.createElement("input");
  name.type = "text";
  name.required = true;
  name.placeholder = t("Name");
  name.setAttribute("aria-label", t("Name"));

  const note = document.createElement("textarea");
  note.required = true;
  note.placeholder = t("Note");
  note.setAttribute("aria-label", t("Note"));
  note.rows = 4;
  note.style.resize = "vertical";

  const error = document.createElement("div");
  error.style.color = "#b42318";
  error.style.fontSize = "12px";
  error.style.minHeight = "16px";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("Cancel");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = t("Save");
  actions.append(cancel, save);

  panel.append(title, name, note, error, actions);
  backdrop.appendChild(panel);
  const previousFocus = document.activeElement;
  (args.host ?? document.body).appendChild(backdrop);
  name.focus();

  const close = () => { backdrop.remove(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  backdrop.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (!save.disabled) close(); }
    if (event.key === "Tab") {
      const items = [name, note, cancel, save].filter((item) => !item.disabled);
      const index = items.indexOf(document.activeElement as typeof name);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    }
  });
  cancel.addEventListener("click", close);
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop && !save.disabled) close();
  });
  panel.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = {
      name: name.value.trim(),
      note: note.value.trim()
    };
    if (!values.name || !values.note) {
      error.textContent = t("Name and note are required.");
      return;
    }
    save.disabled = true;
    cancel.disabled = true;
    error.textContent = "";
    try {
      await args.onSave(values);
      close();
    } catch (saveError) {
      save.disabled = false;
      cancel.disabled = false;
      error.textContent = saveError instanceof Error ? saveError.message : "Preset save failed.";
    }
  });
}

export function findModulePackageForParams(
  modulePackages: readonly FurnQuoteModulePackage[],
  params: Record<string, unknown>
): FurnQuoteModulePackage | null {
  const packageId = typeof params.modulePackageId === "string" ? params.modulePackageId : null;
  if (packageId) {
    const byPackageId = modulePackages.find((modulePackage) => modulePackage.module.modulePackageId === packageId);
    if (byPackageId) return byPackageId;
  }
  const moduleType = typeof params.type === "string" ? params.type : typeof params.moduleType === "string" ? params.moduleType : null;
  return moduleType ? modulePackages.find((modulePackage) => modulePackage.module.moduleType === moduleType) ?? null : null;
}

export function resolveModuleControlStrategy(
  modulePackage: FurnQuoteModulePackage,
  params: Record<string, unknown>
): ModuleControlStrategy {
  const tags = new Set((modulePackage.module.tags ?? []).map((tag) => tag.toLowerCase()));
  if (tags.has("revit-export-preview")) return "module_package";
  if (isFwmCatalogPackage(modulePackage)) return "module_package";
  if (hasComposedHostSlotControls(modulePackage)) return "module_package";
  const moduleType =
    typeof params.type === "string" && params.type.trim().length > 0
      ? params.type.trim()
      : modulePackage.module.moduleType;
  return getModuleDescriptor(moduleType as Parameters<typeof getModuleDescriptor>[0]) ? "module_descriptor" : "module_package";
}

export function createModulePackageControls(
  container: HTMLElement,
  modulePackage: FurnQuoteModulePackage,
  params: Record<string, unknown>,
  args: ModuleControlsArgs
): ModuleControlsApi {
  container.innerHTML = "";
  container.dataset.i18nSkip = "true";
  const records: ControlRecord[] = [];
  const groups = new Map<string, HTMLElement>();
  const change = args.onChange as (previousParams?: Record<string, unknown>, sourceKey?: string) => void | boolean;

  for (const group of [...modulePackage.ui.groups].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const section = document.createElement("div");
    section.className = "module-package-control-group";
    const title = document.createElement("div");
    title.className = "muted";
    title.textContent = t(group.label);
    section.appendChild(title);
    container.appendChild(section);
    groups.set(group.id, section);
  }

  const controls = sortedControls(modulePackage);
  if (args.userParametersOnly) {
    for (const parameter of modulePackage.parameters.parameters) {
      if (parameter.uiVisibility !== "user" || isInternalSettingsParameter(parameter) || controls.some((control) => control.parameterKey === parameter.key)) continue;
      const controlType: ModuleUiDefinition["controls"][number]["controlType"] = parameter.type === "boolean" ? "checkbox"
        : parameter.options?.length ? "select" : parameter.type === "number" ? "number" : "text";
      controls.push({ parameterKey: parameter.key, groupId: parameter.group, controlType });
    }
  }
  for (const control of controls) {
    const parameter = findParameter(modulePackage, control.parameterKey);
    if (!parameter) continue;
    if (args.userParametersOnly && isInternalSettingsParameter(parameter)) continue;
    const host = control.groupId ? groups.get(control.groupId) ?? container : container;
    const row = document.createElement("label");
    row.className = "module-package-control";
    row.dataset.parameterKey = parameter.key;
    row.style.display = "grid";
    row.style.gap = "4px";
    row.style.marginTop = "8px";

    const label = document.createElement("span");
    const heightPresentation = parameter.key === "height" ? describeFwmModuleHeight({ ...params, type: modulePackage.module.moduleType }) : null;
    const labelText = (heightPresentation?.label ?? (translateParamLabel(parameter.key) || t(parameter.label))).replace(/\s*\(mm\)\s*$/, "");
    label.textContent = parameter.unit ? `${labelText} (${parameter.unit})` : labelText;
    if (heightPresentation) row.title = heightPresentation.help;
    row.appendChild(label);

    const input =
      control.controlType === "select" && !isCatalogPicker(control.controlType, parameter)
        ? document.createElement("select")
        : document.createElement("input");

    if (input instanceof HTMLInputElement) {
      if (control.controlType === "checkbox" || parameter.type === "boolean") {
        input.type = "checkbox";
        input.checked = Boolean(readParameterValue(params, parameter));
      } else {
        input.type = parameter.type === "number" ? "number" : "text";
        if (parameter.min != null) input.min = String(parameter.min);
        if (parameter.max != null) input.max = String(parameter.max);
        if (parameter.step != null) input.step = String(parameter.step);
        input.value = displayValue(readParameterValue(params, parameter));
      }
    } else {
      appendOptions(input, buildSelectOptions(parameter, args.clientCatalog), readParameterValue(params, parameter));
    }

    const sync = () => {
      if (args.userParametersOnly) {
        const slot = parameter.key.match(/^tallSlot(\d+)/);
        const drawer = parameter.key.match(/^drawer(\d+)FrontHeightMm$/);
        row.hidden = Boolean((slot && Number(slot[1]) > Number(params.tallSlotCount ?? 0)) || (drawer && Number(drawer[1]) > Number(params.drawerCount ?? 0)));
        input.disabled = row.hidden;
      }
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(readParameterValue(params, parameter));
      else input.value = displayValue(readParameterValue(params, parameter));
    };

    input.addEventListener("change", () => {
      const previous = { ...params };
      params[parameter.key] = coerceInputValue(parameter, input);
      const accepted = change(previous, parameter.key);
      if (accepted === false) {
        Object.assign(params, previous);
        sync();
      }
    });

    row.appendChild(input);
    host.appendChild(row);
    records.push({ key: parameter.key, input, row, sync });
    sync();
  }

  if (args.userParametersOnly) for (const section of groups.values()) if (!section.querySelector("[data-parameter-key]")) section.remove();

  const api: ModuleControlsApi = {
    syncFromParams: () => records.forEach((record) => record.sync()),
    isAutoFitEnabled: () => Boolean(params.shelfAutoFit),
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const record of records) record.row.classList.toggle("is-highlighted", active.has(record.key));
    },
    clearHighlights: () => records.forEach((record) => record.row.classList.remove("is-highlighted"))
  };
  return withParameterPresetControl(container, modulePackage, params, args, api);
}

export function createResolvedModuleControls(
  container: HTMLElement,
  modulePackage: FurnQuoteModulePackage,
  params: Record<string, unknown>,
  args: ModuleControlsArgs
): ModuleControlsApi {
  const strategy = resolveModuleControlStrategy(modulePackage, params);
  if (strategy === "module_descriptor") {
    const moduleType =
      typeof params.type === "string" && params.type.trim().length > 0
        ? params.type.trim()
        : modulePackage.module.moduleType;
    const descriptor = getModuleDescriptor(moduleType as Parameters<typeof getModuleDescriptor>[0]);
    if (descriptor) return withParameterPresetControl(container, modulePackage, params, args, descriptor.createControls(container, params as never, args));
  }
  return createModulePackageControls(container, modulePackage, params, args);
}
