import type { ClientCatalog, VendorProductVariant } from "../core/catalog/catalog-types";
import { buildPinoVendorKitchenCatalog, type PinoVendorKitchenCatalogEntry } from "../layout/pinoVendorKitchenCatalog";
import type { AssistantRagChunk } from "./types";
import {
  getPinoSideCabinetApplianceModuleTypeForCategory,
  getPinoSideCabinetDefinition,
  getPinoSideCabinetProductGroup,
  type PinoSideCabinetDefinition,
  type PinoSideCabinetInteriorComponent
} from "../modules/pinoSideCabinet/types";

export type PinoModuleQueryFeatures = {
  widthMm: number | null;
  wantsTall: boolean;
  wantsLow: boolean;
  wantsAccessory: boolean;
  applianceCategory: string | null;
  drawerCount: number | null;
  pulloutCount: number | null;
  flapDoorCount: number | null;
  swingDoorCount: number | null;
  shelfCount: number | null;
  adjustableShelfCount: number | null;
  fixedShelfCount: number | null;
  openNicheCount: number | null;
  normalizedText: string;
  normalizedTokens: string[];
};

export type PinoResolvedModuleCandidate = {
  entry: PinoVendorKitchenCatalogEntry;
  score: number;
  reasons: string[];
  searchText: string;
  normalizedSearchText: string;
};

export type PinoResolvedModuleDescription = {
  status: "resolved" | "ambiguous" | "missing" | "needs_review";
  candidates: PinoResolvedModuleCandidate[];
  query: PinoModuleQueryFeatures;
  reasons: string[];
};

type PinoModuleCatalogDoc = {
  entry: PinoVendorKitchenCatalogEntry;
  searchText: string;
  normalizedSearchText: string;
  tags: string[];
  counts: {
    drawerCount: number;
    pulloutCount: number;
    flapDoorCount: number;
    swingDoorCount: number;
    shelfCount: number;
    adjustableShelfCount: number;
    fixedShelfCount: number;
    openNicheCount: number;
  };
  applianceCategories: string[];
};

const STOP_TOKENS = new Set([
  "a",
  "aj",
  "alebo",
  "atd",
  "do",
  "dole",
  "hore",
  "ho",
  "ju",
  "je",
  "ktory",
  "ktora",
  "ktore",
  "ma",
  "maju",
  "mi",
  "modul",
  "nejake",
  "nejaky",
  "nad",
  "nadtym",
  "na",
  "potom",
  "pre",
  "s",
  "sa",
  "skrinka",
  "skrinky",
  "tam",
  "ten",
  "to",
  "u",
  "v",
  "vloz",
  "vlozit",
  "vysoky",
  "vysoka",
  "vysoke",
  "z",
  "ze"
]);

const NUMBER_WORDS: Array<[RegExp, string]> = [
  [/\bjeden\b/gu, "1"],
  [/\bjedna\b/gu, "1"],
  [/\bjedno\b/gu, "1"],
  [/\bdva\b/gu, "2"],
  [/\bdve\b/gu, "2"],
  [/\btri\b/gu, "3"],
  [/\bstyri\b/gu, "4"],
  [/\bstyri\b/gu, "4"],
  [/\bpat\b/gu, "5"],
  [/\bsest\b/gu, "6"]
];

export function normalizePinoSearchText(value: string | null | undefined): string {
  let normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [pattern, replacement] of NUMBER_WORDS) normalized = normalized.replace(pattern, replacement);
  return normalized
    .replace(/\bzasuv\w*\b/gu, " drawer ")
    .replace(/\bsuflik\w*\b/gu, " drawer ")
    .replace(/\bsuplik\w*\b/gu, " drawer ")
    .replace(/\bvysuv\w*\b/gu, " pullout ")
    .replace(/\bpolic\w*\b/gu, " shelf ")
    .replace(/\bpevn\w*\b/gu, " fixed ")
    .replace(/\bprestaviteln\w*\b/gu, " adjustable ")
    .replace(/\bsklapec\w*\b/gu, " flap ")
    .replace(/\bvyklop\b/gu, " flap ")
    .replace(/\botocn\w*\b/gu, " swing ")
    .replace(/\bdvier\w*\b/gu, " door ")
    .replace(/\bdvir\w*\b/gu, " door ")
    .replace(/\bmikrovln\w*\b/gu, " microwave ")
    .replace(/\btrouba\b/gu, " oven ")
    .replace(/\brur\w*\b/gu, " oven ")
    .replace(/\bchladnick\w*\b/gu, " fridge ")
    .replace(/\bumyvack\w*\b/gu, " dishwasher ")
    .replace(/\bvysok\w*\b/gu, " tall ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function extractNumberBefore(text: string, tokenPattern: string): number | null {
  const match = new RegExp(`(\\d+)\\s+${tokenPattern}`, "u").exec(text);
  return match ? Number(match[1]) : null;
}

function countMatches(text: string, tokenPattern: string): number {
  const matches = text.match(new RegExp(tokenPattern, "gu"));
  return matches?.length ?? 0;
}

export function extractPinoModuleQueryFeatures(message: string): PinoModuleQueryFeatures {
  const normalizedText = normalizePinoSearchText(message);
  const normalizedTokens = tokenize(normalizedText);
  const widthMatch = /\b(30|40|45|50|60|80|90|100|105|110|115|120|125|135)\s*cm\b/u.exec(normalizedText)
    ?? /\b(300|400|450|500|600|800|900|1000|1050|1100|1150|1200|1250|1350)\s*mm\b/u.exec(normalizedText)
    ?? /\bsirka\s*(\d{2,4})\b/u.exec(normalizedText)
    ?? /\bsirka\s*(\d{2,4})\s*cm\b/u.exec(normalizedText);
  const rawWidth = widthMatch ? Number(widthMatch[1]) : NaN;
  const widthMm = Number.isFinite(rawWidth)
    ? rawWidth >= 200
      ? rawWidth
      : rawWidth * 10
    : null;
  const applianceCategory =
    /\bmicrowave\b/u.test(normalizedText) ? "microwave_tall"
      : /\boven\b/u.test(normalizedText) ? "oven_tall"
        : /\bfridge\b/u.test(normalizedText) ? "fridge_tall"
          : /\bdishwasher\b/u.test(normalizedText) ? "dishwasher_tall"
            : null;
  return {
    widthMm,
    wantsTall: /\btall\b/u.test(normalizedText) || /\bvysoka?\b/u.test(normalizedText),
    wantsLow: /\bspodn/i.test(normalizedText) || /\blow\b/u.test(normalizedText),
    wantsAccessory: /\blista\b/u.test(normalizedText) || /\bdopln/i.test(normalizedText),
    applianceCategory,
    drawerCount: extractNumberBefore(normalizedText, "drawer"),
    pulloutCount: extractNumberBefore(normalizedText, "pullout"),
    flapDoorCount: extractNumberBefore(normalizedText, "flap"),
    swingDoorCount: extractNumberBefore(normalizedText, "(?:swing|door)"),
    shelfCount: extractNumberBefore(normalizedText, "shelf"),
    adjustableShelfCount: extractNumberBefore(normalizedText, "adjustable\\s+shelf"),
    fixedShelfCount: extractNumberBefore(normalizedText, "fixed\\s+shelf"),
    openNicheCount: countMatches(normalizedText, "\\bmicrowave\\b|\\boven\\b") > 0 ? 1 : extractNumberBefore(normalizedText, "niche"),
    normalizedText,
    normalizedTokens
  };
}

function extractVariantCounts(variant: VendorProductVariant) {
  const text = normalizePinoSearchText([
    variant.productTemplateName,
    ...(variant.notes ?? []),
    ...(variant.rulesRaw ?? [])
  ].join(" "));
  const adjustableShelfCount = extractNumberBefore(text, "adjustable\\s+shelf") ?? 0;
  const fixedShelfCount = extractNumberBefore(text, "fixed\\s+shelf") ?? 0;
  const shelfCount = Math.max(
    adjustableShelfCount + fixedShelfCount,
    extractNumberBefore(text, "shelf") ?? 0
  );
  return {
    drawerCount: extractNumberBefore(text, "drawer") ?? 0,
    pulloutCount: extractNumberBefore(text, "pullout") ?? 0,
    flapDoorCount: extractNumberBefore(text, "flap") ?? 0,
    swingDoorCount: extractNumberBefore(text, "(?:swing|door)") ?? 0,
    shelfCount,
    adjustableShelfCount,
    fixedShelfCount,
    openNicheCount: countMatches(text, "\\bmicrowave\\b|\\boven\\b|\\bniche\\b")
  };
}

function addInteriorShelves(
  counts: PinoModuleCatalogDoc["counts"],
  definition: PinoSideCabinetDefinition
) {
  for (const item of definition.interiorComponents) {
    applyInteriorComponent(counts, item);
  }
}

function applyInteriorComponent(
  counts: PinoModuleCatalogDoc["counts"],
  item: PinoSideCabinetInteriorComponent
) {
  if (item.componentId === "adjustable_shelf") counts.adjustableShelfCount += item.count;
  if (item.componentId === "fixed_shelf") counts.fixedShelfCount += item.count;
  if (item.componentId === "drawer") counts.drawerCount += item.count;
  if (item.componentId === "pullout") counts.pulloutCount += item.count;
}

function buildSideCabinetDoc(entry: PinoVendorKitchenCatalogEntry): PinoModuleCatalogDoc {
  const definition = getPinoSideCabinetDefinition(entry.productTemplateId);
  const productGroup = getPinoSideCabinetProductGroup(definition.productGroupId);
  const counts: PinoModuleCatalogDoc["counts"] = {
    drawerCount: 0,
    pulloutCount: 0,
    flapDoorCount: 0,
    swingDoorCount: 0,
    shelfCount: 0,
    adjustableShelfCount: 0,
    fixedShelfCount: 0,
    openNicheCount: 0
  };
  for (const segment of definition.frontStackTopDown) {
    if (segment.componentId === "drawer") counts.drawerCount += segment.count;
    if (segment.componentId === "pullout") counts.pulloutCount += segment.count;
    if (segment.componentId === "flap_door") counts.flapDoorCount += segment.count;
    if (segment.componentId === "swing_door") counts.swingDoorCount += segment.count;
    if (segment.componentId === "open_niche") counts.openNicheCount += segment.count;
  }
  addInteriorShelves(counts, definition);
  counts.shelfCount = counts.adjustableShelfCount + counts.fixedShelfCount;
  const applianceCategories = productGroup.compatibilityRules.acceptsApplianceCategories;
  const searchText = [
    entry.productTemplateName,
    productGroup.label,
    productGroup.description,
    `article family ${definition.articleFamily}`,
    definition.variantCode ? `variant ${definition.variantCode}` : "",
    definition.frontStackTopDown.map((segment) => segment.nameRaw).join("; "),
    definition.interiorComponents.map((item) => item.nameRaw).join("; "),
    definition.sourceNotes.join("; "),
    applianceCategories.join(" ")
  ].filter(Boolean).join(" | ");
  return {
    entry,
    searchText,
    normalizedSearchText: normalizePinoSearchText(searchText),
    tags: [
      "pino",
      "catalog",
      "side-cabinet",
      entry.role,
      definition.articleFamily,
      definition.variantCode ?? "base"
    ],
    counts,
    applianceCategories
  };
}

function buildGenericDoc(entry: PinoVendorKitchenCatalogEntry, catalog: Pick<ClientCatalog, "vendorCatalog">): PinoModuleCatalogDoc {
  const variants = catalog.vendorCatalog?.productVariants.filter((variant) => variant.productTemplateId === entry.productTemplateId) ?? [];
  const counts: PinoModuleCatalogDoc["counts"] = {
    drawerCount: 0,
    pulloutCount: 0,
    flapDoorCount: 0,
    swingDoorCount: 0,
    shelfCount: 0,
    adjustableShelfCount: 0,
    fixedShelfCount: 0,
    openNicheCount: 0
  };
  for (const variant of variants) {
    const next = extractVariantCounts(variant);
    counts.drawerCount = Math.max(counts.drawerCount, next.drawerCount);
    counts.pulloutCount = Math.max(counts.pulloutCount, next.pulloutCount);
    counts.flapDoorCount = Math.max(counts.flapDoorCount, next.flapDoorCount);
    counts.swingDoorCount = Math.max(counts.swingDoorCount, next.swingDoorCount);
    counts.shelfCount = Math.max(counts.shelfCount, next.shelfCount);
    counts.adjustableShelfCount = Math.max(counts.adjustableShelfCount, next.adjustableShelfCount);
    counts.fixedShelfCount = Math.max(counts.fixedShelfCount, next.fixedShelfCount);
    counts.openNicheCount = Math.max(counts.openNicheCount, next.openNicheCount);
  }
  const searchText = [
    entry.productTemplateName,
    entry.groupLabel,
    entry.featureTags.join(" "),
    variants.map((variant) => variant.notes?.join("; ") ?? "").join(" | "),
    variants.map((variant) => variant.rulesRaw?.join("; ") ?? "").join(" | ")
  ].filter(Boolean).join(" | ");
  return {
    entry,
    searchText,
    normalizedSearchText: normalizePinoSearchText(searchText),
    tags: [
      "pino",
      "catalog",
      entry.role,
      ...entry.articleFamilies
    ],
    counts,
    applianceCategories: /\bmicrowave\b|\boven\b/u.test(normalizePinoSearchText(searchText)) ? ["microwave_tall", "oven_tall"] : []
  };
}

function buildCatalogDocs(catalog: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">): PinoModuleCatalogDoc[] {
  return buildPinoVendorKitchenCatalog(catalog, "", { includeNeedsReview: true }).entries.map((entry) =>
    entry.moduleType === "pino_side_cabinet"
      ? buildSideCabinetDoc(entry)
      : buildGenericDoc(entry, catalog)
  );
}

function scoreCountFeature(
  reasons: string[],
  label: string,
  requested: number | null,
  actual: number
): number {
  if (requested == null) return 0;
  if (requested === actual) {
    reasons.push(`${label}_exact`);
    return 42;
  }
  if (requested > 0 && actual > 0) {
    reasons.push(`${label}_partial`);
    return Math.max(8, 26 - Math.abs(requested - actual) * 8);
  }
  reasons.push(`${label}_missing`);
  return -26;
}

function scoreCandidate(query: PinoModuleQueryFeatures, doc: PinoModuleCatalogDoc): PinoResolvedModuleCandidate {
  const reasons: string[] = [];
  let score = 0;
  const presentTokens = new Set(tokenize(doc.normalizedSearchText));
  for (const token of query.normalizedTokens) {
    if (presentTokens.has(token)) {
      score += Math.min(18, token.length * 2);
      reasons.push(`token:${token}`);
    }
  }
  if (query.widthMm != null) {
    if (doc.entry.availableWidthsMm.includes(query.widthMm)) {
      score += 34;
      reasons.push("width_exact");
    } else {
      score -= 18;
    }
  }
  if (query.wantsTall) {
    score += doc.entry.role === "tall" ? 26 : -36;
    if (doc.entry.role === "tall") reasons.push("role_tall");
  }
  if (query.wantsLow) {
    score += doc.entry.role === "low" ? 18 : -24;
    if (doc.entry.role === "low") reasons.push("role_low");
  }
  if (query.wantsAccessory) {
    score += doc.entry.role === "accessory" ? 18 : -20;
  }
  if (query.applianceCategory) {
    if (doc.applianceCategories.includes(query.applianceCategory)) {
      score += 62;
      reasons.push(`appliance:${query.applianceCategory}`);
    } else if (doc.counts.openNicheCount > 0) {
      score += 18;
      reasons.push("appliance_open_niche");
    } else {
      score -= 50;
    }
  }
  score += scoreCountFeature(reasons, "drawer", query.drawerCount, doc.counts.drawerCount);
  score += scoreCountFeature(reasons, "pullout", query.pulloutCount, doc.counts.pulloutCount);
  score += scoreCountFeature(reasons, "flap", query.flapDoorCount, doc.counts.flapDoorCount);
  score += scoreCountFeature(reasons, "swing", query.swingDoorCount, doc.counts.swingDoorCount);
  score += scoreCountFeature(reasons, "shelf", query.shelfCount, doc.counts.shelfCount);
  score += scoreCountFeature(reasons, "adjustable_shelf", query.adjustableShelfCount, doc.counts.adjustableShelfCount);
  score += scoreCountFeature(reasons, "fixed_shelf", query.fixedShelfCount, doc.counts.fixedShelfCount);
  score += scoreCountFeature(reasons, "niche", query.openNicheCount, doc.counts.openNicheCount);
  if (doc.entry.status === "needs_review" || doc.entry.templateNeedsReview) {
    score -= 12;
    reasons.push("review_penalty");
  }
  return {
    entry: doc.entry,
    score,
    reasons,
    searchText: doc.searchText,
    normalizedSearchText: doc.normalizedSearchText
  };
}

export function resolvePinoModuleDescription(
  catalog: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">,
  message: string,
  options?: { limit?: number }
): PinoResolvedModuleDescription {
  if (!catalog.vendorCatalog || catalog.vendorCatalog.vendorId !== "pino_nobilia") {
    return {
      status: "missing",
      candidates: [],
      query: extractPinoModuleQueryFeatures(message),
      reasons: ["catalog_is_not_pino_vendor"]
    };
  }
  const query = extractPinoModuleQueryFeatures(message);
  const docs = buildCatalogDocs(catalog);
  const candidates = docs
    .map((doc) => scoreCandidate(query, doc))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options?.limit ?? 5);
  if (candidates.length === 0) {
    return { status: "missing", candidates: [], query, reasons: ["no_catalog_candidate_scored_positive"] };
  }
  const top = candidates[0]!;
  const second = candidates[1] ?? null;
  const topNeedsReview = top.entry.status === "needs_review" || top.entry.templateNeedsReview;
  if (second && top.score >= 28 && top.score - second.score < 18) {
    return {
      status: topNeedsReview ? "needs_review" : "ambiguous",
      candidates,
      query,
      reasons: ["top_candidate_gap_too_small"]
    };
  }
  if (top.score < 56) {
    return {
      status: candidates.length > 1 ? (topNeedsReview ? "needs_review" : "ambiguous") : "missing",
      candidates,
      query,
      reasons: ["top_candidate_score_too_low"]
    };
  }
  return {
    status: topNeedsReview ? "needs_review" : "resolved",
    candidates,
    query,
    reasons: topNeedsReview ? ["top_candidate_needs_review"] : []
  };
}

function toRagChunk(doc: PinoModuleCatalogDoc, updatedAt: string): AssistantRagChunk {
  return {
    id: `pino_catalog_${doc.entry.productTemplateId}`,
    source: `tenant-catalog/${doc.entry.productTemplateId}.json`,
    title: `${doc.entry.productTemplateName} [${doc.entry.catalogKey}]`,
    text: doc.searchText,
    tags: doc.tags,
    updatedAt
  };
}

export function buildPinoCatalogAssistantRagChunks(
  catalog: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">
): AssistantRagChunk[] {
  if (!catalog.vendorCatalog || catalog.vendorCatalog.vendorId !== "pino_nobilia") return [];
  const updatedAt = new Date().toISOString();
  return buildCatalogDocs(catalog).map((doc) => toRagChunk(doc, updatedAt));
}

export function applyPinoResolvedQueryToParams(
  candidate: PinoResolvedModuleCandidate,
  query: PinoModuleQueryFeatures
) {
  const nextParams = structuredClone(candidate.entry.params) as Record<string, unknown>;
  if (query.widthMm != null && candidate.entry.availableWidthsMm.includes(query.widthMm)) {
    nextParams.width = query.widthMm;
    nextParams.widthMm = query.widthMm;
  }
  if (candidate.entry.moduleType === "pino_side_cabinet" && query.applianceCategory) {
    nextParams.applianceCategory = query.applianceCategory;
    nextParams.applianceModuleType = getPinoSideCabinetApplianceModuleTypeForCategory(query.applianceCategory);
    nextParams.applianceInstalled = true;
  }
  return nextParams;
}
