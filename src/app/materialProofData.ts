export type MaterialProofMode = "csv" | "production" | "staging";

export type MaterialProofEntry = {
  catalogType?: string;
  vendor?: string;
  vendorDecorId?: string;
  vendorSku?: string;
  displayName?: string;
  materialType?: string;
  decorFamily?: string;
  colorFamily?: string;
  surfaceHint?: string;
  targetInternalMaterialId?: string;
  pbrMaterialId?: string;
  pbrBaseColorAsset?: string;
  pbrBaseColorUrl?: string;
  proceduralTemplate?: string;
  grainPatternId?: string;
  surfaceProfile?: string;
  colorPreviewHex?: string;
  baseColorHex?: string;
  sampledBaseColorHex?: string;
  sampledColors?: string[];
  grainColorHex?: string;
  tintStrength?: number;
  grainContrast?: number;
  roughnessMultiplier?: number;
  roughnessOverride?: number | null;
  bumpMultiplier?: number;
  grainDepth?: number;
  coatMultiplier?: number;
  tileSizeMeters?: number;
  uvScale?: number;
  grainDirectionDefault?: string;
  mappingStatus?: string;
  mappingLocked?: boolean;
  confidence?: number;
  colorSourceMethod?: string;
  productionSafe?: boolean;
  usesExternalVendorTexture?: boolean;
  sourceReference?: string | null;
  vendorUrl?: string | null;
  productUrl?: string | null;
  demosUrl?: string | null;
  demosReferenceImageUrl?: string | null;
  demosReferencePageUrl?: string | null;
  demosReferenceSource?: string | null;
  rawCsv?: Record<string, string>;
};

export type MaterialProofCatalogs = {
  csvBoards: MaterialProofEntry[];
  production: MaterialProofEntry[];
  staging: MaterialProofEntry[];
};

export type MaterialProofFilters = {
  query: string;
  materialType: string;
  surfaceProfile: string;
  mappingStatus: string;
  productionSafe: string;
};

export function demosEntries(entries: MaterialProofEntry[]): MaterialProofEntry[] {
  return entries.filter((entry) => entry.catalogType === "demosDecorMapping" && entry.vendorDecorId);
}

export function materialColor(entry: MaterialProofEntry): string {
  return entry.sampledBaseColorHex || entry.colorPreviewHex || entry.baseColorHex || "#b98a55";
}

export function materialPayload(entry: MaterialProofEntry): Record<string, unknown> {
  return {
    vendor: entry.vendor ?? "demos",
    vendorDecorId: entry.vendorDecorId,
    displayName: entry.displayName,
    targetInternalMaterialId: entry.targetInternalMaterialId,
    pbrMaterialId: entry.pbrMaterialId,
    pbrBaseColorAsset: entry.pbrBaseColorAsset,
    proceduralTemplate: entry.proceduralTemplate,
    grainPatternId: entry.grainPatternId,
    surfaceProfile: entry.surfaceProfile,
    baseColorHex: materialColor(entry),
    sampledColors: entry.sampledColors ?? [],
    grainColorHex: entry.grainColorHex,
    tintStrength: entry.tintStrength ?? null,
    grainContrast: entry.grainContrast ?? null,
    roughnessMultiplier: entry.roughnessMultiplier ?? null,
    roughnessOverride: entry.roughnessOverride ?? null,
    bumpMultiplier: entry.bumpMultiplier ?? null,
    grainDepth: entry.grainDepth ?? null,
    coatMultiplier: entry.coatMultiplier ?? null,
    tileSizeMeters: entry.tileSizeMeters,
    uvScale: entry.uvScale,
    grainDirectionDefault: entry.grainDirectionDefault,
    mappingStatus: entry.mappingStatus,
    mappingLocked: entry.mappingLocked,
    confidence: entry.confidence,
    colorSourceMethod: entry.colorSourceMethod,
    productionSafe: entry.productionSafe,
    usesExternalVendorTexture: entry.usesExternalVendorTexture,
    sourceReference: entry.sourceReference ?? null,
    demosReferenceImageUrl: demosReferenceImageUrl(entry),
    demosReferencePageUrl: demosReferencePageUrl(entry),
    demosReferenceSource: entry.demosReferenceSource ?? null,
    rawCsv: entry.rawCsv ?? null
  };
}

export function demosReferenceImageUrl(entry: MaterialProofEntry): string | null {
  return isHttpUrl(entry.demosReferenceImageUrl) ? entry.demosReferenceImageUrl : null;
}

export function demosReferencePageUrl(entry: MaterialProofEntry): string | null {
  const candidates = [entry.demosReferencePageUrl, entry.demosUrl, entry.vendorUrl, entry.productUrl, entry.sourceReference];
  const url = candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
  return url ?? null;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function summarizeMaterials(entries: MaterialProofEntry[]) {
  return {
    total: entries.length,
    productionSafe: entries.filter((entry) => entry.productionSafe).length,
    mapped: entries.filter((entry) => entry.mappingStatus === "mapped").length,
    needsReview: entries.filter((entry) => entry.mappingStatus === "needs_review").length,
    locked: entries.filter((entry) => entry.mappingLocked).length,
    unlocked: entries.filter((entry) => !entry.mappingLocked).length
  };
}

export function uniqueValues(entries: MaterialProofEntry[], key: keyof MaterialProofEntry): string[] {
  return [...new Set(entries.map((entry) => entry[key]).filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

export function filterMaterials(entries: MaterialProofEntry[], filters: MaterialProofFilters): MaterialProofEntry[] {
  const query = filters.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (query) {
      const haystack = [
        entry.displayName,
        entry.vendorDecorId,
        entry.decorFamily,
        entry.targetInternalMaterialId
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.materialType && entry.materialType !== filters.materialType) return false;
    if (filters.surfaceProfile && entry.surfaceProfile !== filters.surfaceProfile) return false;
    if (filters.mappingStatus && entry.mappingStatus !== filters.mappingStatus) return false;
    if (filters.productionSafe === "true" && entry.productionSafe !== true) return false;
    if (filters.productionSafe === "false" && entry.productionSafe === true) return false;
    return true;
  });
}
