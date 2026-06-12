import type { ClientCatalog } from "../../catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleParameterDefinition } from "../module-package-types";
import type { ModuleControlsApi, ModuleControlsArgs } from "../../../modules/registry";
import { t, translateEnumLabel, translateParamLabel } from "../../../i18n";

type ControlRecord = {
  key: string;
  input: HTMLInputElement | HTMLSelectElement;
  row: HTMLElement;
  sync: () => void;
};

function displayValue(value: unknown): string {
  return value == null ? "" : String(value);
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

  for (const control of sortedControls(modulePackage)) {
    const parameter = findParameter(modulePackage, control.parameterKey);
    if (!parameter) continue;
    const host = control.groupId ? groups.get(control.groupId) ?? container : container;
    const row = document.createElement("label");
    row.className = "module-package-control";
    row.style.display = "grid";
    row.style.gap = "4px";
    row.style.marginTop = "8px";

    const label = document.createElement("span");
    const labelText = translateParamLabel(parameter.key) || t(parameter.label);
    label.textContent = parameter.unit ? `${labelText} (${parameter.unit})` : labelText;
    row.appendChild(label);

    const input =
      control.controlType === "select" && !isCatalogPicker(control.controlType, parameter)
        ? document.createElement("select")
        : document.createElement("input");

    if (input instanceof HTMLInputElement) {
      if (control.controlType === "checkbox" || parameter.type === "boolean") {
        input.type = "checkbox";
        input.checked = Boolean(params[parameter.key]);
      } else {
        input.type = parameter.type === "number" ? "number" : "text";
        if (parameter.min != null) input.min = String(parameter.min);
        if (parameter.max != null) input.max = String(parameter.max);
        if (parameter.step != null) input.step = String(parameter.step);
        input.value = displayValue(params[parameter.key]);
      }
    } else {
      appendOptions(input, buildSelectOptions(parameter, args.clientCatalog), params[parameter.key]);
    }

    const sync = () => {
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(params[parameter.key]);
      else input.value = displayValue(params[parameter.key]);
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
  }

  return {
    syncFromParams: () => records.forEach((record) => record.sync()),
    isAutoFitEnabled: () => Boolean(params.shelfAutoFit),
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const record of records) record.row.classList.toggle("is-highlighted", active.has(record.key));
    },
    clearHighlights: () => records.forEach((record) => record.row.classList.remove("is-highlighted"))
  };
}
