import * as XLSX from "xlsx";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import type { ProjectPricingView } from "./projectPricing";

type CellValue = string | number | XLSX.CellObject;

type BoardRow = {
  boardLabel: string;
  partKey: string;
  dimensionsLabel: string;
  materialLabel: string;
  unitPrice: number;
  areaM2: number;
  cost: number;
};

type EdgeRow = {
  boardLabel: string;
  sideLabel: string;
  perBoardLengthM: number;
  totalLengthM: number;
  unitPrice: number;
  cost: number;
};

type ComponentRow = {
  componentLabel: string;
  unitPrice: number;
  quantity: number;
  cost: number;
};

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function money(value: number) {
  return round(value, 2);
}

function quantityCount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value));
}

function sanitizeSheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function translateBoardDescription(description: string) {
  const value = description.toLowerCase();
  if (value.includes("side panel")) return "Bočnica";
  if (value.includes("bottom panel")) return "Spodná doska";
  if (value.includes("top panel")) return "Horná doska";
  if (value.includes("back panel")) return "Zadná doska";
  if (value.includes("shelf")) return "Polica";
  if (value.includes("door front")) return "Dvierka";
  if (value.includes("front panel")) return "Predné čelo";
  if (value.includes("drawer bottom")) return "Dno zásuvky";
  if (value.includes("drawer") && value.includes("side")) return "Bok zásuvky";
  if (value.includes("drawer") && (value.includes("front") || value.includes("back"))) return "Predok/zadok zásuvky";
  if (value.includes("plinth")) return "Sokel";
  if (value.includes("stretcher")) return "Výstuha";
  if (value.includes("corner")) return "Rohová doska";
  if (value.includes("worktop")) return "Pracovná doska";
  if (value.includes("panel")) return "Doska";
  return description;
}

function translateEdgeNotes(notes: string[] | undefined) {
  const text = (notes ?? []).join(", ").toLowerCase();
  if (!text) return "Hrana";
  return text
    .replaceAll("front visible vertical edge", "predná zvislá hrana")
    .replaceAll("front visible edge", "predná hrana")
    .replaceAll("rear visible edge", "zadná hrana")
    .replaceAll("left visible edge", "ľavá hrana")
    .replaceAll("right visible edge", "pravá hrana")
    .replaceAll("full visible perimeter", "celý viditeľný obvod")
    .replaceAll("visible perimeter", "viditeľný obvod")
    .replaceAll("visible edge", "viditeľná hrana");
}

function formatDimensions(item: PortableQuoteBomItem) {
  if (!item.dimensionsMm) return "-";
  const { length, width, thickness } = item.dimensionsMm;
  return `${round(length, 1)} x ${round(width, 1)} x ${round(thickness, 1)}`;
}

function buildBoardRows(entry: ProjectPricingView) {
  const rows: BoardRow[] = [];
  const partKeyToBoardLabel = new Map<string, string>();

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "board") continue;
    const count = quantityCount(item.quantity);
    const totalArea = item.metrics?.areaM2 ?? item.pricingQuantityBase ?? item.pricingQuantity ?? 0;
    const totalCost = item.itemCost ?? 0;
    const perBoardArea = count > 0 ? totalArea / count : totalArea;
    const perBoardCost = count > 0 ? totalCost / count : totalCost;
    const partIds = item.sourcePartIds?.length ? item.sourcePartIds : [item.id];

    for (let index = 0; index < count; index += 1) {
      const ordinal = count > 1 ? ` ${index + 1}` : "";
      const partKey = partIds[Math.min(index, partIds.length - 1)] ?? `${item.id}:${index + 1}`;
      const boardLabel = `${translateBoardDescription(item.description)}${ordinal}`;
      rows.push({
        boardLabel,
        partKey,
        dimensionsLabel: formatDimensions(item),
        materialLabel: item.material?.displayName ?? "-",
        unitPrice: money(item.unitPrice ?? 0),
        areaM2: round(perBoardArea, 4),
        cost: money(perBoardCost)
      });
      partKeyToBoardLabel.set(partKey, boardLabel);
    }
  }

  return { rows, partKeyToBoardLabel };
}

function buildComponentRows(entry: ProjectPricingView) {
  const buckets = new Map<string, ComponentRow>();

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "hardware") continue;
    const key = item.component?.catalogId ?? item.id;
    const existing = buckets.get(key) ?? {
      componentLabel: item.component?.displayName ?? item.description,
      unitPrice: money(item.unitPrice ?? 0),
      quantity: 0,
      cost: 0
    };
    existing.quantity += item.pricingQuantity ?? item.quantity ?? 0;
    existing.cost += item.itemCost ?? 0;
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      quantity: round(row.quantity, 4),
      cost: money(row.cost)
    }))
    .sort((left, right) => left.componentLabel.localeCompare(right.componentLabel));
}

function buildEdgeRows(entry: ProjectPricingView, boardMap: Map<string, string>) {
  const rows: EdgeRow[] = [];

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "edge_band") continue;
    const sourcePartIds = item.sourcePartIds?.length ? item.sourcePartIds : [];
    const rowCount = Math.max(sourcePartIds.length, quantityCount(item.quantity));
    const totalLengthM = item.metrics?.edgeLengthLm ?? item.pricingQuantity ?? 0;
    const totalCost = item.itemCost ?? 0;
    const perBoardLengthM = rowCount > 0 ? totalLengthM / rowCount : totalLengthM;
    const perBoardCost = rowCount > 0 ? totalCost / rowCount : totalCost;
    const sideLabel = translateEdgeNotes(item.notes);

    for (let index = 0; index < rowCount; index += 1) {
      const partKey = sourcePartIds[Math.min(index, sourcePartIds.length - 1)] ?? `${item.id}:${index + 1}`;
      rows.push({
        boardLabel: boardMap.get(partKey) ?? translateBoardDescription(item.description),
        sideLabel,
        perBoardLengthM: round(perBoardLengthM, 4),
        totalLengthM: round(totalLengthM, 4),
        unitPrice: money(item.unitPrice ?? 0),
        cost: money(perBoardCost)
      });
    }
  }

  return rows;
}

function appendSectionTitle(rows: CellValue[][], title: string) {
  rows.push([title]);
}

function appendBoardsSection(rows: CellValue[][], boardRows: BoardRow[]) {
  appendSectionTitle(rows, "Dosky");
  rows.push(["Názov dosky", "Rozmer (mm)", "Materiál", "Plocha (m2)", "Cena za m2", "Cena dosky"]);
  if (boardRows.length === 0) {
    rows.push(["Bez dosiek"]);
    rows.push([]);
    return;
  }

  const startRow = rows.length + 1;
  for (const row of boardRows) {
    rows.push([row.boardLabel, row.dimensionsLabel, row.materialLabel, row.areaM2, row.unitPrice, row.cost]);
  }
  const endRow = rows.length;
  rows.push([
    "Spolu dosky",
    "",
    "",
    { f: `SUM(D${startRow}:D${endRow})` },
    "",
    { f: `SUM(F${startRow}:F${endRow})` }
  ]);
  rows.push([]);
}

function appendComponentsSection(rows: CellValue[][], componentRows: ComponentRow[]) {
  appendSectionTitle(rows, "Komponenty");
  rows.push(["Komponent", "Cena za kus", "Počet", "Cena celkovo"]);
  if (componentRows.length === 0) {
    rows.push(["Bez komponentov"]);
    rows.push([]);
    return;
  }

  const startRow = rows.length + 1;
  for (const row of componentRows) {
    rows.push([row.componentLabel, row.unitPrice, row.quantity, row.cost]);
  }
  const endRow = rows.length;
  rows.push(["Spolu komponenty", "", "", { f: `SUM(D${startRow}:D${endRow})` }]);
  rows.push([]);
}

function appendEdgesSection(rows: CellValue[][], edgeRows: EdgeRow[]) {
  appendSectionTitle(rows, "Edge band");
  rows.push(["Doska", "Strana", "Dĺžka na doske (m)", "Dĺžka spolu (m)", "Cena za m", "Cena celkovo"]);
  if (edgeRows.length === 0) {
    rows.push(["Bez olepovania"]);
    rows.push([]);
    return;
  }

  const startRow = rows.length + 1;
  for (const row of edgeRows) {
    rows.push([row.boardLabel, row.sideLabel, row.perBoardLengthM, row.totalLengthM, row.unitPrice, row.cost]);
  }
  const endRow = rows.length;
  rows.push([
    "Spolu edge band",
    "",
    { f: `SUM(C${startRow}:C${endRow})` },
    { f: `SUM(D${startRow}:D${endRow})` },
    "",
    { f: `SUM(F${startRow}:F${endRow})` }
  ]);
  rows.push([]);
}

function appendModuleSummary(rows: CellValue[][], entry: ProjectPricingView) {
  appendSectionTitle(rows, "Súhrn");
  const startRow = rows.length + 1;
  rows.push(["Dosky", entry.result.pricing.groups.boards.cost]);
  rows.push(["Komponenty", entry.result.pricing.groups.hardware.cost]);
  rows.push(["Edge band", entry.result.pricing.groups.edge_bands.cost]);
  rows.push(["Práca", entry.result.pricing.laborCostFixed]);
  rows.push(["Vzorec materiál", `=B${startRow}+B${startRow + 1}+B${startRow + 2}`]);
  rows.push(["Materiál spolu", { f: `SUM(B${startRow}:B${startRow + 2})` }]);
  rows.push(["Vzorec celkom", `=B${startRow + 5}+B${startRow + 3}`]);
  rows.push(["Celkom", { f: `B${startRow + 5}+B${startRow + 3}` }]);
}

function buildModuleSheet(entry: ProjectPricingView) {
  const rows: CellValue[][] = [];
  rows.push([entry.label]);
  rows.push(["Typ", entry.kind === "worktop" ? "Pracovná doska" : entry.result.displayName]);
  rows.push([]);

  const { rows: boardRows, partKeyToBoardLabel } = buildBoardRows(entry);
  const componentRows = buildComponentRows(entry);
  const edgeRows = buildEdgeRows(entry, partKeyToBoardLabel);

  appendBoardsSection(rows, boardRows);
  appendComponentsSection(rows, componentRows);
  appendEdgesSection(rows, edgeRows);
  appendModuleSummary(rows, entry);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 }
  ];
  return sheet;
}

function buildOverviewSheet(entries: ProjectPricingView[]) {
  const rows: CellValue[][] = [];
  rows.push(["Celkový kusovník"]);
  rows.push(["Modul", "Dosky", "Komponenty", "Edge band", "Vzorec materiál", "Materiál spolu", "Práca", "Vzorec celkom", "Celkom"]);

  const startRow = 3;
  for (let index = 0; index < entries.length; index += 1) {
    const rowNumber = startRow + index;
    const entry = entries[index]!;
    rows.push([
      entry.label,
      money(entry.result.pricing.groups.boards.cost),
      money(entry.result.pricing.groups.hardware.cost),
      money(entry.result.pricing.groups.edge_bands.cost),
      `=B${rowNumber}+C${rowNumber}+D${rowNumber}`,
      { f: `B${rowNumber}+C${rowNumber}+D${rowNumber}` },
      money(entry.result.pricing.laborCostFixed),
      `=F${rowNumber}+G${rowNumber}`,
      { f: `F${rowNumber}+G${rowNumber}` }
    ]);
  }

  const totalRow = startRow + entries.length;
  const lastEntryRow = Math.max(startRow, totalRow - 1);
  rows.push([
    "SPOLU",
    { f: `SUM(B${startRow}:B${lastEntryRow})` },
    { f: `SUM(C${startRow}:C${lastEntryRow})` },
    { f: `SUM(D${startRow}:D${lastEntryRow})` },
    `=SUM(B${startRow}:B${lastEntryRow})+SUM(C${startRow}:C${lastEntryRow})+SUM(D${startRow}:D${lastEntryRow})`,
    { f: `SUM(B${startRow}:B${lastEntryRow})+SUM(C${startRow}:C${lastEntryRow})+SUM(D${startRow}:D${lastEntryRow})` },
    { f: `SUM(G${startRow}:G${lastEntryRow})` },
    `=F${totalRow}+G${totalRow}`,
    { f: `F${totalRow}+G${totalRow}` }
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 34 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 }
  ];
  return sheet;
}

function downloadWorkbook(blobName: string, workbook: XLSX.WorkBook) {
  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx"
  });
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = blobName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportProjectPricingWorkbook(entries: ProjectPricingView[]) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  XLSX.utils.book_append_sheet(workbook, buildOverviewSheet(entries), sanitizeSheetName("Celkový kusovník", usedNames));

  for (const entry of entries) {
    XLSX.utils.book_append_sheet(workbook, buildModuleSheet(entry), sanitizeSheetName(entry.label, usedNames));
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadWorkbook(`kusovnik-${date}.xlsx`, workbook);
}
