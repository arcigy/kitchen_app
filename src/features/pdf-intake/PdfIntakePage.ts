import { HeuristicPageClassifier } from "./pageClassifier";
import { extractPdfPages } from "./pdfTextExtractor";
import { PageReview } from "./PageReview";
import type { PageReviewItem } from "./types";

export function startPdfIntakePage(root: HTMLElement): void {
  root.className = "pdf-intake-app";
  root.innerHTML = `
    <header class="pdf-intake-header">
      <div>
        <div class="pdf-intake-kicker">PDF Page Classifier MVP</div>
        <h1>Architect PDF page review</h1>
      </div>
      <a class="pdf-intake-back" href="/">Back to app</a>
    </header>
    <main class="pdf-intake-main">
      <section class="pdf-intake-upload">
        <label class="pdf-intake-drop">
          <input id="pdfIntakeFile" type="file" accept="application/pdf,.pdf" />
          <span>Upload architect project PDF</span>
        </label>
        <div id="pdfIntakeStatus" class="pdf-intake-status">Waiting for PDF.</div>
      </section>
      <section id="pdfIntakeReviewHost" class="pdf-intake-review-host">
        <div class="pdf-intake-empty">Upload a PDF to classify pages.</div>
      </section>
    </main>
  `;

  const input = requireElement<HTMLInputElement>(root, "#pdfIntakeFile");
  const status = requireElement<HTMLDivElement>(root, "#pdfIntakeStatus");
  const reviewHost = requireElement<HTMLElement>(root, "#pdfIntakeReviewHost");
  const classifier = new HeuristicPageClassifier();

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      status.textContent = "Please upload a PDF file.";
      return;
    }

    status.textContent = "Reading PDF pages...";
    reviewHost.innerHTML = `<div class="pdf-intake-empty">Reading PDF pages...</div>`;

    try {
      const extraction = await extractPdfPages(file);
      status.textContent = `Classifying ${extraction.totalPages} pages...`;
      const pages: PageReviewItem[] = [];

      for (const page of extraction.pages) {
        const classification = await classifier.classifyPage({
          pageNumber: page.pageNumber,
          extractedText: page.extractedText
        });

        pages.push({
          ...classification,
          finalType: classification.predictedType,
          wasManuallyEdited: false,
          extractedText: page.extractedText,
          thumbnailDataUrl: page.thumbnailDataUrl
        });
      }

      status.textContent = `Ready: ${extraction.totalPages} pages classified.`;
      new PageReview(reviewHost, {
        fileName: extraction.fileName,
        pages
      });
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "PDF processing failed.";
      reviewHost.innerHTML = `<div class="pdf-intake-empty">PDF processing failed.</div>`;
    }
  });
}

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing PDF intake element: ${selector}`);
  return element;
}
