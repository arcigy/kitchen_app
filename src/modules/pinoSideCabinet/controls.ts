import type { ClientCatalog, MaterialDefinition } from "../../core/catalog/catalog-types";
import type { ModuleControlsApi, ModuleControlsArgs } from "../registry";
import { getPinoHandleByComponentId, getPinoHandlePlacementRule } from "./handleCatalog";
import { getPinoSideCabinetCapability, validatePinoSideCabinetApplianceHost } from "./rules";
import {
  getPinoSideCabinetApplianceProfile,
  getPinoSideCabinetApplianceModuleTypeForCategory,
  getPinoSideCabinetApplianceProfilesForGroup,
  getPinoSideCabinetCatalogRow,
  getPinoSideCabinetDefinition,
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetProductChoicesForGroup,
  getPinoSideCabinetProductGroups,
  normalizePinoSideCabinetParams,
  type PinoSideCabinetParams
} from "./types";

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
  for (const option of args.options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = args.value;
  select.addEventListener("change", () => args.onChange(select.value));
  row.appendChild(select);
  return { row, select };
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

function addNumberRow(args: {
  container: HTMLElement;
  label: string;
  value: number | null | undefined;
  onChange: (value: number) => void;
}) {
  const row = addControlRow(args.container, args.label);
  const input = document.createElement("input");
  input.type = "number";
  input.step = "1";
  input.value = typeof args.value === "number" && Number.isFinite(args.value) ? String(Math.round(args.value)) : "";
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    args.onChange(Math.round(parsed));
  });
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

function syncCatalogSelection(params: PinoSideCabinetParams) {
  const definition = getPinoSideCabinetDefinition(params.definitionId);
  const row = getPinoSideCabinetCatalogRow(definition, params.width, params.catalogKey);
  if (row) {
    params.catalogKey = row.catalogKey;
    params.articleCode = row.articleCode;
  }
}

function materialOptions(catalog: ClientCatalog, family: MaterialDefinition["boardFamily"] | null) {
  const familyOptions = family ? catalog.materials.filter((item) => item.boardFamily === family) : catalog.materials;
  const chosen = familyOptions.length > 0 ? familyOptions : catalog.materials;
  return chosen
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((item) => ({ value: item.id, label: item.displayName }));
}

function handleOptions(catalog: ClientCatalog) {
  return catalog.components
    .filter((item) => item.isActive && item.componentType === "handle")
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((item) => ({ value: item.id, label: item.displayName }));
}

function sortPriceGroupKeys(values: Record<string, number>) {
  return Object.keys(values).sort((left, right) => Number(left) - Number(right));
}

function formatDimensionTriplet(widthMm: number | null | undefined, heightMm: number | null | undefined, depthMm: number | null | undefined) {
  const width = typeof widthMm === "number" && Number.isFinite(widthMm) ? Math.round(widthMm) : "-";
  const height = typeof heightMm === "number" && Number.isFinite(heightMm) ? Math.round(heightMm) : "-";
  const depth = typeof depthMm === "number" && Number.isFinite(depthMm) ? Math.round(depthMm) : "-";
  return `${width} x ${height} x ${depth} mm`;
}

export function createPinoSideCabinetControls(
  container: HTMLElement,
  params: PinoSideCabinetParams,
  args: ModuleControlsArgs
): ModuleControlsApi {
  container.innerHTML = "";
  const selectRows = new Map<string, HTMLSelectElement>();
  const checkboxRows = new Map<string, HTMLInputElement>();
  const numberRows = new Map<string, HTMLInputElement>();
  const rowElements = new Map<string, HTMLElement>();

  const selectedDefinition = () => getPinoSideCabinetDefinition(params.definitionId);
  const selectedCatalogRow = () => getPinoSideCabinetCatalogRow(selectedDefinition(), params.width, params.catalogKey);

  const widthOptions = () =>
    selectedDefinition().catalogRows.map((row) => ({
      value: String(row.widthMm),
      label: row.widthListedInCatalog && row.widthCm ? `${row.widthCm} cm` : `Fixed preview width ${row.widthMm} mm`
    }));

  const definitionOptions = () =>
    getPinoSideCabinetProductChoicesForGroup(params.groupId).map((choice) => ({
      value: choice.definitionId,
      label: choice.label
    }));

  const refreshSelectOptions = (select: HTMLSelectElement, options: Array<{ value: string; label: string }>) => {
    select.innerHTML = "";
    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
  };

  const commit = () => {
    syncCatalogSelection(params);
    Object.assign(params, normalizePinoSideCabinetParams(params));
    args.onChange();
  };

  const groupSelect = addSelectRow({
    container,
    label: "Skupina",
    value: params.groupId,
    options: getPinoSideCabinetProductGroups().map((group) => ({ value: group.groupId, label: group.label })),
    onChange: (value) => {
      params.groupId = value;
      const definition = getPinoSideCabinetProductChoicesForGroup(value)[0]
        ? getPinoSideCabinetDefinition(getPinoSideCabinetProductChoicesForGroup(value)[0]!.definitionId)
        : getPinoSideCabinetDefinitions()[0]!;
      params.definitionId = definition.definitionId;
      params.width = definition.dimensionsMm.defaultWidth;
      const row = definition.catalogRows[0];
      params.catalogKey = row?.catalogKey ?? "";
      params.articleCode = row?.articleCode ?? "";
      params.applianceInstalled = definition.productGroupId === "appliance_tall";
      refreshSelectOptions(productSelect.select, definitionOptions());
      refreshSelectOptions(widthSelect.select, widthOptions());
      commit();
      syncFromParams();
    }
  });
  selectRows.set("groupId", groupSelect.select);
  rowElements.set("groupId", groupSelect.row);

  const productSelect = addSelectRow({
    container,
    label: "Produkt",
    value: params.definitionId,
    options: definitionOptions(),
    onChange: (value) => {
      params.definitionId = value;
      const definition = getPinoSideCabinetDefinition(value);
      params.groupId = definition.productGroupId;
      params.width = definition.dimensionsMm.defaultWidth;
      const row = definition.catalogRows[0];
      params.catalogKey = row?.catalogKey ?? "";
      params.articleCode = row?.articleCode ?? "";
      params.applianceInstalled = definition.productGroupId === "appliance_tall";
      refreshSelectOptions(widthSelect.select, widthOptions());
      commit();
      syncFromParams();
    }
  });
  selectRows.set("definitionId", productSelect.select);
  rowElements.set("definitionId", productSelect.row);

  const widthSelect = addSelectRow({
    container,
    label: "Sirka podla katalogu",
    value: String(params.width),
    options: widthOptions(),
    onChange: (value) => {
      params.width = Number(value);
      commit();
      syncFromParams();
    }
  });
  selectRows.set("width", widthSelect.select);
  rowElements.set("width", widthSelect.row);

  const priceGroupSelect = addSelectRow({
    container,
    label: "Cenova skupina",
    value: params.priceGroup,
    options: [],
    onChange: (value) => {
      params.priceGroup = value as PinoSideCabinetParams["priceGroup"];
      commit();
      syncFromParams();
    }
  });
  selectRows.set("priceGroup", priceGroupSelect.select);
  rowElements.set("priceGroup", priceGroupSelect.row);

  const openedToggle = addCheckboxRow({
    container,
    label: "Otvorene",
    checked: params.opened,
    onChange: (checked) => {
      params.opened = checked;
      commit();
      syncFromParams();
    }
  });
  checkboxRows.set("opened", openedToggle.input);
  rowElements.set("opened", openedToggle.row);

  const bodyMaterial = addSelectRow({
    container,
    label: "Material korpusu",
    value: params.bodyMaterialId ?? "",
    options: materialOptions(args.clientCatalog, "body"),
    onChange: (value) => {
      params.bodyMaterialId = value;
      params.shelfMaterialId = value;
      params.plinthMaterialId = value;
      commit();
      syncFromParams();
    }
  });
  selectRows.set("bodyMaterialId", bodyMaterial.select);
  rowElements.set("bodyMaterialId", bodyMaterial.row);

  const frontMaterial = addSelectRow({
    container,
    label: "Material dvierok",
    value: params.frontMaterialId ?? "",
    options: materialOptions(args.clientCatalog, "front"),
    onChange: (value) => {
      params.frontMaterialId = value;
      commit();
      syncFromParams();
    }
  });
  selectRows.set("frontMaterialId", frontMaterial.select);
  rowElements.set("frontMaterialId", frontMaterial.row);

  const backMaterial = addSelectRow({
    container,
    label: "Material chrbta",
    value: params.backMaterialId ?? "",
    options: materialOptions(args.clientCatalog, "back"),
    onChange: (value) => {
      params.backMaterialId = value;
      commit();
      syncFromParams();
    }
  });
  selectRows.set("backMaterialId", backMaterial.select);
  rowElements.set("backMaterialId", backMaterial.row);

  const handleSelect = addSelectRow({
    container,
    label: "Rucka podla katalogu",
    value: params.handleComponentId ?? "",
    options: handleOptions(args.clientCatalog),
    onChange: (value) => {
      params.handleComponentId = value || null;
      const selectedHandle = getPinoHandleByComponentId(params.handleComponentId);
      params.handlePlacementCode = selectedHandle?.defaultPlacementCode ?? "001";
      commit();
      syncFromParams();
    }
  });
  selectRows.set("handleComponentId", handleSelect.select);
  rowElements.set("handleComponentId", handleSelect.row);

  const handlePlacementSelect = addSelectRow({
    container,
    label: "Poloha rucky",
    value: params.handlePlacementCode ?? "",
    options: [],
    onChange: (value) => {
      params.handlePlacementCode = value as PinoSideCabinetParams["handlePlacementCode"];
      commit();
      syncFromParams();
    }
  });
  selectRows.set("handlePlacementCode", handlePlacementSelect.select);
  rowElements.set("handlePlacementCode", handlePlacementSelect.row);

  const handleOffsetInput = addNumberRow({
    container,
    label: "Offset rucky (mm)",
    value: params.handleOffsetMm ?? 0,
    onChange: (value) => {
      params.handleOffsetMm = value;
      commit();
      syncFromParams();
    }
  });
  numberRows.set("handleOffsetMm", handleOffsetInput.input);
  rowElements.set("handleOffsetMm", handleOffsetInput.row);

  const applianceCategorySelect = addSelectRow({
    container,
    label: "Typ spotrebica",
    value: params.applianceCategory ?? "",
    options: [],
    onChange: (value) => {
      params.applianceCategory = value || null;
      const profile = getPinoSideCabinetApplianceProfile(params.applianceCategory);
      if (profile) {
        params.applianceModuleType = getPinoSideCabinetApplianceModuleTypeForCategory(profile.category);
        params.applianceWidthMm = profile.widthMm;
        params.applianceHeightMm = profile.heightMm;
        params.applianceDepthMm = profile.depthMm;
      }
      commit();
      syncFromParams();
    }
  });
  selectRows.set("applianceCategory", applianceCategorySelect.select);
  rowElements.set("applianceCategory", applianceCategorySelect.row);

  const applianceModuleTypeSelect = addSelectRow({
    container,
    label: "Modul spotrebica",
    value: params.applianceModuleType ?? "",
    options: [],
    onChange: (value) => {
      const profile = getPinoSideCabinetApplianceProfilesForGroup(params.groupId)
        .find((item) => getPinoSideCabinetApplianceModuleTypeForCategory(item.category) === value) ?? null;
      params.applianceModuleType = (value || null) as PinoSideCabinetParams["applianceModuleType"];
      if (profile) {
        params.applianceCategory = profile.category;
        params.applianceWidthMm = profile.widthMm;
        params.applianceHeightMm = profile.heightMm;
        params.applianceDepthMm = profile.depthMm;
      }
      commit();
      syncFromParams();
    }
  });
  selectRows.set("applianceModuleType", applianceModuleTypeSelect.select);
  rowElements.set("applianceModuleType", applianceModuleTypeSelect.row);

  const applianceWidthInput = addNumberRow({
    container,
    label: "Sirka spotrebica (mm)",
    value: params.applianceWidthMm,
    onChange: (value) => {
      params.applianceWidthMm = value;
      commit();
      syncFromParams();
    }
  });
  numberRows.set("applianceWidthMm", applianceWidthInput.input);
  rowElements.set("applianceWidthMm", applianceWidthInput.row);

  const applianceHeightInput = addNumberRow({
    container,
    label: "Vyska spotrebica (mm)",
    value: params.applianceHeightMm,
    onChange: (value) => {
      params.applianceHeightMm = value;
      commit();
      syncFromParams();
    }
  });
  numberRows.set("applianceHeightMm", applianceHeightInput.input);
  rowElements.set("applianceHeightMm", applianceHeightInput.row);

  const applianceDepthInput = addNumberRow({
    container,
    label: "Hlbka spotrebica (mm)",
    value: params.applianceDepthMm,
    onChange: (value) => {
      params.applianceDepthMm = value;
      commit();
      syncFromParams();
    }
  });
  numberRows.set("applianceDepthMm", applianceDepthInput.input);
  rowElements.set("applianceDepthMm", applianceDepthInput.row);

  const applianceInstalledToggle = addCheckboxRow({
    container,
    label: "Vlozeny spotrebic",
    checked: params.applianceInstalled === true,
    onChange: (checked) => {
      params.applianceInstalled = checked;
      commit();
      syncFromParams();
    }
  });
  checkboxRows.set("applianceInstalled", applianceInstalledToggle.input);
  rowElements.set("applianceInstalled", applianceInstalledToggle.row);

  const summaryBlock = createMutedBlock(container);
  const notesBlock = createMutedBlock(container);
  const handleBlock = createMutedBlock(container);
  const applianceBlock = createMutedBlock(container);

  const syncInfoBlocks = () => {
    const definition = selectedDefinition();
    const row = selectedCatalogRow();
    const capability = getPinoSideCabinetCapability(params);
    const applianceProfiles = getPinoSideCabinetApplianceProfilesForGroup(definition.productGroupId);
    const applianceOptions = applianceProfiles.map((profile) => ({
      value: profile.category,
      label: profile.label
    }));
    const applianceModuleOptions = applianceProfiles.map((profile) => ({
      value: getPinoSideCabinetApplianceModuleTypeForCategory(profile.category) ?? profile.category,
      label: `${getPinoSideCabinetApplianceModuleTypeForCategory(profile.category) ?? profile.category} (${profile.label})`
    }));
    const prices = row ? sortPriceGroupKeys(row.priceGroupValues).map((key) => `${key}=${row.priceGroupValues[key]}`) : [];
    const frontSummary = definition.frontStackTopDown.map((segment) => segment.nameRaw).join(" | ");
    const interiorSummary = definition.interiorComponents.map((component) => component.nameRaw).join(" | ");
    const selectedHandle = getPinoHandleByComponentId(params.handleComponentId);
    const handlePlacementOptions = (selectedHandle?.allowedPlacementCodes ?? ["001", "002", "006"]).map((code) => {
      const rule = getPinoHandlePlacementRule(code);
      return {
        value: code,
        label: rule ? `${rule.shortLabel} - ${rule.description}` : code
      };
    });

    refreshSelectOptions(applianceCategorySelect.select, applianceOptions);
    refreshSelectOptions(applianceModuleTypeSelect.select, applianceModuleOptions);
    refreshSelectOptions(handlePlacementSelect.select, handlePlacementOptions);
    summaryBlock.textContent = [
      `Katalogovy kluc: ${row?.catalogKey ?? "-"}`,
      `Clanok: ${row?.articleCode ?? "-"}`,
      `Rodina: ${definition.articleFamily}${definition.variantCode ? ` / ${definition.variantCode}` : ""}`,
      `Produkt: ${definition.productTemplateName}`,
      `PDF strana: ${definition.sourcePage}`,
      `Preview image: ${definition.sourceImagePath}`,
      `Fronty: ${frontSummary || "-"}`,
      `Interier: ${interiorSummary || "-"}`
    ].join("\n");
    notesBlock.textContent = [
      prices.length > 0 ? `Ceny: ${prices.join(", ")}` : "Ceny: -",
      row?.pricingReferenceRaw ? `Pricing ref: ${row.pricingReferenceRaw}` : "Pricing ref: -",
      definition.sourceNotes.length > 0 ? `Poznamky: ${definition.sourceNotes.join(" | ")}` : "Poznamky: -"
    ].join("\n");
    const placementRule = getPinoHandlePlacementRule(params.handlePlacementCode ?? null);
    handleBlock.textContent = selectedHandle
      ? [
          `Rucka: ${selectedHandle.displayName}`,
          `Typ: ${selectedHandle.handleTypeLabel}`,
          `Povrch: ${selectedHandle.finishLabel}`,
          `Dlzka: ${selectedHandle.nominalLengthMm ? `${selectedHandle.nominalLengthMm} mm` : "STANGE / variabilna preview dlzka"}`,
          `Hloubka: ${selectedHandle.depthMm} mm`,
          `Poloha: ${placementRule?.label ?? params.handlePlacementCode ?? "-"}`,
          `Pravidlo: ${placementRule?.description ?? "-"}`,
          selectedHandle.notes.length > 0 ? `Poznamky rucky: ${selectedHandle.notes.join(" | ")}` : "Poznamky rucky: -"
        ].join("\n")
      : "Rucka: -";
    handlePlacementSelect.row.style.display = selectedHandle ? "grid" : "none";
    handleOffsetInput.row.style.display = selectedHandle ? "grid" : "none";

    const applianceControlsVisible = capability.requiresApplianceNiche;
    applianceCategorySelect.row.style.display = applianceControlsVisible ? "grid" : "none";
    applianceModuleTypeSelect.row.style.display = applianceControlsVisible ? "grid" : "none";
    applianceWidthInput.row.style.display = applianceControlsVisible ? "grid" : "none";
    applianceHeightInput.row.style.display = applianceControlsVisible ? "grid" : "none";
    applianceDepthInput.row.style.display = applianceControlsVisible ? "grid" : "none";
    applianceInstalledToggle.row.style.display = applianceControlsVisible ? "grid" : "none";

    if (!applianceControlsVisible) {
      applianceBlock.style.display = "none";
      applianceBlock.textContent = "";
      return;
    }

    const selectedProfile = getPinoSideCabinetApplianceProfile(params.applianceCategory);
    const validation = validatePinoSideCabinetApplianceHost(params, {
      applianceCategory: params.applianceCategory ?? null,
      widthMm: typeof params.applianceWidthMm === "number" ? params.applianceWidthMm : null,
      heightMm: typeof params.applianceHeightMm === "number" ? params.applianceHeightMm : null,
      depthMm: typeof params.applianceDepthMm === "number" ? params.applianceDepthMm : null
    });
    applianceBlock.style.display = "block";
    applianceBlock.textContent = [
      `Appliance inserted: ${params.applianceInstalled === true ? "yes" : "no"}`,
      `Appliance host: ${validation.valid ? "compatible" : "incompatible"}`,
      `Odporucane pouzitie: ${capability.recommendedUse}`,
      `Povolene typy: ${applianceProfiles.map((profile) => profile.label).join(", ") || "-"}`,
      `Vybrany typ: ${selectedProfile?.label ?? params.applianceCategory ?? "-"}`,
      `Vkladany modul: ${params.applianceModuleType ?? "-"}`,
      `Pozadovany spotrebic: ${formatDimensionTriplet(params.applianceWidthMm, params.applianceHeightMm, params.applianceDepthMm)}`,
      validation.opening
        ? `Opening clear: ${formatDimensionTriplet(validation.opening.widthMm, validation.opening.heightMm, validation.opening.depthMm)}`
        : "Opening clear: -",
      validation.errors.length > 0 ? `Errors: ${validation.errors.join(" | ")}` : "Errors: -",
      validation.warnings.length > 0 ? `Warnings: ${validation.warnings.join(" | ")}` : "Warnings: -"
    ].join("\n");
  };

  const syncFromParams = () => {
    const definition = selectedDefinition();
    const row = selectedCatalogRow();
    if (row) {
      params.catalogKey = row.catalogKey;
      params.articleCode = row.articleCode;
    }

    refreshSelectOptions(handleSelect.select, handleOptions(args.clientCatalog));
    refreshSelectOptions(productSelect.select, definitionOptions());
    refreshSelectOptions(widthSelect.select, widthOptions());

    const priceGroupKeys = row ? sortPriceGroupKeys(row.priceGroupValues) : [];
    const priceGroupOptions = priceGroupKeys.map((key) => ({
      value: key,
      label: `${key} (${row?.priceGroupValues[key] ?? "-"})`
    }));
    refreshSelectOptions(priceGroupSelect.select, priceGroupOptions);
    if (priceGroupKeys.length > 0 && !priceGroupKeys.includes(params.priceGroup)) {
      params.priceGroup = priceGroupKeys[0] as PinoSideCabinetParams["priceGroup"];
    }
    priceGroupSelect.row.style.display = priceGroupKeys.length > 0 ? "grid" : "none";

    syncInfoBlocks();

    for (const [key, select] of selectRows) {
      select.value = String(params[key as keyof PinoSideCabinetParams] ?? "");
    }
    for (const [key, input] of checkboxRows) {
      input.checked = Boolean(params[key as keyof PinoSideCabinetParams]);
    }
    for (const [key, input] of numberRows) {
      const value = params[key as keyof PinoSideCabinetParams];
      input.value = typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "";
    }
  };

  syncFromParams();

  return {
    syncFromParams,
    isAutoFitEnabled: () => false,
    highlightParamKeys: (keys) => {
      const active = new Set(keys);
      for (const [key, row] of rowElements) row.classList.toggle("is-highlighted", active.has(key));
    },
    clearHighlights: () => {
      for (const row of rowElements.values()) row.classList.remove("is-highlighted");
    }
  };
}
