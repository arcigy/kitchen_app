import * as pdfjsLib from "pdfjs-dist";

export interface PdfTextObservation {
  value: string;
  page: number;
  locationXOnDrawing: number;
  locationYOnDrawing: number;
}

export interface PdfReadResult {
  text: string;
  observations: PdfTextObservation[];
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function readPdfText(file: File): Promise<PdfReadResult> {
  const data = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  const observations: PdfTextObservation[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");

    for (const item of content.items) {
      if (!isPositionedTextItem(item)) continue;

      const value = item.str.trim();
      if (!value) continue;

      observations.push({
        value,
        page: pageNumber,
        locationXOnDrawing: Math.round(item.transform[4]),
        locationYOnDrawing: Math.round(item.transform[5])
      });
    }

    pages.push(text);
  }

  return {
    text: pages.join("\n"),
    observations
  };
}

function isPositionedTextItem(item: unknown): item is { str: string; transform: number[] } {
  if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return false;

  const candidate = item as { str: unknown; transform: unknown };
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
}
