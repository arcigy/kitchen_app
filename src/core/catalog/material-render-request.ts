import type { MaterialDefinition } from "./catalog-types";

type MaterialRenderRequest = {
  materialId: string;
  vendor?: string;
  vendorDecorId?: string;
  sourceCatalogMaterialId: string;
  displayName: string;
  targetInternalMaterialId: string;
  proceduralTemplate: string;
  grainPatternId: string;
  surfaceProfile: string;
  colorTransform: {
    mode: "tint_multiply" | "solid_color";
    baseColorHex: string;
    grainColorHex: string;
    tintStrength: number;
    grainContrast: number;
    hueShiftDegrees: number;
    saturationScale: number;
    valueScale: number;
    contrastScale: number;
  };
  roughnessMultiplier: number;
  roughnessOverride: number | null;
  bumpMultiplier: number;
  grainDepth: number;
  coatMultiplier: number;
  tileSizeMeters: number;
  uvScale: number;
  grainDirection: "vertical" | "horizontal" | "lengthwise" | "none";
  textureStrength: number;
  reflectivity: number;
  demosReferenceImageUrl?: string;
  demosReferencePageUrl?: string;
  usesExternalVendorTexture: false;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value: string | undefined, fallback: string): string {
  return value && HEX_RE.test(value) ? value : fallback;
}

function darken(hex: string, amount = 0.42): string {
  const safe = normalizeHex(hex, "#b98a55").slice(1);
  const r = Math.max(0, Math.round(parseInt(safe.slice(0, 2), 16) * amount));
  const g = Math.max(0, Math.round(parseInt(safe.slice(2, 4), 16) * amount));
  const b = Math.max(0, Math.round(parseInt(safe.slice(4, 6), 16) * amount));
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function tokens(material: MaterialDefinition): string {
  const tags = Array.isArray(material.tags) ? material.tags.join(" ") : "";
  return `${material.id} ${material.displayName} ${material.name} ${material.decor} ${material.color} ${material.finish} ${material.category} ${tags}`.toLowerCase();
}

function internalMaterialIdFor(material: MaterialDefinition): string {
  const t = tokens(material);
  if (material.boardFamily === "worktop" && /concrete|bet[oó]n|stone|marble|mramor|compact/.test(t)) return "stone_concrete_smooth";
  if (/amaretto|hudson/.test(t)) return "wood_amaretto_hudson_oak";
  if (/walnut|orech|espresso|dark|tmav|black|cier|čier/.test(t)) return "wood_dark_espresso";
  if (/beech|buk|birch|breza|ash|jase[nň]|maple|javor|light|svetl/.test(t)) return "wood_light_plain";
  if (/cherry|ceres|čereš|warm|teak|mahogany/.test(t)) return "wood_warm_clean";
  if (/oak|dub|sonoma|artisan|halifax|wotan|wood|drevo|veneer/.test(t)) return "wood_oak_natural";
  if (/white|biel|cream|kr[eé]m|lacquer|lak|uni|solid|grey|gray|siv|green|blue|red|yellow/.test(t)) return "lacquer_base_white";
  return "wood_oak_natural";
}

function proceduralTemplateFor(material: MaterialDefinition, internalMaterialId: string): string {
  const t = tokens(material);
  if (internalMaterialId === "lacquer_base_white") return "solid_color_neutral";
  if (/walnut|orech|espresso/.test(t)) return "wood_walnut_neutral";
  if (/rustic|rustik|halifax|deep|synchron/.test(t)) return "wood_deep_grain_neutral";
  if (/beech|buk|birch|breza|ash|jase[nň]|maple|javor|fine|light|svetl/.test(t)) return "wood_fine_grain_neutral";
  return "wood_oak_neutral";
}

function grainPatternFor(material: MaterialDefinition, internalMaterialId: string): string {
  const t = tokens(material);
  if (internalMaterialId === "lacquer_base_white") return "solid_no_grain";
  if (/walnut|orech|espresso/.test(t)) return "walnut_soft_grain";
  if (/rustic|rustik|halifax|deep|synchron/.test(t)) return "oak_deep_grain";
  if (/beech|buk|birch|breza|ash|jase[nň]|maple|javor|fine|light|svetl/.test(t)) return "fine_light_grain";
  return "oak_medium_grain";
}

function surfaceProfileFor(material: MaterialDefinition): string {
  const t = tokens(material);
  if (/supermat|super matte|soft touch|velvet/.test(t)) return "wood_soft_touch_supermat";
  if (/high gloss|gloss|lesk/.test(t)) return "wood_gloss_laminate";
  if (/satin|sat[eé]n|lacquer|lak/.test(t)) return "wood_satin_lacquer";
  if (/raw|rustic|rustik|pr[ií]rod/.test(t)) return "wood_raw_matte";
  return internalMaterialIdFor(material) === "lacquer_base_white" || material.boardFamily === "worktop" ? "generic_matte" : "wood_standard_matte";
}

export function createMaterialRequestFromCatalogMaterial(material: MaterialDefinition): MaterialRenderRequest {
  const baseColorHex = normalizeHex(material.preview.colorHex, "#b98a55");
  const materialId = internalMaterialIdFor(material);
  const surfaceProfile = surfaceProfileFor(material);
  const source = material.supplierSource;
  const solid = materialId === "lacquer_base_white";
  return {
    materialId,
    ...(source?.supplier ? { vendor: source.supplier === "demos-sk" ? "demos" : source.supplier } : {}),
    ...(source?.supplierProductId ? { vendorDecorId: source.supplierProductId } : {}),
    sourceCatalogMaterialId: material.id,
    displayName: material.displayName,
    targetInternalMaterialId: materialId,
    proceduralTemplate: proceduralTemplateFor(material, materialId),
    grainPatternId: grainPatternFor(material, materialId),
    surfaceProfile,
    colorTransform: {
      mode: solid ? "solid_color" : "tint_multiply",
      baseColorHex,
      grainColorHex: solid ? baseColorHex : darken(baseColorHex),
      tintStrength: solid ? 1 : 0.92,
      grainContrast: solid ? 0 : 0.36,
      hueShiftDegrees: 0,
      saturationScale: 1,
      valueScale: 1,
      contrastScale: 1
    },
    roughnessMultiplier: 1,
    roughnessOverride: null,
    bumpMultiplier: solid ? 0.25 : 1,
    grainDepth: solid ? 0 : 0.24,
    coatMultiplier: surfaceProfile.includes("gloss") ? 1.2 : surfaceProfile.includes("satin") ? 1 : 0.75,
    tileSizeMeters: 0.4,
    uvScale: 2.5,
    grainDirection: material.grainDirectionRelevant ? "vertical" : "none",
    textureStrength: 0.5,
    reflectivity: surfaceProfile.includes("gloss") ? 0.65 : surfaceProfile.includes("satin") ? 0.45 : 0.32,
    ...(source?.imageUrl ? { demosReferenceImageUrl: source.imageUrl } : {}),
    ...(source?.url ? { demosReferencePageUrl: source.url } : {}),
    usesExternalVendorTexture: false
  };
}
