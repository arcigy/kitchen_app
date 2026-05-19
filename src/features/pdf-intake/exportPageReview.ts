import type { PageReviewItem, PageType } from "./types";
import { PAGE_TYPES } from "./types";
import { createEvaluationExportPayload, createEvaluationReport, createGroundTruthExport } from "./evaluation";

interface ExportPageReviewInput {
  fileName: string;
  pages: PageReviewItem[];
}

interface ExportPageReviewPayload {
  fileName: string;
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    predictedType: PageType;
    finalType: PageType;
    confidence: number;
    reasons: string[];
    wasManuallyEdited: boolean;
  }>;
  summary: Record<PageType, number>;
}

export function createPageReviewExport(input: ExportPageReviewInput): ExportPageReviewPayload {
  const summary = Object.fromEntries(PAGE_TYPES.map((type) => [type, 0])) as Record<PageType, number>;

  for (const page of input.pages) {
    summary[page.finalType] += 1;
  }

  return {
    fileName: input.fileName,
    totalPages: input.pages.length,
    pages: input.pages.map((page) => ({
      pageNumber: page.pageNumber,
      predictedType: page.predictedType,
      finalType: page.finalType,
      confidence: page.confidence,
      reasons: page.reasons,
      wasManuallyEdited: page.wasManuallyEdited
    })),
    summary
  };
}

export function downloadPageReviewJson(input: ExportPageReviewInput): void {
  const payload = createPageReviewExport(input);
  downloadJson(`${input.fileName.replace(/\.pdf$/i, "") || "pdf"}-page-review.json`, payload);
}

export function downloadGroundTruthJson(input: ExportPageReviewInput): void {
  const payload = createGroundTruthExport(input);
  downloadJson(`${input.fileName.replace(/\.pdf$/i, "") || "pdf"}-ground-truth.json`, payload);
}

export function downloadEvaluationReportJson(input: ExportPageReviewInput): void {
  const report = createEvaluationReport(input);
  const payload = createEvaluationExportPayload(report);
  downloadJson(`${input.fileName.replace(/\.pdf$/i, "") || "pdf"}-evaluation-report.json`, payload);
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}
