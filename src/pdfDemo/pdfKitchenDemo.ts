import { analyzePdfKitchenDemo, type PdfDemoAnalysis, type PdfDemoSource } from "./analyzer";
import {
  createWallReviewExport,
  renderWallDebugOverlay,
  renderWallCandidateList,
  renderWallDiagnostics,
  renderWallInspector,
  renderWallJson,
  type WallReviewState
} from "./debugOverlay";
import { detectDimensionCandidates, type DimensionDetectionResult } from "./dimensionDetector";
import { extractDxfVectorObjects } from "./dxfVectorExtractor";
import { analyzeKitchenWithGemini } from "./geminiAnalyzer";
import { convertPdfVectorsToDxf } from "./pdfToDxf";
import { extractPdfVectorObjects } from "./pdfVectorExtractor";
import { readPdfText, type PdfTextObservation } from "./pdfText";
import {
  DEFAULT_WALL_DETECTOR_CONFIG,
  detectLineweightWallCandidates,
  detectSampledWallCandidates,
  type WallDetectionResult
} from "./wallCandidateDetector";
import type { PdfVectorExtractionResult } from "./pdfVectorExtractor";

interface PdfDemoDocument extends PdfDemoSource {
  file: File;
  observations: PdfTextObservation[];
  status: "pending" | "reading" | "ready" | "error";
  error?: string;
}

export function startPdfKitchenDemo(root: HTMLElement): void {
  root.className = "pdf-demo-app";
  root.innerHTML = `
    <header class="pdf-demo-header">
      <div>
        <div class="pdf-demo-kicker">AI PDF kitchen demo</div>
        <h1>2D placement from architectural PDFs</h1>
      </div>
      <a class="pdf-demo-back" href="/">Back to app</a>
    </header>
    <main class="pdf-demo-main">
      <section class="pdf-demo-panel pdf-demo-inputs">
        <label class="pdf-demo-field">
          <span>Gemini API key</span>
          <input id="pdfDemoApiKey" type="password" autocomplete="off" placeholder="Paste key only for this demo session" />
        </label>
        <label class="pdf-demo-field">
          <span>Gemini model</span>
          <input id="pdfDemoModel" type="text" value="gemini-2.5-flash" />
        </label>
        <label class="pdf-demo-drop">
          <input id="pdfDemoFiles" type="file" accept="application/pdf,.dxf" multiple />
          <span>Attach PDF or DXF drawings</span>
        </label>
        <div id="pdfDemoFileList" class="pdf-demo-file-list"></div>
        <div class="pdf-demo-actions">
          <button id="pdfDemoExtractWalls" class="pdf-demo-primary" type="button">Extract walls deterministic</button>
          <button id="pdfDemoConvertPdfToDxf" class="pdf-demo-secondary" type="button">Convert PDF to DXF</button>
          <button id="pdfDemoPickWallSample" class="pdf-demo-secondary" type="button" disabled>Pick wall sample</button>
          <button id="pdfDemoGeminiAnalyze" class="pdf-demo-primary" type="button">Analyze with Gemini</button>
          <button id="pdfDemoAnalyze" class="pdf-demo-secondary" type="button">Run local demo parser</button>
          <button id="pdfDemoExportWalls" class="pdf-demo-secondary" type="button" disabled>Export wall JSON</button>
          <button id="pdfDemoExportWallReview" class="pdf-demo-secondary" type="button" disabled>Export wall_review.json</button>
        </div>
      </section>
      <section class="pdf-demo-panel pdf-demo-output">
        <div class="pdf-demo-output-head">
          <h2>Output</h2>
          <span id="pdfDemoScale">1 px = 10 mm</span>
        </div>
        <div id="pdfDemoCanvas" class="pdf-demo-canvas" aria-label="2D module placement"></div>
        <div id="pdfDemoNotes" class="pdf-demo-notes"></div>
        <div id="pdfWallValidation" class="pdf-wall-validation" hidden>
          <div id="pdfWallDiagnostics"></div>
          <div id="pdfWallCandidateList"></div>
          <div class="pdf-wall-review-actions">
            <button id="pdfWallAccept" class="pdf-demo-secondary" type="button" disabled>Accept as wall</button>
            <button id="pdfWallReject" class="pdf-demo-secondary" type="button" disabled>Reject</button>
            <button id="pdfWallReset" class="pdf-demo-secondary" type="button" disabled>Reset</button>
          </div>
          <div id="pdfWallInspector"></div>
        </div>
      </section>
      <section class="pdf-demo-panel pdf-demo-table-panel">
        <h2>Module positions</h2>
        <div id="pdfDemoTable"></div>
      </section>
    </main>
  `;

  const documents: PdfDemoDocument[] = [];
  const filesInput = requireElement<HTMLInputElement>(root, "#pdfDemoFiles");
  const fileList = requireElement<HTMLDivElement>(root, "#pdfDemoFileList");
  const analyzeButton = requireElement<HTMLButtonElement>(root, "#pdfDemoAnalyze");
  const geminiButton = requireElement<HTMLButtonElement>(root, "#pdfDemoGeminiAnalyze");
  const extractWallsButton = requireElement<HTMLButtonElement>(root, "#pdfDemoExtractWalls");
  const convertPdfToDxfButton = requireElement<HTMLButtonElement>(root, "#pdfDemoConvertPdfToDxf");
  const pickWallSampleButton = requireElement<HTMLButtonElement>(root, "#pdfDemoPickWallSample");
  const exportWallsButton = requireElement<HTMLButtonElement>(root, "#pdfDemoExportWalls");
  const exportWallReviewButton = requireElement<HTMLButtonElement>(root, "#pdfDemoExportWallReview");
  const apiKeyInput = requireElement<HTMLInputElement>(root, "#pdfDemoApiKey");
  const modelInput = requireElement<HTMLInputElement>(root, "#pdfDemoModel");
  const canvas = requireElement<HTMLDivElement>(root, "#pdfDemoCanvas");
  const notes = requireElement<HTMLDivElement>(root, "#pdfDemoNotes");
  const table = requireElement<HTMLDivElement>(root, "#pdfDemoTable");
  const wallValidation = requireElement<HTMLDivElement>(root, "#pdfWallValidation");
  const wallDiagnostics = requireElement<HTMLDivElement>(root, "#pdfWallDiagnostics");
  const wallCandidateList = requireElement<HTMLDivElement>(root, "#pdfWallCandidateList");
  const wallInspector = requireElement<HTMLDivElement>(root, "#pdfWallInspector");
  const acceptWallButton = requireElement<HTMLButtonElement>(root, "#pdfWallAccept");
  const rejectWallButton = requireElement<HTMLButtonElement>(root, "#pdfWallReject");
  const resetWallButton = requireElement<HTMLButtonElement>(root, "#pdfWallReset");
  let lastWallDetection: WallDetectionResult | null = null;
  let lastVectorExtraction: PdfVectorExtractionResult | null = null;
  let lastDimensionDetection: DimensionDetectionResult | null = null;
  let reviewState: WallReviewState = {};
  let selectedWallId: string | null = null;

  filesInput.addEventListener("change", () => {
    const files = Array.from(filesInput.files ?? []);
    for (const file of files) {
      documents.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        description: "",
        text: "",
        observations: [],
        status: "pending"
      });
    }
    renderFileList(fileList, documents);
  });

  fileList.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;

    const document = documents.find((item) => item.id === target.dataset.documentId);
    if (document) document.description = target.value;
  });

  fileList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const index = documents.findIndex((item) => item.id === target.dataset.removeDocumentId);
    if (index >= 0) {
      documents.splice(index, 1);
      renderFileList(fileList, documents);
    }
  });

  extractWallsButton.addEventListener("click", async () => {
    if (documents.length === 0) {
      renderError(notes, "Attach at least one vector PDF first.");
      return;
    }

    setBusy([extractWallsButton, geminiButton, analyzeButton, exportWallsButton, exportWallReviewButton], true);
    extractWallsButton.textContent = "Extracting walls...";

    try {
      const document = documents[0];
      const extraction = await extractVectorObjects(document.file);
      lastVectorExtraction = extraction;
      const detection = detectLineweightWallCandidates(extraction.page, extraction.isVectorPdf, extraction.objects, {
        ...DEFAULT_WALL_DETECTOR_CONFIG,
        targetLineweightStrokeWidthPx: isDxfFile(document.file) ? 0.4 : DEFAULT_WALL_DETECTOR_CONFIG.targetLineweightStrokeWidthPx,
        lineweightTolerancePx: isDxfFile(document.file) ? 0.001 : DEFAULT_WALL_DETECTOR_CONFIG.lineweightTolerancePx,
        floorplanMaxX: Number.POSITIVE_INFINITY,
        drawingScale: 1
      });
      lastDimensionDetection = detectDimensionCandidates(extraction, detection.walls);
      lastWallDetection = detection;
      root.classList.add("pdf-demo-wall-mode");
      reviewState = {};
      selectedWallId = detection.walls[0]?.id ?? null;
      canvas.innerHTML = renderWallDebugOverlay(extraction, detection, reviewState, { dimensions: lastDimensionDetection });
      notes.innerHTML = [
        isDxfFile(document.file)
          ? `<p>Mode: DXF lineweight 0.4, coordinates normalized to 1:1.</p>`
          : `<p>Mode: PDF fallback. Prefer DXF upload for accurate wall lineweight.</p>`,
        `<p>Vector objects: ${detection.debug.totalVectorObjects}</p>`,
        `<p>Wall candidates: ${detection.debug.wallCandidates}</p>`,
        `<p>Wall rectangles: ${detection.debug.wallRectangles}</p>`,
        `<p>Unresolved wall boundaries: ${detection.debug.unresolvedWallBoundaries}</p>`,
        `<p>Dimension candidates: ${lastDimensionDetection.debug.matchedDimensions}</p>`,
        `<p>Ignored objects: ${detection.debug.ignoredObjects}</p>`
      ].join("");
      wallValidation.hidden = false;
      wallDiagnostics.innerHTML = renderWallDiagnostics(detection);
      wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
      renderSelectedWallInspector(wallInspector, detection, reviewState, selectedWallId);
      table.innerHTML = renderWallJson(detection);
      exportWallsButton.disabled = false;
      exportWallReviewButton.disabled = false;
      pickWallSampleButton.disabled = false;
      const selectWall = (wallId: string) => {
        selectedWallId = wallId;
        wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
        bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, (nextWallId) => {
          selectedWallId = nextWallId;
        });
      };
      bindWallOverlaySelection(canvas, wallInspector, detection, reviewState, selectWall);
      bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, selectWall);
    } catch (error) {
      lastWallDetection = null;
      lastVectorExtraction = null;
      lastDimensionDetection = null;
      root.classList.remove("pdf-demo-wall-mode");
      selectedWallId = null;
      reviewState = {};
      exportWallsButton.disabled = true;
      exportWallReviewButton.disabled = true;
      pickWallSampleButton.disabled = true;
      wallValidation.hidden = true;
      renderError(notes, error instanceof Error ? error.message : "Wall extraction failed.");
    } finally {
      extractWallsButton.textContent = "Extract walls deterministic";
      setBusy([extractWallsButton, geminiButton, analyzeButton], false);
      exportWallsButton.disabled = lastWallDetection === null;
      exportWallReviewButton.disabled = lastWallDetection === null;
    }
  });

  convertPdfToDxfButton.addEventListener("click", async () => {
    if (documents.length === 0) {
      renderError(notes, "Attach a PDF first.");
      return;
    }

    const document = documents[0];
    if (isDxfFile(document.file)) {
      renderError(notes, "This is already a DXF file.");
      return;
    }

    setBusy([convertPdfToDxfButton, extractWallsButton, geminiButton, analyzeButton], true);
    convertPdfToDxfButton.textContent = "Converting PDF to DXF...";

    try {
      const pdfExtraction = await extractPdfVectorObjects(document.file, 1);
      const dxfText = convertPdfVectorsToDxf(pdfExtraction);
      downloadText("pdf-import-1to1.dxf", dxfText, "application/dxf");
      const dxfFile = new File([dxfText], "pdf-import-1to1.dxf", { type: "application/dxf" });
      documents.splice(0, documents.length, {
        id: crypto.randomUUID(),
        file: dxfFile,
        name: dxfFile.name,
        description: "Generated from PDF vectors at 1:1 scale.",
        text: "",
        observations: [],
        status: "pending"
      });
      renderFileList(fileList, documents);
      const extraction = await extractVectorObjects(dxfFile);
      lastVectorExtraction = extraction;
      const detection = detectLineweightWallCandidates(extraction.page, extraction.isVectorPdf, extraction.objects, {
        ...DEFAULT_WALL_DETECTOR_CONFIG,
        targetLineweightStrokeWidthPx: 0.4,
        lineweightTolerancePx: 0.001,
        floorplanMaxX: Number.POSITIVE_INFINITY,
        drawingScale: 1
      });
      lastDimensionDetection = detectDimensionCandidates(extraction, detection.walls);
      lastWallDetection = detection;
      root.classList.add("pdf-demo-wall-mode");
      reviewState = {};
      selectedWallId = detection.walls[0]?.id ?? null;
      canvas.innerHTML = renderWallDebugOverlay(extraction, detection, reviewState, { dimensions: lastDimensionDetection });
      notes.innerHTML = [
        `<p>Mode: generated DXF from PDF vectors. Matching DXF lineweight 0.4 at 1:1 scale.</p>`,
        `<p>Vector objects: ${detection.debug.totalVectorObjects}</p>`,
        `<p>Wall candidates: ${detection.debug.wallCandidates}</p>`,
        `<p>Wall rectangles: ${detection.debug.wallRectangles}</p>`,
        `<p>Unresolved wall boundaries: ${detection.debug.unresolvedWallBoundaries}</p>`,
        `<p>Dimension candidates: ${lastDimensionDetection.debug.matchedDimensions}</p>`,
        `<p>Ignored objects: ${detection.debug.ignoredObjects}</p>`
      ].join("");
      wallValidation.hidden = false;
      wallDiagnostics.innerHTML = renderWallDiagnostics(detection);
      wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
      renderSelectedWallInspector(wallInspector, detection, reviewState, selectedWallId);
      table.innerHTML = renderWallJson(detection);
      exportWallsButton.disabled = false;
      exportWallReviewButton.disabled = false;
      pickWallSampleButton.disabled = false;
      const selectWall = (wallId: string) => {
        selectedWallId = wallId;
        wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
        bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, (nextWallId) => {
          selectedWallId = nextWallId;
        });
      };
      bindWallOverlaySelection(canvas, wallInspector, detection, reviewState, selectWall);
      bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, selectWall);
    } catch (error) {
      renderError(notes, error instanceof Error ? error.message : "PDF to DXF conversion failed.");
    } finally {
      convertPdfToDxfButton.textContent = "Convert PDF to DXF";
      setBusy([convertPdfToDxfButton, extractWallsButton, geminiButton, analyzeButton], false);
    }
  });

  pickWallSampleButton.addEventListener("click", () => {
    if (!lastVectorExtraction || !lastWallDetection) return;

    notes.innerHTML = [
      `<p>Pick wall sample mode: click one real wall line/polyline in the PDF overlay.</p>`,
      `<p>The app will copy that vector object's stroke width, color, kind and use it as the wall filter.</p>`
    ].join("");
    canvas.innerHTML = renderWallDebugOverlay(lastVectorExtraction, lastWallDetection, reviewState, {
      samplePickEnabled: true,
      dimensions: lastDimensionDetection
    });
    bindSamplePicker(canvas, notes, lastVectorExtraction, (detection) => {
      lastWallDetection = detection;
      lastDimensionDetection = detectDimensionCandidates(lastVectorExtraction!, detection.walls);
      reviewState = {};
      selectedWallId = detection.walls[0]?.id ?? null;
      canvas.innerHTML = renderWallDebugOverlay(lastVectorExtraction!, detection, reviewState, { dimensions: lastDimensionDetection });
      wallDiagnostics.innerHTML = renderWallDiagnostics(detection);
      wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
      renderSelectedWallInspector(wallInspector, detection, reviewState, selectedWallId);
      table.innerHTML = renderWallJson(detection);
      notes.innerHTML = [
        `<p>Sample-based filter active. Clicked vector properties are now used for wall candidates.</p>`,
        `<p>Vector objects: ${detection.debug.totalVectorObjects}</p>`,
        `<p>Wall candidates: ${detection.debug.wallCandidates}</p>`,
        `<p>Wall rectangles: ${detection.debug.wallRectangles}</p>`,
        `<p>Unresolved wall boundaries: ${detection.debug.unresolvedWallBoundaries}</p>`,
        `<p>Dimension candidates: ${lastDimensionDetection.debug.matchedDimensions}</p>`,
        `<p>Ignored objects: ${detection.debug.ignoredObjects}</p>`
      ].join("");
      const selectWall = (wallId: string) => {
        selectedWallId = wallId;
        wallCandidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
        bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, (nextWallId) => {
          selectedWallId = nextWallId;
        });
      };
      bindWallOverlaySelection(canvas, wallInspector, detection, reviewState, selectWall);
      bindWallListSelection(wallCandidateList, canvas, wallInspector, detection, reviewState, selectWall);
    });
  });

  exportWallsButton.addEventListener("click", () => {
    if (!lastWallDetection) return;
    downloadJson("wall-candidates.json", lastWallDetection);
  });

  exportWallReviewButton.addEventListener("click", () => {
    if (!lastWallDetection) return;
    downloadJson("wall_review.json", createWallReviewExport(lastWallDetection, reviewState));
  });

  acceptWallButton.addEventListener("click", () => {
    setReviewStatus("accepted");
  });

  rejectWallButton.addEventListener("click", () => {
    setReviewStatus("rejected");
  });

  resetWallButton.addEventListener("click", () => {
    if (!selectedWallId || !lastWallDetection) return;
    delete reviewState[selectedWallId];
    rerenderWallReview(canvas, wallInspector, wallCandidateList, lastWallDetection, reviewState, selectedWallId, (wallId) => {
      selectedWallId = wallId;
    });
  });

  analyzeButton.addEventListener("click", async () => {
    root.classList.remove("pdf-demo-wall-mode");
    analyzeButton.disabled = true;
    analyzeButton.textContent = "Reading PDFs...";
    await readDocuments(documents, fileList);
    const analysis = analyzePdfKitchenDemo(documents);
    renderAnalysis(canvas, notes, table, analysis);
    analyzeButton.textContent = "Run local demo parser";
    analyzeButton.disabled = false;
  });

  geminiButton.addEventListener("click", async () => {
    root.classList.remove("pdf-demo-wall-mode");
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      renderError(notes, "Gemini API key is required for AI analysis.");
      return;
    }

    if (documents.length === 0) {
      renderError(notes, "Attach at least one PDF first.");
      return;
    }

    setBusy([geminiButton, analyzeButton], true);
    geminiButton.textContent = "Analyzing with Gemini...";

    try {
      await readDocuments(documents, fileList);
      const readyDocuments = documents.filter((document) => document.status === "ready");
      const analysis = await analyzeKitchenWithGemini({
        apiKey,
        model: modelInput.value,
        documents: readyDocuments
      });
      renderAnalysis(canvas, notes, table, analysis);
    } catch (error) {
      renderError(notes, error instanceof Error ? error.message : "Gemini analysis failed.");
    } finally {
      geminiButton.textContent = "Analyze with Gemini";
      setBusy([geminiButton, analyzeButton], false);
    }
  });

  renderAnalysis(canvas, notes, table, analyzePdfKitchenDemo([]));

  void loadSamplePdfFromQuery();

  function setReviewStatus(status: "accepted" | "rejected"): void {
    if (!selectedWallId || !lastWallDetection) return;

    reviewState[selectedWallId] = status;
    rerenderWallReview(canvas, wallInspector, wallCandidateList, lastWallDetection, reviewState, selectedWallId, (wallId) => {
      selectedWallId = wallId;
    });
  }

  async function loadSamplePdfFromQuery(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const samplePdf = params.get("samplePdf");
    if (!samplePdf) return;

    const response = await fetch(samplePdf);
    if (!response.ok) {
      renderError(notes, `Sample PDF failed to load: ${response.status}`);
      return;
    }

    const blob = await response.blob();
    documents.splice(0, documents.length, {
      id: crypto.randomUUID(),
      file: new File([blob], samplePdf.split("/").pop() ?? "sample.pdf", {
        type: samplePdf.toLowerCase().endsWith(".dxf") ? "application/dxf" : "application/pdf"
      }),
      name: samplePdf.split("/").pop() ?? "sample.pdf",
      description: "Loaded from samplePdf query for wall validation preview.",
      text: "",
      observations: [],
      status: "pending"
    });
    renderFileList(fileList, documents);
    if (params.get("convertDxf") === "1" && !isDxfFile(documents[0].file)) {
      convertPdfToDxfButton.click();
    } else {
      extractWallsButton.click();
    }
  }
}

function downloadJson(fileName: string, value: unknown): void {
  downloadText(fileName, JSON.stringify(value, null, 2), "application/json");
}

function downloadText(fileName: string, value: string, mimeType: string): void {
  const blob = new Blob([value], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function extractVectorObjects(file: File): Promise<PdfVectorExtractionResult> {
  if (isDxfFile(file)) {
    return extractDxfVectorObjects(file, { drawingScale: 1 });
  }

  return extractPdfVectorObjects(file, 1);
}

function isDxfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".dxf");
}

async function readDocuments(documents: PdfDemoDocument[], fileList: HTMLElement): Promise<void> {
  for (const document of documents) {
    if (document.status === "ready") continue;

    document.status = "reading";
    renderFileList(fileList, documents);

    try {
      const result = await readPdfText(document.file);
      document.text = result.text;
      document.observations = result.observations;
      document.status = "ready";
      document.error = undefined;
    } catch (error) {
      document.status = "error";
      document.error = error instanceof Error ? error.message : "PDF read failed";
    }
    renderFileList(fileList, documents);
  }
}

function renderError(container: HTMLElement, message: string): void {
  container.innerHTML = `<p class="pdf-demo-error">${escapeHtml(message)}</p>`;
}

function setBusy(buttons: HTMLButtonElement[], busy: boolean): void {
  for (const button of buttons) {
    button.disabled = busy;
  }
}

function bindWallOverlaySelection(
  canvas: HTMLElement,
  inspector: HTMLElement,
  detection: WallDetectionResult,
  reviewState: WallReviewState,
  onSelect: (wallId: string) => void
): void {
  canvas.querySelectorAll<SVGGElement>("[data-wall-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const wallId = element.dataset.wallId;
      if (!wallId) return;

      onSelect(wallId);
      renderSelectedWallInspector(inspector, detection, reviewState, wallId);
      canvas.querySelectorAll(".pdf-wall-selected").forEach((selected) => selected.classList.remove("pdf-wall-selected"));
      element.classList.add("pdf-wall-selected");
    });
  });

  if (detection.walls[0]) {
    const first = canvas.querySelector<SVGGElement>(`[data-wall-id="${detection.walls[0].id}"]`);
    first?.classList.add("pdf-wall-selected");
  }
}

function bindSamplePicker(
  canvas: HTMLElement,
  notes: HTMLElement,
  extraction: PdfVectorExtractionResult,
  onDetection: (detection: WallDetectionResult) => void
): void {
  canvas.classList.add("pdf-sample-pick-mode");
  canvas.querySelectorAll<SVGElement>("[data-vector-id]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const vectorId = element.dataset.vectorId;
      if (!vectorId) return;

      const sample = extraction.objects.find((object) => object.id === vectorId);
      if (!sample) return;

      const detection = detectSampledWallCandidates(extraction.page, extraction.isVectorPdf, extraction.objects, vectorId);
      canvas.classList.remove("pdf-sample-pick-mode");
      notes.innerHTML = [
        `<p>Sample picked: ${sample.id}, kind ${sample.kind}, strokeWidth ${sample.strokeWidth}px.</p>`,
        `<p>Matched similar line/polyline vectors by stroke width and color.</p>`
      ].join("");
      onDetection(detection);
    });
  });
}

function rerenderWallReview(
  canvas: HTMLElement,
  inspector: HTMLElement,
  candidateList: HTMLElement,
  detection: WallDetectionResult,
  reviewState: WallReviewState,
  selectedWallId: string,
  onSelect: (wallId: string) => void
): void {
  canvas.querySelectorAll<SVGGElement>("[data-wall-id]").forEach((element) => {
    const wallId = element.dataset.wallId;
    if (!wallId) return;

    element.classList.toggle("pdf-wall-accepted", reviewState[wallId] === "accepted");
    element.classList.toggle("pdf-wall-rejected", reviewState[wallId] === "rejected");
    element.classList.toggle("pdf-wall-unreviewed", !reviewState[wallId]);
    element.classList.toggle("pdf-wall-selected", wallId === selectedWallId);
  });
  candidateList.innerHTML = renderWallCandidateList(detection, reviewState, selectedWallId);
  bindWallListSelection(candidateList, canvas, inspector, detection, reviewState, onSelect);
  renderSelectedWallInspector(inspector, detection, reviewState, selectedWallId);
}

function bindWallListSelection(
  list: HTMLElement,
  canvas: HTMLElement,
  inspector: HTMLElement,
  detection: WallDetectionResult,
  reviewState: WallReviewState,
  onSelect: (wallId: string) => void
): void {
  list.querySelectorAll<HTMLButtonElement>("[data-wall-list-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const wallId = button.dataset.wallListId;
      if (!wallId) return;

      onSelect(wallId);
      list.innerHTML = renderWallCandidateList(detection, reviewState, wallId);
      bindWallListSelection(list, canvas, inspector, detection, reviewState, onSelect);
      canvas.querySelectorAll(".pdf-wall-selected").forEach((selected) => selected.classList.remove("pdf-wall-selected"));
      canvas.querySelector(`[data-wall-id="${wallId}"]`)?.classList.add("pdf-wall-selected");
      renderSelectedWallInspector(inspector, detection, reviewState, wallId);
    });
  });
}

function renderSelectedWallInspector(
  inspector: HTMLElement,
  detection: WallDetectionResult,
  reviewState: WallReviewState,
  wallId: string | null
): void {
  const wall = detection.walls.find((candidate) => candidate.id === wallId) ?? null;
  const status = wall ? reviewState[wall.id] ?? "unreviewed" : "unreviewed";
  inspector.innerHTML = renderWallInspector(wall, status);
  const hasWall = wall !== null;
  document.querySelectorAll<HTMLButtonElement>("#pdfWallAccept, #pdfWallReject, #pdfWallReset")
    .forEach((button) => {
      button.disabled = !hasWall;
    });
}

function renderFileList(container: HTMLElement, documents: PdfDemoDocument[]): void {
  if (documents.length === 0) {
    container.innerHTML = `<div class="pdf-demo-empty">No PDFs attached yet.</div>`;
    return;
  }

  container.innerHTML = documents
    .map(
      (document) => `
        <article class="pdf-demo-file">
          <div class="pdf-demo-file-row">
            <strong>${escapeHtml(document.name)}</strong>
            <span>${formatStatus(document)}</span>
            <button type="button" data-remove-document-id="${document.id}" aria-label="Remove ${escapeHtml(document.name)}">Remove</button>
          </div>
          <textarea data-document-id="${document.id}" rows="3" placeholder="Description for this PDF">${escapeHtml(document.description)}</textarea>
          ${document.error ? `<div class="pdf-demo-error">${escapeHtml(document.error)}</div>` : ""}
        </article>
      `
    )
    .join("");
}

function renderAnalysis(
  canvas: HTMLElement,
  notes: HTMLElement,
  table: HTMLElement,
  analysis: PdfDemoAnalysis
): void {
  canvas.innerHTML = renderSvg(analysis);
  notes.innerHTML = analysis.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("");
  table.innerHTML = renderTable(analysis);
}

function renderSvg(analysis: PdfDemoAnalysis): string {
  const padding = 80;
  const scale = 0.1;
  const width = Math.max(640, analysis.bounds.widthMm * scale + padding * 2);
  const height = Math.max(360, analysis.bounds.depthMm * scale + padding * 2);
  const modules = analysis.modules
    .map((module) => {
      const x = padding + module.xMm * scale;
      const y = padding + module.yMm * scale;
      const moduleWidth = module.widthMm * scale;
      const moduleDepth = module.depthMm * scale;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${moduleWidth}" height="${moduleDepth}" rx="2" />
          <text x="${x + moduleWidth / 2}" y="${y + moduleDepth / 2 - 6}" text-anchor="middle">${module.label}</text>
          <text x="${x + moduleWidth / 2}" y="${y + moduleDepth / 2 + 12}" text-anchor="middle">${module.widthMm} x ${module.depthMm}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="2D kitchen module layout">
      <defs>
        <pattern id="pdfDemoGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" />
        </pattern>
      </defs>
      <rect class="pdf-demo-grid" width="${width}" height="${height}" fill="url(#pdfDemoGrid)" />
      <g class="pdf-demo-modules">${modules}</g>
    </svg>
  `;
}

function renderTable(analysis: PdfDemoAnalysis): string {
  return `
    <table class="pdf-demo-position-table">
      <thead>
        <tr>
          <th>Module</th>
          <th>X mm</th>
          <th>Y mm</th>
          <th>Width mm</th>
          <th>Depth mm</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${analysis.modules
          .map(
            (module) => `
              <tr>
                <td>${module.label}</td>
                <td>${module.xMm}</td>
                <td>${module.yMm}</td>
                <td>${module.widthMm}</td>
                <td>${module.depthMm}</td>
                <td>${escapeHtml(module.sourceName)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function formatStatus(document: PdfDemoDocument): string {
  if (document.status === "ready") return "Text ready";
  if (document.status === "reading") return "Reading...";
  if (document.status === "error") return "Read error";
  return `${Math.round(document.file.size / 1024)} kB`;
}

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing PDF demo element: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
