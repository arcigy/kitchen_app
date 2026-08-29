import type { FloorBoundaryPoint } from "./localTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { resolveKitchenWorktopThickness } from "../layout/kitchenMaterialSync";
import { makeDefaultKitchenContext, resolveContext, type KitchenContext } from "../layout/kitchenContext";
import { makeDefaultModuleParams, type ModuleParams } from "../model/cabinetTypes";
import {
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetProductGroup,
  makeDefaultPinoSideCabinetParams,
  normalizePinoSideCabinetParams
} from "../modules/pinoSideCabinet/types";
import { getPinoHandleCatalog } from "../modules/pinoSideCabinet/handleCatalog";
import type {
  PinoVendorKitchenCatalogEntry,
  PinoVendorKitchenCatalogRole
} from "../layout/pinoVendorKitchenCatalog";

export type PinoShowroomEntrySource =
  | "vendor_catalog"
  | "side_cabinet"
  | "synthetic_appliance"
  | "handle_display";

export type PinoShowroomSeedEntry = {
  id: string;
  source: PinoShowroomEntrySource;
  role: PinoVendorKitchenCatalogRole;
  groupId: string;
  groupLabel: string;
  title: string;
  catalogKey: string;
  moduleType: string;
  params: ModuleParams;
  widthMm: number;
  depthMm: number;
  footprintWidthMm: number;
  footprintDepthMm: number;
};

export type PinoShowroomPlacement = {
  rowId: string;
  entryId: string;
  xMm: number;
  zMm: number;
  rotationYDeg: number;
  widthMm: number;
  depthMm: number;
};

export type PinoShowroomRow = {
  rowId: string;
  role: PinoVendorKitchenCatalogRole;
  label: string;
  zMm: number;
  minXMm: number;
  maxXMm: number;
  groupLabels: string[];
  itemCount: number;
};

export type PinoShowroomPlan = {
  entries: PinoShowroomSeedEntry[];
  rows: PinoShowroomRow[];
  placements: PinoShowroomPlacement[];
  floorBoundary: FloorBoundaryPoint[];
  extentsMm: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
};

type MutableRow = {
  rowId: string;
  role: PinoVendorKitchenCatalogRole;
  label: string;
  zMm: number;
  placements: PinoShowroomPlacement[];
  groupLabels: string[];
};

type BuildPinoShowroomPlanOptions = {
  maxRowWidthMm?: number;
  itemGapMm?: number;
  groupGapMm?: number;
  rowGapMm?: number;
  roleGapMm?: number;
  floorMarginMm?: number;
};

const DEFAULTS = {
  maxRowWidthMm: 14000,
  itemGapMm: 120,
  groupGapMm: 320,
  rowGapMm: 1800,
  roleGapMm: 2600,
  floorMarginMm: 1200
} as const;

const ROLE_ORDER: PinoVendorKitchenCatalogRole[] = ["low", "top", "tall", "accessory"];

const SHOWROOM_APPLIANCE_MODULES = [
  {
    moduleType: "fwm_built_in_dishwasher",
    role: "low" as const,
    groupId: "showroom_appliance_low",
    groupLabel: "Spotrebice pod doskou",
    title: "Vstavana umyvacka riadu",
    catalogKey: "SHOWROOM-DW-60"
  },
  {
    moduleType: "fwm_built_in_fridge",
    role: "tall" as const,
    groupId: "showroom_appliance_tall",
    groupLabel: "Spotrebicove vysoke moduly",
    title: "Vstavana chladnicka",
    catalogKey: "SHOWROOM-FRIDGE-60"
  },
  {
    moduleType: "fwm_oven_tower_module",
    role: "tall" as const,
    groupId: "showroom_appliance_tall",
    groupLabel: "Spotrebicove vysoke moduly",
    title: "Rurovy modul",
    catalogKey: "SHOWROOM-OVEN-60"
  },
  {
    moduleType: "fwm_microwave_tower_module",
    role: "tall" as const,
    groupId: "showroom_appliance_tall",
    groupLabel: "Spotrebicove vysoke moduly",
    title: "Mikrovlnny modul",
    catalogKey: "SHOWROOM-MW-60"
  }
] as const;

function roleRank(role: PinoVendorKitchenCatalogRole) {
  const index = ROLE_ORDER.indexOf(role);
  return index >= 0 ? index : ROLE_ORDER.length;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function readModuleWidthMm(params: ModuleParams) {
  const record = params as Record<string, unknown>;
  return (
    readNumber(record, "width") ??
    readNumber(record, "widthMm") ??
    readNumber(record, "lengthX") ??
    600
  );
}

function readModuleDepthMm(params: ModuleParams) {
  const record = params as Record<string, unknown>;
  return (
    readNumber(record, "depth") ??
    readNumber(record, "depthMm") ??
    readNumber(record, "lengthZ") ??
    600
  );
}

function estimateFootprintWidthMm(entry: Pick<PinoShowroomSeedEntry, "moduleType" | "params" | "widthMm">) {
  const record = entry.params as Record<string, unknown>;
  if (entry.moduleType === "corner_shelf_lower") {
    const lengthX = readNumber(record, "lengthX") ?? entry.widthMm;
    const lengthZ = readNumber(record, "lengthZ") ?? entry.widthMm;
    return Math.max(lengthX, lengthZ) + 180;
  }
  if (entry.moduleType === "pino_side_cabinet") {
    return Math.max(300, entry.widthMm + 60);
  }
  return Math.max(120, entry.widthMm);
}

function estimateFootprintDepthMm(entry: Pick<PinoShowroomSeedEntry, "moduleType" | "params" | "depthMm">) {
  const record = entry.params as Record<string, unknown>;
  if (entry.moduleType === "corner_shelf_lower") {
    const lengthX = readNumber(record, "lengthX") ?? entry.depthMm;
    const lengthZ = readNumber(record, "lengthZ") ?? entry.depthMm;
    return Math.max(lengthX, lengthZ);
  }
  return Math.max(120, entry.depthMm);
}

function roleLabel(role: PinoVendorKitchenCatalogRole, rowIndex: number) {
  switch (role) {
    case "low":
      return `PINO spodne moduly ${rowIndex + 1}`;
    case "top":
      return `PINO horne moduly ${rowIndex + 1}`;
    case "tall":
      return `PINO bocne skrinky ${rowIndex + 1}`;
    case "accessory":
      return `PINO listy a doplnky ${rowIndex + 1}`;
    default:
      return `PINO showroom ${rowIndex + 1}`;
  }
}

function createShowroomApplianceEntries(): PinoShowroomSeedEntry[] {
  return SHOWROOM_APPLIANCE_MODULES.map((item) => {
    const params = structuredClone(makeDefaultModuleParams(item.moduleType));
    const widthMm = readModuleWidthMm(params);
    const depthMm = readModuleDepthMm(params);
    const seed: PinoShowroomSeedEntry = {
      id: `appliance:${item.moduleType}`,
      source: "synthetic_appliance",
      role: item.role,
      groupId: item.groupId,
      groupLabel: item.groupLabel,
      title: item.title,
      catalogKey: item.catalogKey,
      moduleType: item.moduleType,
      params,
      widthMm,
      depthMm,
      footprintWidthMm: 0,
      footprintDepthMm: 0
    };
    seed.footprintWidthMm = estimateFootprintWidthMm(seed);
    seed.footprintDepthMm = estimateFootprintDepthMm(seed);
    return seed;
  });
}

function createShowroomHandleEntries(): PinoShowroomSeedEntry[] {
  const handleDefinition =
    getPinoSideCabinetDefinitions().find((definition) => definition.definitionId === "pino_side_cabinet_s_gk_page243") ??
    getPinoSideCabinetDefinitions()[0];
  if (!handleDefinition) return [];

  return getPinoHandleCatalog().map((handle) => {
    const defaultRow = handleDefinition.catalogRows[0] ?? null;
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: handleDefinition.productGroupId,
      definitionId: handleDefinition.definitionId,
      width: handleDefinition.dimensionsMm.defaultWidth,
      catalogKey: defaultRow?.catalogKey ?? handleDefinition.catalogKeys[0] ?? "",
      articleCode: defaultRow?.articleCode ?? "",
      handleComponentId: handle.componentId,
      handlePlacementCode: handle.defaultPlacementCode,
      handleOffsetMm: 0,
      applianceInstalled: false,
      opened: false
    });
    const seed: PinoShowroomSeedEntry = {
      id: `handle:${handle.code}`,
      source: "handle_display",
      role: "accessory",
      groupId: "showroom_handles",
      groupLabel: "PINO rucky",
      title: `${handle.displayName} [${handle.defaultPlacementCode}]`,
      catalogKey: `HANDLE-${handle.code}`,
      moduleType: "pino_side_cabinet",
      params,
      widthMm: params.width,
      depthMm: params.depth,
      footprintWidthMm: 0,
      footprintDepthMm: 0
    };
    seed.footprintWidthMm = estimateFootprintWidthMm(seed);
    seed.footprintDepthMm = estimateFootprintDepthMm(seed);
    return seed;
  });
}

export function createPinoShowroomKitchenContext(
  catalog: Pick<ClientCatalog, "materials" | "kitchenDefaults">
): KitchenContext {
  const base = resolveContext(structuredClone(makeDefaultKitchenContext(catalog)));
  const worktopMaterialId = base.worktopMaterialId || catalog.kitchenDefaults.worktopMaterialId || "";
  const worktopThicknessMm =
    worktopMaterialId.trim().length > 0
      ? resolveKitchenWorktopThickness(worktopMaterialId, base.worktopThicknessMm, catalog as ClientCatalog)
      : base.worktopThicknessMm;
  return resolveContext({
    ...base,
    worktopMaterialId,
    worktopThicknessMm,
    plinthHeightMm: catalog.kitchenDefaults.defaultPlinthHeightMm ?? base.plinthHeightMm
  });
}

export function createPinoShowroomSeedEntries(
  vendorEntries: readonly PinoVendorKitchenCatalogEntry[]
): PinoShowroomSeedEntry[] {
  const normalizedVendorEntries = vendorEntries.map((entry) => {
    const widthMm = readModuleWidthMm(entry.params);
    const depthMm = readModuleDepthMm(entry.params);
    const seed: PinoShowroomSeedEntry = {
      id: `vendor:${entry.productTemplateId}`,
      source: "vendor_catalog",
      role: entry.role,
      groupId: entry.groupId,
      groupLabel: entry.groupLabel,
      title: entry.productTemplateName,
      catalogKey: entry.catalogKey,
      moduleType: entry.moduleType,
      params: structuredClone(entry.params),
      widthMm,
      depthMm,
      footprintWidthMm: 0,
      footprintDepthMm: 0
    };
    seed.footprintWidthMm = estimateFootprintWidthMm(seed);
    seed.footprintDepthMm = estimateFootprintDepthMm(seed);
    return seed;
  });

  const sideCabinetEntries = getPinoSideCabinetDefinitions().flatMap((definition) =>
    definition.catalogRows.map((row) => {
      const params = normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: definition.productGroupId,
        definitionId: definition.definitionId,
        catalogKey: row.catalogKey,
        articleCode: row.articleCode,
        width: row.widthMm,
        applianceInstalled: definition.productGroupId === "appliance_tall"
      });
      const seed: PinoShowroomSeedEntry = {
        id: `side:${definition.definitionId}:${row.catalogKey}`,
        source: "side_cabinet",
        role: "tall",
        groupId: definition.productGroupId,
        groupLabel: getPinoSideCabinetProductGroup(definition.productGroupId).label,
        title: definition.moduleLabel,
        catalogKey: row.catalogKey,
        moduleType: "pino_side_cabinet",
        params,
        widthMm: row.widthMm,
        depthMm: params.depth,
        footprintWidthMm: 0,
        footprintDepthMm: 0
      };
      seed.footprintWidthMm = estimateFootprintWidthMm(seed);
      seed.footprintDepthMm = estimateFootprintDepthMm(seed);
      return seed;
    })
  );

  const applianceEntries = createShowroomApplianceEntries();
  const handleEntries = createShowroomHandleEntries();

  return [...normalizedVendorEntries, ...sideCabinetEntries, ...applianceEntries, ...handleEntries].sort((left, right) =>
    roleRank(left.role) - roleRank(right.role) ||
    left.groupLabel.localeCompare(right.groupLabel) ||
    left.title.localeCompare(right.title) ||
    left.catalogKey.localeCompare(right.catalogKey)
  );
}

export function buildPinoShowroomPlan(
  sourceEntries: readonly PinoShowroomSeedEntry[],
  options: BuildPinoShowroomPlanOptions = {}
): PinoShowroomPlan {
  const maxRowWidthMm = options.maxRowWidthMm ?? DEFAULTS.maxRowWidthMm;
  const itemGapMm = options.itemGapMm ?? DEFAULTS.itemGapMm;
  const groupGapMm = options.groupGapMm ?? DEFAULTS.groupGapMm;
  const rowGapMm = options.rowGapMm ?? DEFAULTS.rowGapMm;
  const roleGapMm = options.roleGapMm ?? DEFAULTS.roleGapMm;
  const floorMarginMm = options.floorMarginMm ?? DEFAULTS.floorMarginMm;

  const entries = sourceEntries.map((entry) => structuredClone(entry));
  const rows: MutableRow[] = [];
  const placements: PinoShowroomPlacement[] = [];
  let cursorZMm = 0;

  for (const role of ROLE_ORDER) {
    const roleEntries = entries.filter((entry) => entry.role === role);
    if (roleEntries.length === 0) continue;

    let rowIndex = 0;
    let currentRow: MutableRow = {
      rowId: `${role}_row_${rowIndex + 1}`,
      role,
      label: roleLabel(role, rowIndex),
      zMm: cursorZMm,
      placements: [],
      groupLabels: []
    };
    let cursorXMm = 0;
    let previousGroupLabel: string | null = null;

    const pushRow = () => {
      if (currentRow.placements.length === 0) return;
      rows.push(currentRow);
      rowIndex += 1;
      currentRow = {
        rowId: `${role}_row_${rowIndex + 1}`,
        role,
        label: roleLabel(role, rowIndex),
        zMm: cursorZMm + rowIndex * rowGapMm,
        placements: [],
        groupLabels: []
      };
      cursorXMm = 0;
      previousGroupLabel = null;
    };

    for (const entry of roleEntries) {
      const itemWidthMm = Math.max(100, entry.footprintWidthMm);
      const gapMm =
        currentRow.placements.length === 0
          ? 0
          : previousGroupLabel === entry.groupLabel
            ? itemGapMm
            : groupGapMm;
      const nextStartXMm = cursorXMm + gapMm;
      if (currentRow.placements.length > 0 && nextStartXMm + itemWidthMm > maxRowWidthMm) {
        pushRow();
      }

      const effectiveGapMm =
        currentRow.placements.length === 0
          ? 0
          : previousGroupLabel === entry.groupLabel
            ? itemGapMm
            : groupGapMm;
      cursorXMm += effectiveGapMm;
      const placement: PinoShowroomPlacement = {
        rowId: currentRow.rowId,
        entryId: entry.id,
        xMm: cursorXMm + itemWidthMm * 0.5,
        zMm: currentRow.zMm,
        rotationYDeg: 0,
        widthMm: itemWidthMm,
        depthMm: Math.max(120, entry.footprintDepthMm)
      };
      currentRow.placements.push(placement);
      if (!currentRow.groupLabels.includes(entry.groupLabel)) currentRow.groupLabels.push(entry.groupLabel);
      placements.push(placement);
      cursorXMm += itemWidthMm;
      previousGroupLabel = entry.groupLabel;
    }

    pushRow();
    cursorZMm += Math.max(roleGapMm, rowIndex * rowGapMm + roleGapMm);
  }

  if (placements.length === 0) {
    return {
      entries,
      rows: [],
      placements: [],
      floorBoundary: [],
      extentsMm: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    minX = Math.min(minX, placement.xMm - placement.widthMm * 0.5);
    maxX = Math.max(maxX, placement.xMm + placement.widthMm * 0.5);
    minZ = Math.min(minZ, placement.zMm - placement.depthMm * 0.5);
    maxZ = Math.max(maxZ, placement.zMm + placement.depthMm * 0.5);
  }

  const offsetXMm = -Math.round((minX + maxX) * 0.5);
  const offsetZMm = -Math.round((minZ + maxZ) * 0.5);
  for (const placement of placements) {
    placement.xMm += offsetXMm;
    placement.zMm += offsetZMm;
  }

  const finalizedRows = rows.map((row) => {
    const rowPlacements = placements.filter((placement) => placement.rowId === row.rowId);
    const rowMinX = rowPlacements.length > 0
      ? Math.min(...rowPlacements.map((placement) => placement.xMm - placement.widthMm * 0.5))
      : 0;
    const rowMaxX = rowPlacements.length > 0
      ? Math.max(...rowPlacements.map((placement) => placement.xMm + placement.widthMm * 0.5))
      : 0;
    const rowCenterZ = rowPlacements.length > 0 ? rowPlacements[0]!.zMm : row.zMm + offsetZMm;
    return {
      rowId: row.rowId,
      role: row.role,
      label: row.label,
      zMm: rowCenterZ,
      minXMm: Math.round(rowMinX),
      maxXMm: Math.round(rowMaxX),
      groupLabels: [...row.groupLabels],
      itemCount: rowPlacements.length
    } satisfies PinoShowroomRow;
  });

  minX = Number.POSITIVE_INFINITY;
  maxX = Number.NEGATIVE_INFINITY;
  minZ = Number.POSITIVE_INFINITY;
  maxZ = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    minX = Math.min(minX, placement.xMm - placement.widthMm * 0.5);
    maxX = Math.max(maxX, placement.xMm + placement.widthMm * 0.5);
    minZ = Math.min(minZ, placement.zMm - placement.depthMm * 0.5);
    maxZ = Math.max(maxZ, placement.zMm + placement.depthMm * 0.5);
  }

  const floorBoundary: FloorBoundaryPoint[] = [
    { x: Math.round(minX - floorMarginMm), z: Math.round(minZ - floorMarginMm) },
    { x: Math.round(maxX + floorMarginMm), z: Math.round(minZ - floorMarginMm) },
    { x: Math.round(maxX + floorMarginMm), z: Math.round(maxZ + floorMarginMm) },
    { x: Math.round(minX - floorMarginMm), z: Math.round(maxZ + floorMarginMm) }
  ];

  return {
    entries,
    rows: finalizedRows,
    placements,
    floorBoundary,
    extentsMm: {
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minZ: Math.round(minZ),
      maxZ: Math.round(maxZ)
    }
  };
}
