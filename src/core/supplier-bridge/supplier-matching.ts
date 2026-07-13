import type {
  SupplierMatchConflict,
  SupplierMatchEvidence,
  SupplierProductCandidate,
  SupplierSyncItem
} from "./supplier-bridge-types";

export type SupplierMatchResult = {
  evidence: SupplierMatchEvidence[];
  conflicts: SupplierMatchConflict[];
  score: number;
  exactSupplierProductCode: boolean;
  autoConfirmEligible: boolean;
};

function normalized(value: string | null | undefined): string | null {
  if (value == null) return null;
  const result = value.toLocaleLowerCase("sk-SK").replace(/[\s_-]+/g, " ").trim();
  return result || null;
}

function evidence(
  field: SupplierMatchEvidence["field"],
  expected: string | number | null,
  observed: string | number | null,
  matched: boolean,
  weight: number
): SupplierMatchEvidence {
  return {
    field,
    expected,
    observed,
    matched,
    score: matched ? weight : 0,
    explanation: expected == null
      ? "No expected value was available."
      : matched
        ? `${field} matches.`
        : `${field} does not match.`
  };
}

function exactTextMatch(expected: string | null, observed: string | null): boolean {
  const left = normalized(expected);
  const right = normalized(observed);
  return left != null && right != null && left === right;
}

export function evaluateSupplierCandidateMatch(args: {
  item: SupplierSyncItem;
  candidate: Pick<SupplierProductCandidate, "supplierProductCode" | "normalizedProduct">;
  expectedSupplierProductCode?: string | null;
}): SupplierMatchResult {
  const { item, candidate } = args;
  const product = candidate.normalizedProduct;
  const manufacturerMatch = exactTextMatch(item.expectedManufacturer, product.manufacturer);
  const decorMatch = exactTextMatch(item.expectedDecorCode, product.decorCode);
  const surfaceMatch = exactTextMatch(item.expectedSurfaceCode, product.surfaceCode);
  const productTypeMatch = exactTextMatch(item.expectedProductType, product.productType);
  const thicknessMatch = item.expectedThicknessMm != null && product.thicknessMm != null
    ? Math.abs(item.expectedThicknessMm - product.thicknessMm) <= 0.5
    : false;
  const exactSupplierProductCode = exactTextMatch(args.expectedSupplierProductCode ?? null, candidate.supplierProductCode);
  const evidenceRows: SupplierMatchEvidence[] = [
    evidence("manufacturer", item.expectedManufacturer, product.manufacturer, manufacturerMatch, 15),
    evidence("decorCode", item.expectedDecorCode, product.decorCode, decorMatch, 25),
    evidence("surfaceCode", item.expectedSurfaceCode, product.surfaceCode, surfaceMatch, 15),
    evidence("productType", item.expectedProductType, product.productType, productTypeMatch, 20),
    evidence("thickness", item.expectedThicknessMm, product.thicknessMm, thicknessMatch, 20),
    evidence("supplierProductCode", args.expectedSupplierProductCode ?? null, candidate.supplierProductCode, exactSupplierProductCode, 100)
  ];
  const conflicts: SupplierMatchConflict[] = [];

  if (item.expectedProductType != null && product.productType != null && !productTypeMatch) {
    conflicts.push({
      code: "PRODUCT_TYPE_MISMATCH",
      field: "productType",
      expected: item.expectedProductType,
      observed: product.productType,
      hard: true,
      explanation: "Product type mismatch is a hard conflict."
    });
  }
  if (item.expectedThicknessMm != null && product.thicknessMm != null && !thicknessMatch) {
    conflicts.push({
      code: "THICKNESS_MISMATCH",
      field: "thickness",
      expected: item.expectedThicknessMm,
      observed: product.thicknessMm,
      hard: true,
      explanation: "Thickness mismatch is a hard conflict."
    });
  }

  const nonCodeScore = evidenceRows
    .filter((row) => row.field !== "supplierProductCode")
    .reduce((sum, row) => sum + row.score, 0);
  const score = exactSupplierProductCode ? 100 : nonCodeScore;
  return {
    evidence: evidenceRows,
    conflicts,
    score,
    exactSupplierProductCode,
    autoConfirmEligible: conflicts.length === 0 && (exactSupplierProductCode || score >= 85)
  };
}
