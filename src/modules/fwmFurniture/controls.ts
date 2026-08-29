import type { ModuleControlsApi, ModuleControlsArgs } from "../registry";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";
import { createPinoVendorControls, mergeModuleControlsApis } from "../pinoVendorControls";

const NUMBER_KEYS = [
  "width",
  "height",
  "rowHeight",
  "depth",
  "drawerCount",
  "doorCount",
  "shelfCount",
  "boardThickness",
  "frontThicknessMm",
  "backThickness",
  "worktopThicknessMm",
  "plinthHeight",
  "angleDeg",
  "cornerRadiusMm",
  "chamferMm",
  "frontChamferMm",
  "backChamferMm",
  "cutoutWidthMm",
  "cutoutDepthMm",
  "powerW"
] as const;

const CHECKBOX_KEYS = [
  "opened",
  "hasWorktop",
  "hasPlinth"
] as const;

const SELECT_KEYS = {
  drawerSystemBrand: ["merivobox", "legrabox", "strongbox", "strongmax", "atira", "artitech", "comfort_box"]
} as const;

export function createFwmFurnitureControls(
  container: HTMLElement,
  params: FwmFurnitureParams,
  args: ModuleControlsArgs
): ModuleControlsApi {
  container.innerHTML = "";
  const vendorApi = createPinoVendorControls(container, params as unknown as Record<string, unknown>, args);
  const localHost = document.createElement("div");
  container.appendChild(localHost);
  const rows: Array<{ key: string; input: HTMLInputElement }> = [];
  const selectRows: Array<{ key: string; input: HTMLSelectElement }> = [];
  const textRows: Array<{ key: string; input: HTMLInputElement }> = [];
  const checkboxRows: Array<{ key: string; input: HTMLInputElement }> = [];
  const variant = String(params.variant ?? "");
  const numberKeys = params.type === "fwm_catalog_base_corner"
    ? NUMBER_KEYS.filter((key) =>
        !["width", "rowHeight", "drawerCount", "doorCount", "angleDeg", "cornerRadiusMm", "chamferMm", "cutoutWidthMm", "cutoutDepthMm", "powerW"].includes(key) &&
        (variant.includes("chamfered") || (key !== "frontChamferMm" && key !== "backChamferMm"))
      )
    : NUMBER_KEYS;

  for (const key of numberKeys) {
    const row = document.createElement("label");
    row.className = "module-package-control";
    row.style.display = "grid";
    row.style.gap = "4px";
    row.style.marginTop = "8px";
    const label = document.createElement("span");
    label.textContent = key;
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(params[key] ?? 0);
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (Number.isFinite(value)) params[key] = value;
      Object.assign(params, normalizeFwmFurnitureParams(params));
      args.onChange();
    });
    row.append(label, input);
    localHost.appendChild(row);
    rows.push({ key, input });
  }

  for (const key of CHECKBOX_KEYS) {
    const row = document.createElement("label");
    row.className = "module-package-control";
    row.style.display = "grid";
    row.style.gap = "4px";
    row.style.marginTop = "8px";
    const label = document.createElement("span");
    label.textContent = key;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = params[key] === true;
    input.addEventListener("change", () => {
      params[key] = input.checked;
      Object.assign(params, normalizeFwmFurnitureParams(params));
      args.onChange();
    });
    row.append(label, input);
    localHost.appendChild(row);
    checkboxRows.push({ key, input });
  }

  if ((params.drawerCount as number) > 0) {
    const frontHeightsRow = document.createElement("label");
    frontHeightsRow.className = "module-package-control";
    frontHeightsRow.style.display = "grid";
    frontHeightsRow.style.gap = "4px";
    frontHeightsRow.style.marginTop = "8px";
    const frontHeightsLabel = document.createElement("span");
    frontHeightsLabel.textContent = "drawerFrontHeightsMm";
    const frontHeightsInput = document.createElement("input");
    frontHeightsInput.type = "text";
    frontHeightsInput.value = String(params.drawerFrontHeightsMm ?? "");
    frontHeightsInput.addEventListener("change", () => {
      params.drawerFrontHeightsMm = frontHeightsInput.value;
      Object.assign(params, normalizeFwmFurnitureParams(params));
      args.onChange();
    });
    frontHeightsRow.append(frontHeightsLabel, frontHeightsInput);
    localHost.appendChild(frontHeightsRow);
    textRows.push({ key: "drawerFrontHeightsMm", input: frontHeightsInput });

    for (const [key, options] of Object.entries(SELECT_KEYS) as Array<[keyof typeof SELECT_KEYS, readonly string[]]>) {
      const row = document.createElement("label");
      row.className = "module-package-control";
      row.style.display = "grid";
      row.style.gap = "4px";
      row.style.marginTop = "8px";
      const label = document.createElement("span");
      label.textContent = key;
      const input = document.createElement("select");
      for (const option of options) {
        const item = document.createElement("option");
        item.value = option;
        item.textContent = option.toUpperCase();
        input.appendChild(item);
      }
      input.value = String(params[key] ?? options[0]);
      input.addEventListener("change", () => {
        params[key] = input.value;
        Object.assign(params, normalizeFwmFurnitureParams(params));
        args.onChange();
      });
      row.append(label, input);
      localHost.appendChild(row);
      selectRows.push({ key, input });
    }

    const drawerCount = Math.max(0, Math.min(5, Math.round(Number(params.drawerCount) || 0)));
    for (let index = 1; index <= drawerCount; index++) {
      const key = `drawer${index}SystemSize`;
      const row = document.createElement("label");
      row.className = "module-package-control";
      row.style.display = "grid";
      row.style.gap = "4px";
      row.style.marginTop = "8px";
      const label = document.createElement("span");
      label.textContent = key;
      const input = document.createElement("select");
      for (const option of [
        { value: "", label: "AUTO" },
        { value: "M", label: "M" },
        { value: "D", label: "D" },
        { value: "E", label: "E" },
        { value: "F", label: "F" }
      ]) {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        input.appendChild(item);
      }
      input.value = String(params[key] ?? "");
      input.addEventListener("change", () => {
        params[key] = input.value;
        Object.assign(params, normalizeFwmFurnitureParams(params));
        args.onChange();
      });
      row.append(label, input);
      localHost.appendChild(row);
      selectRows.push({ key, input });
    }
  }

  if ((params.shelfCount as number) > 0) {
    const shelfGapsRow = document.createElement("label");
    shelfGapsRow.className = "module-package-control";
    shelfGapsRow.style.display = "grid";
    shelfGapsRow.style.gap = "4px";
    shelfGapsRow.style.marginTop = "8px";
    const shelfGapsLabel = document.createElement("span");
    shelfGapsLabel.textContent = "shelfGaps";
    const shelfGapsInput = document.createElement("input");
    shelfGapsInput.type = "text";
    shelfGapsInput.value = String(params.shelfGaps ?? "");
    shelfGapsInput.addEventListener("change", () => {
      params.shelfGaps = shelfGapsInput.value;
      Object.assign(params, normalizeFwmFurnitureParams(params));
      args.onChange();
    });
    shelfGapsRow.append(shelfGapsLabel, shelfGapsInput);
    localHost.appendChild(shelfGapsRow);
    textRows.push({ key: "shelfGaps", input: shelfGapsInput });
  }

  const localApi: ModuleControlsApi = {
    syncFromParams: () => {
      rows.forEach((row) => {
        row.input.value = String(params[row.key] ?? "");
      });
      checkboxRows.forEach((row) => {
        row.input.checked = params[row.key] === true;
      });
      selectRows.forEach((row) => {
        row.input.value = String(params[row.key] ?? "");
      });
      textRows.forEach((row) => {
        row.input.value = String(params[row.key] ?? "");
      });
    },
    isAutoFitEnabled: () => false,
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const row of rows) row.input.closest("label")?.classList.toggle("is-highlighted", active.has(row.key));
      for (const row of checkboxRows) row.input.closest("label")?.classList.toggle("is-highlighted", active.has(row.key));
      for (const row of selectRows) row.input.closest("label")?.classList.toggle("is-highlighted", active.has(row.key));
      for (const row of textRows) row.input.closest("label")?.classList.toggle("is-highlighted", active.has(row.key));
    },
    clearHighlights: () => {
      for (const row of rows) row.input.closest("label")?.classList.remove("is-highlighted");
      for (const row of checkboxRows) row.input.closest("label")?.classList.remove("is-highlighted");
      for (const row of selectRows) row.input.closest("label")?.classList.remove("is-highlighted");
      for (const row of textRows) row.input.closest("label")?.classList.remove("is-highlighted");
    }
  };
  return mergeModuleControlsApis(vendorApi, localApi);
}
