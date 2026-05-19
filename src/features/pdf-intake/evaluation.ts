import {
  PAGE_TYPES,
  type ConfusionMatrix,
  type EvaluationErrorSummary,
  type EvaluationReport,
  type EvaluationStatus,
  type GroundTruthPayload,
  type PageReviewItem,
  type PageType
} from "./types";

interface EvaluationInput {
  fileName: string;
  pages: PageReviewItem[];
}

export interface PageTypeImportResult {
  applied: number;
  skipped: number;
}

export function getEvaluationStatus(page: PageReviewItem): EvaluationStatus {
  if (!page.expectedType) return "unknown";
  return page.predictedType === page.expectedType ? "correct" : "wrong";
}

export function createEvaluationReport(input: EvaluationInput): EvaluationReport {
  const confusionMatrix = createEmptyConfusionMatrix();
  const mistakes: EvaluationReport["mistakes"] = [];
  const errorCounts = new Map<string, EvaluationErrorSummary>();
  let evaluatedPages = 0;
  let correctCount = 0;

  for (const page of input.pages) {
    if (!page.expectedType) continue;

    evaluatedPages += 1;
    confusionMatrix[page.expectedType][page.predictedType] += 1;

    if (page.predictedType === page.expectedType) {
      correctCount += 1;
      continue;
    }

    mistakes.push({
      pageNumber: page.pageNumber,
      expectedType: page.expectedType,
      predictedType: page.predictedType,
      finalType: page.finalType,
      reasons: page.reasons
    });

    const key = `${page.expectedType}->${page.predictedType}`;
    const current = errorCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      errorCounts.set(key, {
        expectedType: page.expectedType,
        predictedType: page.predictedType,
        count: 1
      });
    }
  }

  const wrongCount = evaluatedPages - correctCount;

  return {
    fileName: input.fileName,
    totalPages: input.pages.length,
    evaluatedPages,
    accuracy: evaluatedPages > 0 ? roundMetric(correctCount / evaluatedPages) : 0,
    confusionMatrix,
    mistakes,
    correctCount,
    wrongCount,
    frequentErrors: Array.from(errorCounts.values()).sort(
      (left, right) => right.count - left.count || left.expectedType.localeCompare(right.expectedType)
    )
  };
}

export function createGroundTruthExport(input: EvaluationInput): GroundTruthPayload {
  return {
    fileName: input.fileName,
    pages: input.pages.map((page) => ({
      pageNumber: page.pageNumber,
      expectedType: page.finalType
    }))
  };
}

export function parseGroundTruthJson(value: string): GroundTruthPayload {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Ground truth JSON must be an object.");
  }

  const candidate = parsed as { fileName?: unknown; pages?: unknown };

  if (typeof candidate.fileName !== "string") {
    throw new Error("Ground truth JSON must include fileName.");
  }

  if (!Array.isArray(candidate.pages)) {
    throw new Error("Ground truth JSON must include pages array.");
  }

  return {
    fileName: candidate.fileName,
    pages: candidate.pages.map((page) => parseGroundTruthPage(page))
  };
}

export function applyGroundTruth(pages: PageReviewItem[], groundTruth: GroundTruthPayload): void {
  const byPageNumber = new Map(groundTruth.pages.map((page) => [page.pageNumber, page.expectedType]));

  for (const page of pages) {
    page.expectedType = byPageNumber.get(page.pageNumber);
  }
}

export function applyImportedPageTypes(pages: PageReviewItem[], jsonText: string): PageTypeImportResult {
  const imported = parsePageTypeImportJson(jsonText);
  const byPageNumber = new Map(imported.pages.map((page) => [page.pageNumber, page.finalType]));
  let applied = 0;

  for (const page of pages) {
    const finalType = byPageNumber.get(page.pageNumber);
    if (!finalType) continue;

    page.finalType = finalType;
    page.wasManuallyEdited = true;
    applied += 1;
  }

  return {
    applied,
    skipped: imported.pages.length - applied
  };
}

function parsePageTypeImportJson(value: string): { fileName: string; pages: Array<{ pageNumber: number; finalType: PageType }> } {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Imported page review JSON must be an object.");
  }

  const candidate = parsed as { fileName?: unknown; pages?: unknown };

  if (typeof candidate.fileName !== "string") {
    throw new Error("Imported page review JSON must include fileName.");
  }

  if (!Array.isArray(candidate.pages)) {
    throw new Error("Imported page review JSON must include pages array.");
  }

  return {
    fileName: candidate.fileName,
    pages: candidate.pages.map(parseImportedPageType)
  };
}

export function createEvaluationExportPayload(report: EvaluationReport): Omit<EvaluationReport, "correctCount" | "wrongCount" | "frequentErrors"> {
  return {
    fileName: report.fileName,
    totalPages: report.totalPages,
    evaluatedPages: report.evaluatedPages,
    accuracy: report.accuracy,
    confusionMatrix: report.confusionMatrix,
    mistakes: report.mistakes
  };
}

function createEmptyConfusionMatrix(): ConfusionMatrix {
  return Object.fromEntries(PAGE_TYPES.map((type) => [type, createEmptyMatrixRow()])) as ConfusionMatrix;
}

function createEmptyMatrixRow(): Record<PageType, number> {
  return Object.fromEntries(PAGE_TYPES.map((type) => [type, 0])) as Record<PageType, number>;
}

function parseGroundTruthPage(page: unknown): GroundTruthPayload["pages"][number] {
  if (!page || typeof page !== "object") {
    throw new Error("Each ground truth page must be an object.");
  }

  const candidate = page as { pageNumber?: unknown; expectedType?: unknown };

  if (typeof candidate.pageNumber !== "number" || !Number.isInteger(candidate.pageNumber)) {
    throw new Error("Each ground truth page must include integer pageNumber.");
  }

  if (!isPageType(candidate.expectedType)) {
    throw new Error(`Invalid expectedType for page ${candidate.pageNumber}.`);
  }

  return {
    pageNumber: candidate.pageNumber,
    expectedType: candidate.expectedType
  };
}

function parseImportedPageType(page: unknown): { pageNumber: number; finalType: PageType } {
  if (!page || typeof page !== "object") {
    throw new Error("Each imported page must be an object.");
  }

  const candidate = page as { pageNumber?: unknown; expectedType?: unknown; finalType?: unknown };
  const pageType = candidate.expectedType ?? candidate.finalType;

  if (typeof candidate.pageNumber !== "number" || !Number.isInteger(candidate.pageNumber)) {
    throw new Error("Each imported page must include integer pageNumber.");
  }

  if (!isPageType(pageType)) {
    throw new Error(`Imported page ${candidate.pageNumber} must include expectedType or finalType.`);
  }

  return {
    pageNumber: candidate.pageNumber,
    finalType: pageType
  };
}

function isPageType(value: unknown): value is PageType {
  return typeof value === "string" && PAGE_TYPES.includes(value as PageType);
}

function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}
