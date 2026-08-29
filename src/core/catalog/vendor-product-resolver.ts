import type { ClientCatalog, VendorProductVariant } from "./catalog-types";

export type VendorProductResolutionStatus = "resolved" | "ambiguous" | "missing" | "needs_review";

export type VendorProductResolutionRequest = {
  moduleType?: string;
  articleFamily?: string;
  widthMm?: number;
  widthCm?: number;
  variantCode?: string | null;
  productTemplateName?: string;
  catalogKey?: string;
  minConfidence?: number;
};

export type VendorProductResolutionCandidate = {
  catalogKey: string;
  articleFamily: string;
  widthCm: number | null;
  variantCode: string | null;
  productTemplateName: string;
  sourcePage: number;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
};

export type VendorProductResolution = {
  status: VendorProductResolutionStatus;
  catalogKey: string | null;
  candidates: VendorProductResolutionCandidate[];
  reasons: string[];
};

const DEFAULT_MIN_CONFIDENCE = 0.85;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLooseText(value: string | null | undefined): string {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bmodul\b/g, "")
    .replace(/\bspodni\b/g, "")
    .replace(/\bskrinka\b/g, "")
    .replace(/\bskrinky\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariant(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function requestWidthCm(request: VendorProductResolutionRequest): number | null {
  if (typeof request.widthCm === "number" && Number.isFinite(request.widthCm)) return Math.round(request.widthCm);
  if (typeof request.widthMm === "number" && Number.isFinite(request.widthMm)) return Math.round(request.widthMm / 10);
  return null;
}

function toCandidate(variant: VendorProductVariant): VendorProductResolutionCandidate {
  return {
    catalogKey: variant.catalogKey,
    articleFamily: variant.articleFamily,
    widthCm: variant.widthCm,
    variantCode: variant.variantCode,
    productTemplateName: variant.productTemplateName,
    sourcePage: variant.sourcePage,
    confidence: variant.confidence,
    needsReview: variant.needsReview,
    reviewReasons: variant.reviewReasons ?? []
  };
}

function semanticSignature(variant: VendorProductVariant): string {
  const notes = (variant.notes ?? []).map((entry) => normalizeLooseText(entry)).filter(Boolean).join("|");
  const rules = (variant.rulesRaw ?? []).map((entry) => normalizeLooseText(entry)).filter(Boolean).join("|");
  const template = normalizeLooseText(variant.productTemplateName);
  return [
    variant.catalogKey.trim().toUpperCase(),
    variant.articleFamily.trim().toUpperCase(),
    variant.widthCm ?? "",
    normalizeVariant(variant.variantCode) ?? "",
    notes || template,
    rules
  ].join("|");
}

function uniqueByComposite(variants: VendorProductVariant[]): VendorProductVariant[] {
  const seen = new Set<string>();
  const out: VendorProductVariant[] = [];
  for (const variant of variants) {
    const key = [
      variant.catalogKey,
      variant.articleFamily,
      variant.widthCm ?? "",
      variant.variantCode ?? "",
      variant.productTemplateName,
      variant.sourcePage,
      JSON.stringify(variant.bbox ?? null)
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(variant);
  }
  return out;
}

function collapseSemanticDuplicates(variants: VendorProductVariant[]): VendorProductVariant[] {
  const buckets = new Map<string, VendorProductVariant[]>();
  for (const variant of variants) {
    const key = semanticSignature(variant);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(variant);
    else buckets.set(key, [variant]);
  }
  const collapsed: VendorProductVariant[] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => {
      const leftReviewRank = left.needsReview || left.confidence < DEFAULT_MIN_CONFIDENCE ? 1 : 0;
      const rightReviewRank = right.needsReview || right.confidence < DEFAULT_MIN_CONFIDENCE ? 1 : 0;
      if (leftReviewRank !== rightReviewRank) return leftReviewRank - rightReviewRank;
      if (left.confidence !== right.confidence) return right.confidence - left.confidence;
      return left.sourcePage - right.sourcePage;
    });
    collapsed.push(bucket[0]!);
  }
  return collapsed;
}

export function resolveVendorProductVariant(
  catalog: Pick<ClientCatalog, "vendorCatalog">,
  request: VendorProductResolutionRequest
): VendorProductResolution {
  const vendorCatalog = catalog.vendorCatalog;
  if (!vendorCatalog) {
    return { status: "missing", catalogKey: null, candidates: [], reasons: ["catalog_has_no_vendor_index"] };
  }

  const minConfidence = request.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const widthCm = requestWidthCm(request);
  const requestedVariantCode = normalizeVariant(request.variantCode);
  const requestedTemplate = normalizeText(request.productTemplateName);
  const requestedFamily = normalizeText(request.articleFamily).toUpperCase();
  const requestedCatalogKey = normalizeText(request.catalogKey).toUpperCase();

  let matches = vendorCatalog.productVariants;
  const reasons: string[] = [];

  if (requestedCatalogKey) {
    matches = matches.filter((variant) => variant.catalogKey.toUpperCase() === requestedCatalogKey);
  }
  if (requestedFamily) {
    matches = matches.filter((variant) => variant.articleFamily.toUpperCase() === requestedFamily);
  }
  if (widthCm != null) {
    matches = matches.filter((variant) => variant.widthCm === widthCm);
  }
  if (request.variantCode !== undefined) {
    matches = matches.filter((variant) => normalizeVariant(variant.variantCode) === requestedVariantCode);
  }
  if (requestedTemplate) {
    matches = matches.filter((variant) => normalizeText(variant.productTemplateName) === requestedTemplate);
  }

  matches = collapseSemanticDuplicates(uniqueByComposite(matches));
  const candidates = matches.map(toCandidate);

  if (matches.length === 0) {
    return {
      status: "missing",
      catalogKey: null,
      candidates,
      reasons: ["no_vendor_variant_match"]
    };
  }

  const reviewMatches = matches.filter((variant) => variant.needsReview || variant.confidence < minConfidence);
  if (reviewMatches.length > 0) {
    reasons.push("candidate_needs_review_or_low_confidence");
  }

  const confidentMatches = matches.filter((variant) => !variant.needsReview && variant.confidence >= minConfidence);
  if (confidentMatches.length === 1 && matches.length > 1) {
    const preferred = confidentMatches[0]!;
    return {
      status: "resolved",
      catalogKey: preferred.catalogKey,
      candidates: [toCandidate(preferred)],
      reasons: ["preferred_single_high_confidence_candidate_over_review_duplicates"]
    };
  }

  const distinctCatalogKeys = new Set(matches.map((variant) => variant.catalogKey));
  if (matches.length > 1 || distinctCatalogKeys.size > 1) {
    return {
      status: reviewMatches.length > 0 ? "needs_review" : "ambiguous",
      catalogKey: null,
      candidates,
      reasons: reviewMatches.length > 0 ? reasons : ["multiple_vendor_variant_matches"]
    };
  }

  const only = matches[0]!;
  if (reviewMatches.length > 0) {
    return {
      status: "needs_review",
      catalogKey: only.catalogKey,
      candidates,
      reasons
    };
  }

  return {
    status: "resolved",
    catalogKey: only.catalogKey,
    candidates,
    reasons: []
  };
}
