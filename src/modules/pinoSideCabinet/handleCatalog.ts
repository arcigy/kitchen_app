import type { ComponentDefinition, ComponentGeometryDefinition } from "../../core/catalog/catalog-types";

export type PinoHandlePlacementCode = "001" | "002" | "006" | "009";

export type PinoHandleRenderKind = "bar" | "knob" | "profile";

export type PinoHandleCatalogEntry = {
  code: string;
  componentId: string;
  geometryId: string;
  displayName: string;
  handleTypeLabel: string;
  finishLabel: string;
  colorHex: string;
  renderKind: PinoHandleRenderKind;
  nominalLengthMm: number | null;
  previewLengthMm: number | null;
  diameterMm: number | null;
  heightMm: number;
  depthMm: number;
  projectionMm: number;
  allowedPlacementCodes: PinoHandlePlacementCode[];
  defaultPlacementCode: PinoHandlePlacementCode;
  placementEditable: boolean;
  hasSurcharge: boolean;
  sourcePages: number[];
  notes: string[];
};

export type PinoHandlePlacementRule = {
  code: PinoHandlePlacementCode;
  label: string;
  shortLabel: string;
  description: string;
};

const PLACEMENT_RULES: Record<PinoHandlePlacementCode, PinoHandlePlacementRule> = {
  "001": {
    code: "001",
    label: "Poloha uchytky 001",
    shortLabel: "001",
    description: "Horizontal on drawers, pullouts and flap doors. Vertical on swing doors."
  },
  "002": {
    code: "002",
    label: "Poloha uchytky 002",
    shortLabel: "002",
    description: "Horizontal arrangement on all visible fronts."
  },
  "006": {
    code: "006",
    label: "Poloha uchytky 006",
    shortLabel: "006",
    description: "Horizontal arrangement centered on the front."
  },
  "009": {
    code: "009",
    label: "Poloha uchytky 009",
    shortLabel: "009",
    description: "Integrated handle strip / handle rail."
  }
};

function makeHandle(args: {
  code: string;
  handleTypeLabel: string;
  finishLabel: string;
  colorHex: string;
  renderKind: PinoHandleRenderKind;
  nominalLengthMm?: number | null;
  previewLengthMm?: number | null;
  diameterMm?: number | null;
  heightMm?: number;
  depthMm: number;
  projectionMm?: number;
  allowedPlacementCodes?: PinoHandlePlacementCode[];
  defaultPlacementCode?: PinoHandlePlacementCode;
  placementEditable?: boolean;
  hasSurcharge?: boolean;
  sourcePages?: number[];
  notes?: string[];
}): PinoHandleCatalogEntry {
  const componentId = `cmp.pino.handle.${args.code}`;
  const geometryId = `geom.pino.handle.${args.code}`;
  const allowedPlacementCodes = args.allowedPlacementCodes ?? (args.renderKind === "profile" ? ["009"] : ["001", "002", "006"]);
  const defaultPlacementCode = args.defaultPlacementCode ?? allowedPlacementCodes[0] ?? "001";
  const defaultHeight =
    args.renderKind === "knob" ? Math.max(18, Math.round((args.diameterMm ?? 26) * 0.9)) :
    args.renderKind === "profile" ? 18 :
    12;
  const projectionMm =
    args.projectionMm ??
    (args.renderKind === "knob"
      ? Math.max(20, args.depthMm)
      : args.renderKind === "profile"
        ? Math.max(10, Math.min(args.depthMm, 20))
        : Math.max(12, Math.min(args.depthMm, 36)));
  const displayName = `PINO ${args.handleTypeLabel} ${args.code}${args.nominalLengthMm ? ` ${args.nominalLengthMm} mm` : ""} ${args.finishLabel}`;
  return {
    code: args.code,
    componentId,
    geometryId,
    displayName,
    handleTypeLabel: args.handleTypeLabel,
    finishLabel: args.finishLabel,
    colorHex: args.colorHex,
    renderKind: args.renderKind,
    nominalLengthMm: args.nominalLengthMm ?? null,
    previewLengthMm: args.previewLengthMm ?? args.nominalLengthMm ?? null,
    diameterMm: args.diameterMm ?? null,
    heightMm: args.heightMm ?? defaultHeight,
    depthMm: args.depthMm,
    projectionMm,
    allowedPlacementCodes,
    defaultPlacementCode,
    placementEditable: args.placementEditable ?? allowedPlacementCodes.length > 1,
    hasSurcharge: args.hasSurcharge === true,
    sourcePages: args.sourcePages ?? [4, 5, 7],
    notes: args.notes ?? []
  };
}

export const PINO_HANDLE_CATALOG: PinoHandleCatalogEntry[] = [
  makeHandle({ code: "876", handleTypeLabel: "kovova uchytka", finishLabel: "cerny mat", colorHex: "#23262a", renderKind: "bar", nominalLengthMm: 128, depthMm: 34 }),
  makeHandle({ code: "609", handleTypeLabel: "kovova uchytka", finishLabel: "bronz", colorHex: "#9c7b58", renderKind: "bar", nominalLengthMm: 128, depthMm: 34 }),
  makeHandle({ code: "875", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#b9bab5", renderKind: "bar", nominalLengthMm: 128, depthMm: 28 }),
  makeHandle({ code: "890", handleTypeLabel: "kovova uchytka", finishLabel: "cerny mat", colorHex: "#242528", renderKind: "bar", nominalLengthMm: 128, depthMm: 32 }),
  makeHandle({ code: "791", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c3c4bf", renderKind: "bar", nominalLengthMm: 128, depthMm: 32 }),
  makeHandle({ code: "897", handleTypeLabel: "kovova uchytka", finishLabel: "cerna", colorHex: "#1f2023", renderKind: "bar", nominalLengthMm: 160, depthMm: 35 }),
  makeHandle({ code: "603", handleTypeLabel: "kovova uchytka", finishLabel: "barva zlata", colorHex: "#c59b57", renderKind: "bar", nominalLengthMm: 160, depthMm: 35, hasSurcharge: true }),
  makeHandle({ code: "857", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c5c6c1", renderKind: "bar", nominalLengthMm: 160, depthMm: 33 }),
  makeHandle({ code: "601", handleTypeLabel: "kovova uchytka", finishLabel: "cerna", colorHex: "#25272a", renderKind: "bar", nominalLengthMm: 160, depthMm: 30 }),
  makeHandle({ code: "893", handleTypeLabel: "kovova uchytka", finishLabel: "barva zlata", colorHex: "#c5a15c", renderKind: "bar", nominalLengthMm: 160, depthMm: 30, hasSurcharge: true }),
  makeHandle({ code: "891", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#bbbcb8", renderKind: "bar", nominalLengthMm: 160, depthMm: 30 }),
  makeHandle({ code: "605", handleTypeLabel: "kovova uchytka", finishLabel: "cerny mat", colorHex: "#2a2c2f", renderKind: "bar", nominalLengthMm: 160, depthMm: 28, hasSurcharge: true }),
  makeHandle({ code: "604", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c4c5bf", renderKind: "bar", nominalLengthMm: 160, depthMm: 28, hasSurcharge: true }),
  makeHandle({ code: "602", handleTypeLabel: "kovova uchytka", finishLabel: "cerna", colorHex: "#212428", renderKind: "bar", nominalLengthMm: 160, depthMm: 30 }),
  makeHandle({ code: "851", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#bebfba", renderKind: "bar", nominalLengthMm: 160, depthMm: 30 }),
  makeHandle({ code: "600", handleTypeLabel: "kovova uchytka", finishLabel: "cerna", colorHex: "#2d3034", renderKind: "bar", nominalLengthMm: 160, depthMm: 30 }),
  makeHandle({ code: "610", handleTypeLabel: "kovova uchytka", finishLabel: "bronz", colorHex: "#9f8360", renderKind: "bar", nominalLengthMm: 160, depthMm: 28 }),
  makeHandle({ code: "853", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#cccac4", renderKind: "bar", nominalLengthMm: 160, depthMm: 28 }),
  makeHandle({ code: "820", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#cdcdc8", renderKind: "bar", nominalLengthMm: 128, depthMm: 35, hasSurcharge: true }),
  makeHandle({ code: "841", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c6c7c2", renderKind: "bar", nominalLengthMm: 128, depthMm: 38 }),
  makeHandle({ code: "862", handleTypeLabel: "kovova uchytka", finishLabel: "niklova cerna", colorHex: "#433c3b", renderKind: "bar", nominalLengthMm: 128, depthMm: 34, hasSurcharge: true }),
  makeHandle({ code: "880", handleTypeLabel: "kovova uchytka", finishLabel: "grafit", colorHex: "#5a5c60", renderKind: "bar", nominalLengthMm: 160, depthMm: 29, hasSurcharge: true }),
  makeHandle({ code: "879", handleTypeLabel: "kovova uchytka", finishLabel: "grafit", colorHex: "#484b4f", renderKind: "bar", nominalLengthMm: 320, depthMm: 29, hasSurcharge: true }),
  makeHandle({ code: "887", handleTypeLabel: "kovova uchytka", finishLabel: "grafit", colorHex: "#5f6368", renderKind: "bar", nominalLengthMm: 160, depthMm: 20, hasSurcharge: true }),
  makeHandle({ code: "888", handleTypeLabel: "kovova uchytka", finishLabel: "grafit", colorHex: "#60656a", renderKind: "bar", nominalLengthMm: 320, depthMm: 20, hasSurcharge: true }),
  makeHandle({ code: "608", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c8c9c4", renderKind: "bar", nominalLengthMm: 320, depthMm: 38, hasSurcharge: true }),
  makeHandle({ code: "858", handleTypeLabel: "kovova uchytka", finishLabel: "design cerneho chromu", colorHex: "#4e5458", renderKind: "bar", nominalLengthMm: 160, depthMm: 28 }),
  makeHandle({ code: "860", handleTypeLabel: "kovova uchytka", finishLabel: "moreny kartacovany", colorHex: "#61584d", renderKind: "bar", nominalLengthMm: 160, depthMm: 24 }),
  makeHandle({ code: "896", handleTypeLabel: "kovova uchytka", finishLabel: "barva zlata", colorHex: "#c09a57", renderKind: "bar", nominalLengthMm: 160, depthMm: 32, hasSurcharge: true }),
  makeHandle({ code: "861", handleTypeLabel: "kovova uchytka", finishLabel: "design nerez oceli", colorHex: "#c0c0bc", renderKind: "bar", nominalLengthMm: 160, depthMm: 35, hasSurcharge: true }),
  makeHandle({ code: "607", handleTypeLabel: "kovova knopka ovalna", finishLabel: "design nerez oceli", colorHex: "#c4c4c0", renderKind: "knob", diameterMm: 34, heightMm: 26, depthMm: 35, hasSurcharge: true }),
  makeHandle({ code: "606", handleTypeLabel: "kovova knopka", finishLabel: "design nerez oceli", colorHex: "#c1c2be", renderKind: "knob", diameterMm: 28, heightMm: 24, depthMm: 30 }),
  makeHandle({ code: "889", handleTypeLabel: "kovova knopka", finishLabel: "grafit", colorHex: "#585c61", renderKind: "knob", diameterMm: 30, heightMm: 24, depthMm: 21 }),
  makeHandle({ code: "895", handleTypeLabel: "kovova knopka", finishLabel: "design nerez oceli", colorHex: "#bdbeb9", renderKind: "knob", diameterMm: 30, heightMm: 24, depthMm: 21 }),
  makeHandle({
    code: "870",
    handleTypeLabel: "tycova uchytka",
    finishLabel: "design nerez oceli",
    colorHex: "#c8c8c3",
    renderKind: "bar",
    nominalLengthMm: null,
    previewLengthMm: 640,
    depthMm: 38,
    allowedPlacementCodes: ["001"],
    defaultPlacementCode: "001",
    placementEditable: false,
    hasSurcharge: true,
    notes: ["Catalog marks this as STANGE. Preview uses an approximated long rod length."]
  }),
  makeHandle({
    code: "750",
    handleTypeLabel: "tycova uchytka",
    finishLabel: "design nerez oceli",
    colorHex: "#bfc0bb",
    renderKind: "bar",
    nominalLengthMm: null,
    previewLengthMm: 640,
    depthMm: 28,
    allowedPlacementCodes: ["001"],
    defaultPlacementCode: "001",
    placementEditable: false,
    hasSurcharge: true,
    notes: ["Catalog marks this as STANGE. Preview uses an approximated long rod length."]
  }),
  makeHandle({
    code: "886",
    handleTypeLabel: "lista s uchyty",
    finishLabel: "design nerez oceli",
    colorHex: "#c5c6c0",
    renderKind: "profile",
    nominalLengthMm: null,
    previewLengthMm: 320,
    heightMm: 18,
    depthMm: 20,
    projectionMm: 18,
    allowedPlacementCodes: ["009"],
    defaultPlacementCode: "009",
    placementEditable: false,
    hasSurcharge: true,
    notes: ["Catalog depth listed as 18 / 20 mm."]
  }),
  makeHandle({
    code: "894",
    handleTypeLabel: "uchytkova lista",
    finishLabel: "cerna",
    colorHex: "#202326",
    renderKind: "profile",
    nominalLengthMm: null,
    previewLengthMm: 320,
    heightMm: 18,
    depthMm: 20,
    projectionMm: 18,
    allowedPlacementCodes: ["009"],
    defaultPlacementCode: "009",
    placementEditable: false,
    hasSurcharge: true,
    notes: ["Catalog depth listed as 18 / 20 mm."]
  })
];

export function getPinoHandleCatalog(): PinoHandleCatalogEntry[] {
  return PINO_HANDLE_CATALOG.map((entry) => ({
    ...entry,
    allowedPlacementCodes: [...entry.allowedPlacementCodes],
    sourcePages: [...entry.sourcePages],
    notes: [...entry.notes]
  }));
}

export function getPinoHandlePlacementRules(): PinoHandlePlacementRule[] {
  return Object.values(PLACEMENT_RULES).map((rule) => ({ ...rule }));
}

export function getPinoHandlePlacementRule(code: PinoHandlePlacementCode | string | null | undefined): PinoHandlePlacementRule | null {
  if (!code) return null;
  return PLACEMENT_RULES[code as PinoHandlePlacementCode] ?? null;
}

export function getPinoHandleByComponentId(componentId: string | null | undefined): PinoHandleCatalogEntry | null {
  if (!componentId) return null;
  return PINO_HANDLE_CATALOG.find((entry) => entry.componentId === componentId) ?? null;
}

export function getPinoHandleByCode(code: string | null | undefined): PinoHandleCatalogEntry | null {
  if (!code) return null;
  return PINO_HANDLE_CATALOG.find((entry) => entry.code === code) ?? null;
}

export function buildPinoHandleGeometryEntries(): ComponentGeometryDefinition[] {
  return PINO_HANDLE_CATALOG.map((entry) => ({
    id: entry.geometryId,
    displayName: entry.displayName,
    componentType: "handle",
    archetype:
      entry.renderKind === "knob"
        ? "handle_knob"
        : entry.renderKind === "profile"
          ? "handle_profile"
          : "handle_bar",
    sourceGeometry: "catalog_demo",
    dimensionsMm:
      entry.renderKind === "knob"
        ? {
            diameterMm: entry.diameterMm ?? 28,
            projectionMm: entry.projectionMm,
            depthMm: entry.depthMm,
            thicknessMm: entry.heightMm
          }
        : {
            lengthMm: entry.previewLengthMm ?? entry.nominalLengthMm ?? 160,
            heightMm: entry.heightMm,
            depthMm: entry.depthMm,
            projectionMm: entry.projectionMm,
            thicknessMm: entry.heightMm
          },
    notes: [
      `Source pages: ${entry.sourcePages.join(", ")}`,
      `Allowed placements: ${entry.allowedPlacementCodes.join(", ")}`,
      ...(entry.notes.length > 0 ? entry.notes : [])
    ]
  }));
}

export function buildPinoHandleComponentEntries(): ComponentDefinition[] {
  return PINO_HANDLE_CATALOG.map((entry) => ({
    id: entry.componentId,
    entityType: "component",
    componentType: "handle",
    geometryId: entry.geometryId,
    name: entry.displayName,
    displayName: entry.displayName,
    brand: "PINO/Nobilia",
    series: "VKH 2026 Handles",
    variant: entry.code,
    color: entry.finishLabel,
    pricingBasis: "piece",
    pricingUnit: "pcs",
    defaultQuantity: 1,
    isActive: true,
    tags: [
      "pino",
      "nobilia",
      "vkh-2026",
      "handle",
      `handle-code-${entry.code}`,
      `handle-render-${entry.renderKind}`,
      ...entry.allowedPlacementCodes.map((code) => `handle-placement-${code}`),
      ...(entry.hasSurcharge ? ["handle-surcharge"] : [])
    ],
    preview: {
      colorHex: entry.colorHex,
      roughness: 0.34,
      metalness: 0.78
    },
    nominalLengthMm: entry.nominalLengthMm ?? undefined,
    recommendedUse: `Handle family ${entry.code}`,
    notes: [
      `${entry.handleTypeLabel}; ${entry.finishLabel}; hloubka ${entry.depthMm} mm`,
      `Default placement ${entry.defaultPlacementCode}`,
      entry.placementEditable
        ? `Allowed placements ${entry.allowedPlacementCodes.join(", ")}`
        : `Placement fixed to ${entry.defaultPlacementCode}`,
      ...(entry.notes.length > 0 ? entry.notes : [])
    ],
    supplierSource: {
      supplier: "system",
      supplierProductId: entry.code,
      usageCategory: "pino_handles",
      usageSubcategory: entry.renderKind,
      sourceCategory: "vkh_2026_cz_pdf"
    }
  }));
}
