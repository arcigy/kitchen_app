import type { ClientCatalog } from "../core/catalog/catalog-types";
import { listVendorCatalogGroupSummaries, listVendorCatalogTemplateSummaries } from "../core/catalog/vendor-catalog-browser";
import { resolveVendorModuleSeed } from "../core/catalog/vendor-module-seed-resolver";
import type { ModuleControlsApi, ModuleControlsArgs } from "./registry";

type VendorBackedParams = Record<string, unknown> & {
  type?: string;
  modulePackageId?: string;
  width?: number;
  vendorPlacementZone?: string;
  vendorKitchenModuleRole?: string;
  vendorProductTemplateId?: string;
  vendorPriceGroupValues?: Record<string, number>;
  vendorSelectedPriceGroup?: string;
  vendorNotes?: string[];
  vendorSourcePage?: number;
  catalogKey?: string;
  articleCode?: string;
  articleFamily?: string;
  productTemplateName?: string;
  opened?: boolean;
  bodyMaterialId?: string;
  frontMaterialId?: string;
  backMaterialId?: string;
};

type WidthOption = {
  widthMm: number;
  catalogKey: string;
  label: string;
  ambiguous: boolean;
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function replaceRecordValues(target: Record<string, unknown>, next: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) delete target[key];
  }
  for (const [key, value] of Object.entries(next)) {
    target[key] = cloneValue(value);
  }
}

function preferredVariantSort(left: { needsReview: boolean; confidence: number }, right: { needsReview: boolean; confidence: number }) {
  const leftRank = left.needsReview ? 1 : 0;
  const rightRank = right.needsReview ? 1 : 0;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return right.confidence - left.confidence;
}

function isPinoVendorBackedParams(params: VendorBackedParams, catalog: ClientCatalog): boolean {
  if (params.type === "pino_side_cabinet") return false;
  if (typeof params.modulePackageId !== "string" || !params.modulePackageId.startsWith("pino_nobilia_")) return false;
  if (typeof params.vendorProductTemplateId !== "string" || params.vendorProductTemplateId.trim().length === 0) return false;
  return !!catalog.vendorCatalog;
}

function addControlRow(container: HTMLElement, labelText: string) {
  const row = document.createElement("label");
  row.className = "module-package-control";
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  const label = document.createElement("span");
  label.textContent = labelText;
  row.appendChild(label);
  container.appendChild(row);
  return row;
}

function addSelectRow(args: {
  container: HTMLElement;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const row = addControlRow(args.container, args.label);
  const select = document.createElement("select");
  row.appendChild(select);
  const refresh = (options: Array<{ value: string; label: string }>, value: string) => {
    select.innerHTML = "";
    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.value = value;
  };
  refresh(args.options, args.value);
  select.addEventListener("change", () => args.onChange(select.value));
  return { row, select, refresh };
}

function addCheckboxRow(args: {
  container: HTMLElement;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const row = addControlRow(args.container, args.label);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = args.checked;
  input.addEventListener("change", () => args.onChange(input.checked));
  row.appendChild(input);
  return { row, input };
}

function createMutedBlock(container: HTMLElement) {
  const block = document.createElement("div");
  block.className = "muted";
  block.style.marginTop = "10px";
  block.style.fontSize = "12px";
  block.style.whiteSpace = "pre-wrap";
  container.appendChild(block);
  return block;
}

function materialOptions(catalog: ClientCatalog, family: string | null) {
  const filtered = family ? catalog.materials.filter((item) => item.boardFamily === family && item.isActive !== false) : catalog.materials.filter((item) => item.isActive !== false);
  const chosen = filtered.length > 0 ? filtered : catalog.materials.filter((item) => item.isActive !== false);
  return chosen
    .slice()
    .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name))
    .map((item) => ({ value: item.id, label: item.displayName || item.name }));
}

function numericPriceGroupKeys(values: Record<string, number> | undefined) {
  return Object.keys(values ?? {}).sort((left, right) => Number(left) - Number(right));
}

function readWidthMm(value: { widthMm?: number | null; widthCm?: number | null }) {
  if (typeof value.widthMm === "number" && Number.isFinite(value.widthMm)) return Math.round(value.widthMm);
  if (typeof value.widthCm === "number" && Number.isFinite(value.widthCm)) return Math.round(value.widthCm * 10);
  return null;
}

function makeWidthLabel(widthMm: number, widthCm: number | null) {
  return widthCm != null ? `${widthCm} cm` : `${widthMm} mm`;
}

export function mergeModuleControlsApis(...apis: Array<ModuleControlsApi | null | undefined>): ModuleControlsApi {
  const active = apis.filter((api): api is ModuleControlsApi => !!api);
  return {
    syncFromParams: () => active.forEach((api) => api.syncFromParams()),
    isAutoFitEnabled: () => active.some((api) => api.isAutoFitEnabled()),
    highlightParamKeys: (keys) => active.forEach((api) => api.highlightParamKeys(keys)),
    clearHighlights: () => active.forEach((api) => api.clearHighlights())
  };
}

export function createPinoVendorControls(
  container: HTMLElement,
  params: VendorBackedParams,
  args: ModuleControlsArgs
): ModuleControlsApi | null {
  if (!isPinoVendorBackedParams(params, args.clientCatalog)) return null;

  const vendorCatalog = args.clientCatalog.vendorCatalog!;
  const change = args.onChange as (previousParams?: Record<string, unknown>, sourceKey?: string) => void | boolean;

  const section = document.createElement("div");
  section.className = "module-package-control-group";
  container.appendChild(section);

  const title = document.createElement("div");
  title.className = "muted";
  title.textContent = "PINO katalog";
  section.appendChild(title);

  const placementZone =
    typeof params.vendorPlacementZone === "string" && params.vendorPlacementZone.trim().length > 0
      ? params.vendorPlacementZone
      : "any";
  const kitchenModuleRole =
    typeof params.vendorKitchenModuleRole === "string" && params.vendorKitchenModuleRole.trim().length > 0
      ? params.vendorKitchenModuleRole
      : "any";

  const groupSummaries = listVendorCatalogGroupSummaries(args.clientCatalog, {
    includeNeedsReview: false,
    placementZone: placementZone as "any" | "low" | "corner_low" | "tall" | "tall_appliance" | "accessory" | "unknown",
    kitchenModuleRole: kitchenModuleRole as "any" | "base" | "top" | "tall" | "accessory" | "unknown"
  });
  const groupOptions = groupSummaries.map((group) => ({ value: group.groupId, label: group.label }));

  const findTemplateSummaries = (groupId: string) =>
    listVendorCatalogTemplateSummaries(args.clientCatalog, {
      includeNeedsReview: false,
      groupId
    });

  const findGroupIdForCurrentParams = () => {
    const templateId = typeof params.vendorProductTemplateId === "string" ? params.vendorProductTemplateId : "";
    const direct = findTemplateSummaries(groupOptions[0]?.value ?? "").find((template) => template.productTemplateId === templateId);
    if (direct) return direct.groupId;
    const any = listVendorCatalogTemplateSummaries(args.clientCatalog, { includeNeedsReview: false }).find(
      (template) => template.productTemplateId === templateId
    );
    return any?.groupId ?? groupOptions[0]?.value ?? "";
  };

  const currentGroupId = findGroupIdForCurrentParams();
  const currentTemplateId = typeof params.vendorProductTemplateId === "string" ? params.vendorProductTemplateId : "";
  const rowByKey = new Map<string, HTMLElement>();

  const groupRow = addSelectRow({
    container: section,
    label: "Skupina",
    value: currentGroupId,
    options: groupOptions,
    onChange: (value) => applyCatalogSelection(value)
  });
  rowByKey.set("vendorGroup", groupRow.row);

  const templateRow = addSelectRow({
    container: section,
    label: "Produkt",
    value: currentTemplateId,
    options: [],
    onChange: (value) => applyCatalogSelection(groupRow.select.value, value)
  });
  rowByKey.set("vendorProductTemplateId", templateRow.row);

  const widthRow = addSelectRow({
    container: section,
    label: "Sirka podla katalogu",
    value: "",
    options: [],
    onChange: (value) => applyCatalogSelection(groupRow.select.value, templateRow.select.value, Number(value))
  });
  rowByKey.set("width", widthRow.row);

  const priceGroupRow = addSelectRow({
    container: section,
    label: "Cenova skupina",
    value: typeof params.vendorSelectedPriceGroup === "string" ? params.vendorSelectedPriceGroup : "",
    options: [],
    onChange: (value) => {
      const previous = cloneValue(params);
      params.vendorSelectedPriceGroup = value;
      const accepted = change(previous as Record<string, unknown>, typeof params.type === "string" ? params.type : undefined);
      if (accepted === false) replaceRecordValues(params, previous);
      syncFromParams();
    }
  });
  rowByKey.set("vendorSelectedPriceGroup", priceGroupRow.row);

  let openedRow: ReturnType<typeof addCheckboxRow> | null = null;
  if (typeof params.opened === "boolean") {
    openedRow = addCheckboxRow({
      container: section,
      label: "Otvorene",
      checked: params.opened,
      onChange: (checked) => {
        const previous = cloneValue(params);
        params.opened = checked;
        const accepted = change(previous as Record<string, unknown>, typeof params.type === "string" ? params.type : undefined);
        if (accepted === false) replaceRecordValues(params, previous);
        syncFromParams();
      }
    });
    rowByKey.set("opened", openedRow.row);
  }

  const bodyMaterialRow = addSelectRow({
    container: section,
    label: "Material korpusu",
    value: typeof params.bodyMaterialId === "string" ? params.bodyMaterialId : "",
    options: materialOptions(args.clientCatalog, "body"),
    onChange: (value) => {
      const previous = cloneValue(params);
      params.bodyMaterialId = value;
      const accepted = change(previous as Record<string, unknown>, typeof params.type === "string" ? params.type : undefined);
      if (accepted === false) replaceRecordValues(params, previous);
      syncFromParams();
    }
  });
  rowByKey.set("bodyMaterialId", bodyMaterialRow.row);

  const frontMaterialRow = addSelectRow({
    container: section,
    label: "Material dvierok",
    value: typeof params.frontMaterialId === "string" ? params.frontMaterialId : "",
    options: materialOptions(args.clientCatalog, "front"),
    onChange: (value) => {
      const previous = cloneValue(params);
      params.frontMaterialId = value;
      const accepted = change(previous as Record<string, unknown>, typeof params.type === "string" ? params.type : undefined);
      if (accepted === false) replaceRecordValues(params, previous);
      syncFromParams();
    }
  });
  rowByKey.set("frontMaterialId", frontMaterialRow.row);

  const backMaterialRow = addSelectRow({
    container: section,
    label: "Material chrbta",
    value: typeof params.backMaterialId === "string" ? params.backMaterialId : "",
    options: materialOptions(args.clientCatalog, "back"),
    onChange: (value) => {
      const previous = cloneValue(params);
      params.backMaterialId = value;
      const accepted = change(previous as Record<string, unknown>, typeof params.type === "string" ? params.type : undefined);
      if (accepted === false) replaceRecordValues(params, previous);
      syncFromParams();
    }
  });
  rowByKey.set("backMaterialId", backMaterialRow.row);

  const summaryBlock = createMutedBlock(section);
  const notesBlock = createMutedBlock(section);

  function widthOptionsForTemplate(templateId: string): WidthOption[] {
    const variants = vendorCatalog.productVariants
      .filter((variant) => variant.productTemplateId === templateId && variant.needsReview !== true)
      .slice()
      .sort(preferredVariantSort);
    const byWidth = new Map<number, typeof variants>();
    for (const variant of variants) {
      const widthMm = readWidthMm(variant);
      if (widthMm == null) continue;
      const bucket = byWidth.get(widthMm);
      if (bucket) bucket.push(variant);
      else byWidth.set(widthMm, [variant]);
    }
    return [...byWidth.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([widthMm, bucket]) => {
        const preferred = bucket[0]!;
        const distinctCatalogKeys = [...new Set(bucket.map((variant) => variant.catalogKey))];
        return {
          widthMm,
          catalogKey: preferred.catalogKey,
          label: makeWidthLabel(widthMm, preferred.widthCm ?? null) + (distinctCatalogKeys.length > 1 ? " (review)" : ""),
          ambiguous: distinctCatalogKeys.length > 1
        };
      });
  }

  function syncSummary(selectedWidth: WidthOption | null) {
    const priceKeys = numericPriceGroupKeys(params.vendorPriceGroupValues);
    summaryBlock.textContent = [
      `Katalogovy kluc: ${typeof params.catalogKey === "string" && params.catalogKey ? params.catalogKey : "-"}`,
      `Clanok: ${typeof params.articleCode === "string" && params.articleCode ? params.articleCode : "-"}`,
      `Rodina: ${typeof params.articleFamily === "string" && params.articleFamily ? params.articleFamily : "-"}`,
      `Produkt: ${typeof params.productTemplateName === "string" && params.productTemplateName ? params.productTemplateName : "-"}`,
      `PDF strana: ${typeof params.vendorSourcePage === "number" ? params.vendorSourcePage : "-"}`,
      `Sirka: ${selectedWidth?.label ?? "-"}`
    ].join("\n");

    notesBlock.textContent = [
      priceKeys.length > 0
        ? `Ceny: ${priceKeys.map((key) => `${key}=${params.vendorPriceGroupValues?.[key] ?? "-"}`).join(", ")}`
        : "Ceny: -",
      Array.isArray(params.vendorNotes) && params.vendorNotes.length > 0
        ? `Poznamky: ${params.vendorNotes.join(" | ")}`
        : "Poznamky: -"
    ].join("\n");
  }

  function applyCatalogSelection(nextGroupId: string, nextTemplateId?: string, nextWidthMm?: number) {
    const templates = findTemplateSummaries(nextGroupId);
    const selectedTemplateId = nextTemplateId && templates.some((template) => template.productTemplateId === nextTemplateId)
      ? nextTemplateId
      : templates[0]?.productTemplateId ?? "";
    if (!selectedTemplateId) {
      syncFromParams();
      return;
    }
    const widths = widthOptionsForTemplate(selectedTemplateId);
    const selectedWidth =
      (typeof nextWidthMm === "number" && Number.isFinite(nextWidthMm)
        ? widths.find((width) => width.widthMm === Math.round(nextWidthMm))
        : null) ??
      widths.find((width) => width.catalogKey === params.catalogKey) ??
      widths[0] ??
      null;
    if (!selectedWidth || selectedWidth.ambiguous) {
      syncFromParams();
      return;
    }

    const resolution = resolveVendorModuleSeed(args.clientCatalog, { catalogKey: selectedWidth.catalogKey });
    if (!resolution.params || (resolution.status !== "resolved" && resolution.status !== "needs_review")) {
      syncFromParams();
      return;
    }

    const previous = cloneValue(params);
    const nextParams = cloneValue(resolution.params as Record<string, unknown>) as VendorBackedParams;
    if (typeof previous.vendorSelectedPriceGroup === "string" && previous.vendorSelectedPriceGroup) {
      nextParams.vendorSelectedPriceGroup = previous.vendorSelectedPriceGroup;
    }
    if (typeof previous.bodyMaterialId === "string" && previous.bodyMaterialId) nextParams.bodyMaterialId = previous.bodyMaterialId;
    if (typeof previous.frontMaterialId === "string" && previous.frontMaterialId) nextParams.frontMaterialId = previous.frontMaterialId;
    if (typeof previous.backMaterialId === "string" && previous.backMaterialId) nextParams.backMaterialId = previous.backMaterialId;
    if (typeof previous.opened === "boolean" && typeof nextParams.opened === "boolean") nextParams.opened = previous.opened;

    replaceRecordValues(params, nextParams);
    const accepted = change(previous as Record<string, unknown>, typeof nextParams.type === "string" ? nextParams.type : undefined);
    if (accepted === false) replaceRecordValues(params, previous);
    syncFromParams();
  }

  function syncFromParams() {
    const selectedGroupId = findGroupIdForCurrentParams();
    const templates = findTemplateSummaries(selectedGroupId);
    const templateOptions = templates.map((template) => ({ value: template.productTemplateId, label: template.productTemplateName }));
    const templateId =
      typeof params.vendorProductTemplateId === "string" && templateOptions.some((option) => option.value === params.vendorProductTemplateId)
        ? params.vendorProductTemplateId
        : templateOptions[0]?.value ?? "";
    const widths = widthOptionsForTemplate(templateId);
    const widthOptions = widths.map((width) => ({ value: String(width.widthMm), label: width.label }));
    const selectedWidth =
      widths.find((width) => width.catalogKey === params.catalogKey) ??
      widths.find((width) => width.widthMm === readWidthMm({ widthMm: typeof params.width === "number" ? params.width : null })) ??
      widths[0] ??
      null;

    groupRow.refresh(groupOptions, selectedGroupId);
    templateRow.refresh(templateOptions, templateId);
    widthRow.refresh(widthOptions, selectedWidth ? String(selectedWidth.widthMm) : widthOptions[0]?.value ?? "");

    const priceKeys = numericPriceGroupKeys(params.vendorPriceGroupValues);
    priceGroupRow.row.style.display = priceKeys.length > 0 ? "grid" : "none";
    if (priceKeys.length > 0) {
      const options = priceKeys.map((key) => ({ value: key, label: `${key} (${params.vendorPriceGroupValues?.[key] ?? "-"})` }));
      const selected = typeof params.vendorSelectedPriceGroup === "string" && priceKeys.includes(params.vendorSelectedPriceGroup)
        ? params.vendorSelectedPriceGroup
        : priceKeys[0] ?? "";
      if (selected) params.vendorSelectedPriceGroup = selected;
      priceGroupRow.refresh(options, selected);
    }

    if (openedRow) openedRow.input.checked = params.opened === true;
    bodyMaterialRow.select.value = typeof params.bodyMaterialId === "string" ? params.bodyMaterialId : "";
    frontMaterialRow.select.value = typeof params.frontMaterialId === "string" ? params.frontMaterialId : "";
    backMaterialRow.select.value = typeof params.backMaterialId === "string" ? params.backMaterialId : "";
    syncSummary(selectedWidth);
  }

  syncFromParams();

  return {
    syncFromParams,
    isAutoFitEnabled: () => false,
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const [key, row] of rowByKey) row.classList.toggle("is-highlighted", active.has(key));
    },
    clearHighlights: () => {
      for (const row of rowByKey.values()) row.classList.remove("is-highlighted");
    }
  };
}
