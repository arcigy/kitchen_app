import * as pdfjsLib from "pdfjs-dist";
import type { PdfExtractionResult, PdfPageExtraction } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

interface PdfTextItem {
  str: string;
  transform?: number[];
}

export async function extractPdfPages(file: File): Promise<PdfExtractionResult> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: PdfPageExtraction[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const extractedText = buildPageText(readTextItems(content.items as unknown[]));
    const viewport = page.getViewport({ scale: 1 });
    const thumbnailScale = Math.min(420 / viewport.width, 1.2);
    const thumbnailViewport = page.getViewport({ scale: thumbnailScale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is not available.");
    }

    canvas.width = Math.ceil(thumbnailViewport.width);
    canvas.height = Math.ceil(thumbnailViewport.height);

    await page.render({
      canvasContext: context,
      viewport: thumbnailViewport
    }).promise;

    pages.push({
      pageNumber,
      extractedText,
      thumbnailDataUrl: canvas.toDataURL("image/jpeg", 0.84),
      width: viewport.width,
      height: viewport.height
    });
  }

  return {
    fileName: file.name,
    totalPages: pdf.numPages,
    pages
  };
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return Boolean(item && typeof item === "object" && "str" in item && typeof (item as { str: unknown }).str === "string");
}

function readTextItems(items: unknown[]): PdfTextItem[] {
  return items.filter(isPdfTextItem);
}

function buildPageText(items: PdfTextItem[]): string {
  const positioned = items.filter((item): item is Required<PdfTextItem> => Array.isArray(item.transform));

  if (positioned.length === 0) {
    return items.map((item) => item.str).filter(Boolean).join(" ");
  }

  const lines = new Map<number, Required<PdfTextItem>[]>();

  for (const item of positioned) {
    const value = item.str.trim();
    if (!value) continue;

    const y = Math.round(item.transform[5] / 3) * 3;
    const line = lines.get(y) ?? [];
    line.push(item);
    lines.set(y, line);
  }

  return Array.from(lines.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([, line]) =>
      line
        .sort((left, right) => left.transform[4] - right.transform[4])
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("\n");
}
