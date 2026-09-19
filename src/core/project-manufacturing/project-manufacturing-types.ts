export const PROJECT_MANUFACTURING_SETTINGS_SCHEMA_VERSION = 1 as const;

export type ManufacturingRecipeOperationBasis = "area" | "length" | "pieces" | "fixed";

export type ManufacturingRecipeLayer = {
  id: string;
  materialId: string;
  thicknessMm: number;
  /** Captured when selected so subsequent tenant catalog edits cannot alter a project offer. */
  unitPrice?: number | null;
};

export type ManufacturingRecipeOperation = {
  id: string;
  name: string;
  basis: ManufacturingRecipeOperationBasis;
  unitRate: number;
  repetitions: number;
  /** Explicitly selected sides or edges; an empty array never implies all sides. */
  targets: string[];
};

/** A versioned snapshot selected by a project.  Later catalog edits cannot alter it. */
export type ManufacturingRecipeSnapshot = {
  id: string;
  version: number;
  name: string;
  layers: ManufacturingRecipeLayer[];
  operations: ManufacturingRecipeOperation[];
  surfaceMaterialId?: string;
};

export type ManufacturingCatalogSettings = {
  recipes: ManufacturingRecipeSnapshot[];
  preassemblyByModuleType: Record<string, number | null>;
  preassemblyByPreset: Record<string, number | null>;
  boardWastePercent: number | null;
  edgeWastePercent: number | null;
  boardWasteByMaterialId: Record<string, number>;
  edgeWasteByMaterialId: Record<string, number>;
};

export type ProjectManufacturingSettings = {
  schemaVersion: typeof PROJECT_MANUFACTURING_SETTINGS_SCHEMA_VERSION;
  /** Old projects keep their historical price until this is changed deliberately. */
  pricingMode: "legacy" | "configured";
  boardWastePercent: number | null;
  edgeWastePercent: number | null;
  boardWasteByMaterialId: Record<string, number>;
  edgeWasteByMaterialId: Record<string, number>;
  preassemblyByModuleType: Record<string, number | null>;
  preassemblyByPreset: Record<string, number | null>;
  /** A cabinet instance wins over the preset and module type. Null deliberately means missing. */
  preassemblyByInstanceId: Record<string, number | null>;
  recipeSnapshots: Record<string, ManufacturingRecipeSnapshot>;
};

export function createDefaultProjectManufacturingSettings(): ProjectManufacturingSettings {
  return {
    schemaVersion: PROJECT_MANUFACTURING_SETTINGS_SCHEMA_VERSION,
    pricingMode: "legacy",
    boardWastePercent: null,
    edgeWastePercent: null,
    boardWasteByMaterialId: {},
    edgeWasteByMaterialId: {},
    preassemblyByModuleType: {},
    preassemblyByPreset: {},
    preassemblyByInstanceId: {},
    recipeSnapshots: {}
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function numericRecord(value: unknown, allowNull: boolean): Record<string, number | null> {
  const input = record(value);
  if (!input) return {};
  const out: Record<string, number | null> = {};
  for (const [key, candidate] of Object.entries(input)) {
    if (!key.trim()) continue;
    if (allowNull && candidate === null) {
      out[key] = null;
      continue;
    }
    const number = finiteOrNull(candidate);
    if (number !== null) out[key] = number;
  }
  return out;
}

export function normalizeProjectManufacturingSettings(value: unknown): ProjectManufacturingSettings {
  const input = record(value);
  if (!input || input.schemaVersion !== PROJECT_MANUFACTURING_SETTINGS_SCHEMA_VERSION) {
    return createDefaultProjectManufacturingSettings();
  }
  const recipes = record(input.recipeSnapshots) ?? {};
  return {
    schemaVersion: PROJECT_MANUFACTURING_SETTINGS_SCHEMA_VERSION,
    pricingMode: input.pricingMode === "configured" ? "configured" : "legacy",
    boardWastePercent: input.boardWastePercent === null ? null : finiteOrNull(input.boardWastePercent),
    edgeWastePercent: input.edgeWastePercent === null ? null : finiteOrNull(input.edgeWastePercent),
    boardWasteByMaterialId: numericRecord(input.boardWasteByMaterialId, false) as Record<string, number>,
    edgeWasteByMaterialId: numericRecord(input.edgeWasteByMaterialId, false) as Record<string, number>,
    preassemblyByModuleType: numericRecord(input.preassemblyByModuleType, true),
    preassemblyByPreset: numericRecord(input.preassemblyByPreset, true),
    preassemblyByInstanceId: numericRecord(input.preassemblyByInstanceId, true),
    recipeSnapshots: Object.fromEntries(Object.entries(recipes).flatMap(([id, recipe]) => {
      const candidate = recipe as ManufacturingRecipeSnapshot;
      return candidate && typeof candidate === "object" && candidate.id === id ? [[id, structuredClone(candidate)]] : [];
    }))
  };
}

export function recipeThicknessMm(recipe: ManufacturingRecipeSnapshot): number {
  return recipe.layers.reduce((sum, layer) => sum + (Number.isFinite(layer.thicknessMm) && layer.thicknessMm > 0 ? layer.thicknessMm : 0), 0);
}

export type PreassemblyRateResolution = {
  source: "instance" | "preset" | "module" | "missing" | "legacy";
  amount: number | null;
};

export function resolvePreassemblyRate(
  settings: ProjectManufacturingSettings,
  instanceId: string,
  moduleType: string,
  presetId?: string
): PreassemblyRateResolution {
  if (settings.pricingMode === "legacy") return { source: "legacy", amount: null };
  if (Object.prototype.hasOwnProperty.call(settings.preassemblyByInstanceId, instanceId)) {
    return { source: "instance", amount: settings.preassemblyByInstanceId[instanceId] ?? null };
  }
  if (presetId && Object.prototype.hasOwnProperty.call(settings.preassemblyByPreset, presetId)) {
    return { source: "preset", amount: settings.preassemblyByPreset[presetId] ?? null };
  }
  if (Object.prototype.hasOwnProperty.call(settings.preassemblyByModuleType, moduleType)) {
    return { source: "module", amount: settings.preassemblyByModuleType[moduleType] ?? null };
  }
  return { source: "missing", amount: null };
}
