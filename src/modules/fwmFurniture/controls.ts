import type { ModuleControlsApi, ModuleControlsArgs } from "../registry";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";

const NUMBER_KEYS = [
  "width",
  "height",
  "depth",
  "drawerCount",
  "doorCount",
  "shelfCount",
  "boardThickness",
  "frontThicknessMm",
  "backThickness",
  "worktopThicknessMm",
  "plinthHeight"
] as const;

export function createFwmFurnitureControls(
  container: HTMLElement,
  params: FwmFurnitureParams,
  args: ModuleControlsArgs
): ModuleControlsApi {
  container.innerHTML = "";
  const rows: Array<{ key: string; input: HTMLInputElement }> = [];

  for (const key of NUMBER_KEYS) {
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
    container.appendChild(row);
    rows.push({ key, input });
  }

  return {
    syncFromParams: () => rows.forEach((row) => {
      row.input.value = String(params[row.key] ?? "");
    }),
    isAutoFitEnabled: () => false,
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const row of rows) row.input.closest("label")?.classList.toggle("is-highlighted", active.has(row.key));
    },
    clearHighlights: () => rows.forEach((row) => row.input.closest("label")?.classList.remove("is-highlighted"))
  };
}
