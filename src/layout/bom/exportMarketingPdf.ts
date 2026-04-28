import { PDFDocument } from "pdf-lib";
import type { ProjectPricingView } from "./projectPricing";
import {
  aggregateProjectBoards,
  aggregateProjectComponents,
  aggregateProjectEdges,
  type CatalogAggregateRow,
  type ProjectQuoteSummary
} from "./projectQuote";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 84;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

type RenderPage = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cursorY: number;
  pageNumber: number;
};

function formatNumber(value: number, digits = 3) {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: digits }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function createCanvasPage(pageNumber: number): RenderPage {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available.");
  }

  const gradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  gradient.addColorStop(0, "#fbf6ef");
  gradient.addColorStop(1, "#f4ede3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  ctx.fillStyle = "#a6452d";
  ctx.fillRect(0, 0, PAGE_WIDTH, 170);
  ctx.fillStyle = "#1f1a17";
  ctx.fillRect(0, PAGE_HEIGHT - 54, PAGE_WIDTH, 54);

  ctx.fillStyle = "#fdfaf5";
  ctx.font = "600 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`Arcigy kitchen offer`, PAGE_MARGIN, 72);
  ctx.font = "400 16px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`Generated ${new Date().toLocaleDateString("sk-SK")}`, PAGE_MARGIN, 104);

  ctx.textAlign = "right";
  ctx.fillText(`Page ${pageNumber}`, PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 20);
  ctx.textAlign = "left";

  return {
    canvas,
    ctx,
    cursorY: 210,
    pageNumber
  };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function measureWrappedLines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= width || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  color = "#2f2722"
) {
  ctx.fillStyle = color;
  const lines = measureWrappedLines(ctx, text, width);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
}

function truncate(ctx: CanvasRenderingContext2D, value: string, width: number) {
  if (ctx.measureText(value).width <= width) return value;
  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > width) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function ensureSpace(pages: RenderPage[], height: number) {
  let page = pages[pages.length - 1]!;
  if (page.cursorY + height <= PAGE_HEIGHT - PAGE_MARGIN - 20) return page;
  const nextPage = createCanvasPage(pages.length + 1);
  pages.push(nextPage);
  return nextPage;
}

function drawSectionTitle(pages: RenderPage[], title: string, subtitle?: string) {
  const page = ensureSpace(pages, subtitle ? 88 : 56);
  const { ctx } = page;
  ctx.fillStyle = "#6f2f22";
  ctx.font = "700 28px 'Georgia', 'Times New Roman', serif";
  ctx.fillText(title, PAGE_MARGIN, page.cursorY);
  page.cursorY += 20;
  if (subtitle) {
    ctx.font = "400 18px 'Segoe UI', Arial, sans-serif";
    page.cursorY = drawWrappedText(ctx, subtitle, PAGE_MARGIN, page.cursorY + 18, CONTENT_WIDTH, 26, "#65574d");
  } else {
    page.cursorY += 20;
  }
  page.cursorY += 12;
}

function drawParagraph(pages: RenderPage[], text: string) {
  const page = ensureSpace(pages, 90);
  page.ctx.font = "400 20px 'Segoe UI', Arial, sans-serif";
  page.cursorY = drawWrappedText(page.ctx, text, PAGE_MARGIN, page.cursorY, CONTENT_WIDTH, 30, "#2f2722") + 12;
}

function drawSummaryCards(pages: RenderPage[], summary: ProjectQuoteSummary) {
  const page = ensureSpace(pages, 250);
  const cardWidth = (CONTENT_WIDTH - 20) / 2;
  const cardHeight = 96;
  const cards: Array<[string, string]> = [
    ["Material", formatCurrency(summary.materialCost)],
    ["Praca spolu", formatCurrency(summary.laborCostTotal)],
    ["Marza", `${formatNumber(summary.marginPercent, 2)} % / ${formatCurrency(summary.marginAmount)}`],
    ["Finalna cenova ponuka", formatCurrency(summary.finalPrice)]
  ];

  cards.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE_MARGIN + col * (cardWidth + 20);
    const y = page.cursorY + row * (cardHeight + 18);
    drawRoundedRect(page.ctx, x, y, cardWidth, cardHeight, 18);
    page.ctx.fillStyle = "#fffaf5";
    page.ctx.fill();
    page.ctx.strokeStyle = "#d8c7b4";
    page.ctx.lineWidth = 2;
    page.ctx.stroke();

    page.ctx.fillStyle = "#7d5a43";
    page.ctx.font = "600 18px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillText(label, x + 24, y + 34);
    page.ctx.fillStyle = "#1f1a17";
    page.ctx.font = "700 28px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillText(value, x + 24, y + 68);
  });

  page.cursorY += cardHeight * 2 + 36;
}

function drawKeyValueList(pages: RenderPage[], rows: Array<[string, string]>) {
  for (const [label, value] of rows) {
    const page = ensureSpace(pages, 34);
    page.ctx.font = "600 19px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillStyle = "#5c493d";
    page.ctx.fillText(label, PAGE_MARGIN, page.cursorY);
    page.ctx.font = "400 19px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillStyle = "#1f1a17";
    page.ctx.fillText(value, PAGE_MARGIN + 320, page.cursorY);
    page.cursorY += 32;
  }
  pages[pages.length - 1]!.cursorY += 8;
}

function drawAggregateBullets(
  pages: RenderPage[],
  title: string,
  rows: CatalogAggregateRow[],
  formatter: (row: CatalogAggregateRow) => string
) {
  drawSectionTitle(pages, title);
  if (rows.length === 0) {
    drawParagraph(pages, "V tomto navrhu nie su ziadne polozky pre tuto sekciu.");
    return;
  }

  for (const row of rows.slice(0, 10)) {
    const page = ensureSpace(pages, 64);
    page.ctx.fillStyle = "#6f2f22";
    page.ctx.font = "700 19px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillText("•", PAGE_MARGIN, page.cursorY);
    page.ctx.fillStyle = "#1f1a17";
    page.ctx.font = "700 19px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillText(row.displayName, PAGE_MARGIN + 22, page.cursorY);
    page.ctx.font = "400 18px 'Segoe UI', Arial, sans-serif";
    page.cursorY = drawWrappedText(page.ctx, formatter(row), PAGE_MARGIN + 22, page.cursorY + 24, CONTENT_WIDTH - 22, 26, "#4e433c") + 8;
  }
}

function drawTable(
  pages: RenderPage[],
  title: string,
  headers: string[],
  rows: string[][],
  widths: number[]
) {
  drawSectionTitle(pages, title);
  if (rows.length === 0) {
    drawParagraph(pages, "Zatial nie su k dispozicii ziadne riadky.");
    return;
  }

  const drawHeader = (page: RenderPage) => {
    drawRoundedRect(page.ctx, PAGE_MARGIN, page.cursorY, CONTENT_WIDTH, 42, 12);
    page.ctx.fillStyle = "#d96d4a";
    page.ctx.fill();
    page.ctx.font = "700 16px 'Segoe UI', Arial, sans-serif";
    page.ctx.fillStyle = "#fffdf9";
    let x = PAGE_MARGIN + 14;
    headers.forEach((header, index) => {
      page.ctx.fillText(header, x, page.cursorY + 27);
      x += widths[index]!;
    });
    page.cursorY += 54;
  };

  let page = ensureSpace(pages, 80);
  drawHeader(page);

  rows.forEach((row, rowIndex) => {
    page = ensureSpace(pages, 38);
    if (page.cursorY === 210) drawHeader(page);
    if (rowIndex % 2 === 0) {
      page.ctx.fillStyle = "#fff9f2";
      page.ctx.fillRect(PAGE_MARGIN, page.cursorY - 22, CONTENT_WIDTH, 32);
    }
    page.ctx.fillStyle = "#1f1a17";
    page.ctx.font = "400 15px 'Segoe UI', Arial, sans-serif";
    let x = PAGE_MARGIN + 14;
    row.forEach((value, index) => {
      page.ctx.fillText(truncate(page.ctx, value, widths[index]! - 16), x, page.cursorY);
      x += widths[index]!;
    });
    page.cursorY += 32;
  });
  page.cursorY += 10;
}

async function canvasToPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Failed to render canvas to PNG."));
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportMarketingOfferPdf(entries: ProjectPricingView[], summary: ProjectQuoteSummary) {
  const boards = aggregateProjectBoards(entries);
  const edges = aggregateProjectEdges(entries);
  const components = aggregateProjectComponents(entries);
  const pages = [createCanvasPage(1)];

  drawSectionTitle(
    pages,
    "Cenova ponuka kuchyne",
    "Prehladne spracovana ponuka z aktualneho navrhu, s rovnakou cenovou logikou ako v BOM appke aj v Create Sheet exporte."
  );
  drawParagraph(
    pages,
    "Ponuka je postavena na presne nacenenych doskovych materialoch, hranach a katalogovych komponentoch. Vysledok zahrna material, pracu, pripadnu dodatocnu projektovu pracu a marzu."
  );
  drawParagraph(
    pages,
    "Vybrane povrchy a kovania su orientovane na premium dojem, cisty detail, dobru odolnost v kazdodennom pouzivani a konzistentny vizual napriec celou zostavou."
  );
  drawSummaryCards(pages, summary);

  drawSectionTitle(pages, "Prehlad kalkulacie");
  drawKeyValueList(pages, [
    ["Dosky", formatCurrency(summary.boardsCost)],
    ["Olepovanie", formatCurrency(summary.edgesCost)],
    ["Komponenty", formatCurrency(summary.hardwareCost)],
    ["Modulova praca", formatCurrency(summary.moduleLaborCost)],
    ["Dodatocna praca projektu", formatCurrency(summary.additionalLaborCost)],
    ["Medzisucet pred marzou", formatCurrency(summary.subtotalBeforeMargin)],
    ["Marza", `${formatNumber(summary.marginPercent, 2)} %`],
    ["Finalna cenova ponuka", formatCurrency(summary.finalPrice)]
  ]);

  drawAggregateBullets(
    pages,
    "Pouzite materialy",
    boards,
    (row) =>
      `${formatNumber(row.quantity)} m2 netto, ${formatNumber(row.pricedQuantity ?? row.quantity)} m2 fakturovane, ${formatCurrency(row.unitPrice)} / m2, spolu ${formatCurrency(row.cost)}.`
  );
  drawAggregateBullets(
    pages,
    "Hrany a dokoncovacie prvky",
    edges,
    (row) => `${formatNumber(row.quantity)} lm, ${formatCurrency(row.unitPrice)} / lm, spolu ${formatCurrency(row.cost)}.`
  );
  drawAggregateBullets(
    pages,
    "Katalogove komponenty",
    components,
    (row) => `${formatNumber(row.quantity)} ks, ${formatCurrency(row.unitPrice)} / ks, spolu ${formatCurrency(row.cost)}.`
  );

  drawTable(
    pages,
    "Modulovy prehlad",
    ["Modul", "Dosky", "Hrany", "Komponenty", "Praca", "Celkom"],
    entries.map((entry) => [
      entry.label,
      formatCurrency(entry.result.pricing.groups.boards.cost),
      formatCurrency(entry.result.pricing.groups.edge_bands.cost),
      formatCurrency(entry.result.pricing.groups.hardware.cost),
      formatCurrency(entry.result.pricing.laborCostFixed),
      formatCurrency(entry.result.pricing.finalPrice)
    ]),
    [340, 150, 150, 150, 130, 160]
  );

  drawSectionTitle(pages, "Poznamka k ponuke");
  drawParagraph(
    pages,
    "Tento PDF vystup je marketingovo upravena cenova ponuka z aktualneho navrhu. Finalna cena v nom sa zhoduje s vysledkom Create Sheet a s BOM panelom v appke."
  );

  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const pngBytes = await canvasToPngBytes(page.canvas);
    const image = await pdf.embedPng(pngBytes);
    const pdfPage = pdf.addPage([595.28, 841.89]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pdfPage.getWidth(),
      height: pdfPage.getHeight()
    });
  }

  const bytes = await pdf.save();
  const date = new Date().toISOString().slice(0, 10);
  downloadPdf(bytes, `cenova-ponuka-${date}.pdf`);
}
