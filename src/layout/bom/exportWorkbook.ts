import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";
import type { PortableCommercialPricingItem, PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import type { ProjectPricingView } from "./projectPricing";

type CellValue = string | number | boolean | Date | XLSX.CellObject;
type StyleKey = keyof typeof STYLE_IDS;

type BoardRow = {
  boardLabel: string;
  dimensionsLabel: string;
  materialSourceKey: string;
  areaM2: number;
};

type EdgeRow = {
  boardLabel: string;
  sideLabel: string;
  materialSourceKey: string;
  lengthM: number;
};

type ComponentRow = {
  sourceKey: string;
  quantity: number;
};

type PriceSourceRow = {
  key: string;
  category: string;
  catalogId: string;
  label: string;
  group: string;
  unit: string;
  unitPrice: number;
};

type PriceSourceRefs = {
  category: string;
  catalogId: string;
  label: string;
  group: string;
  unit: string;
  unitPrice: string;
};

type FreezePane = {
  ySplit: number;
  topLeftCell: string;
};

type BuiltSheet = {
  name: string;
  worksheet: XLSX.WorkSheet;
  styles: Record<string, StyleKey>;
  freeze?: FreezePane;
};

type ModuleSheetRefs = {
  titleCell: string;
  typeCell: string;
  summary: {
    boards: string;
    edges: string;
    components: string;
    materials: string;
    labor: string;
    total: string;
  };
};

const STYLE_IDS = {
  title: 1,
  metaLabel: 2,
  metaValue: 3,
  sectionTitle: 4,
  header: 5,
  text: 6,
  decimal: 7,
  currency: 8,
  subtotalLabel: 9,
  subtotalDecimal: 10,
  subtotalCurrency: 11,
  summaryLabel: 12,
  summaryCurrency: 13,
  sourceHeader: 14,
  sourceText: 15,
  sourceCurrency: 16,
  totalLabel: 17,
  totalCurrency: 18,
  dateValue: 19
} as const;

class SheetBuilder {
  rows: CellValue[][] = [];
  styles = new Map<string, StyleKey>();
  merges: XLSX.Range[] = [];
  cols: XLSX.ColInfo[] = [];
  rowInfo: XLSX.RowInfo[] = [];
  freeze?: FreezePane;
  autoFilter?: string;

  addRow(cells: Array<CellValue | { value: CellValue; style?: StyleKey }>): number {
    const rowNumber = this.rows.length + 1;
    const row: CellValue[] = [];
    cells.forEach((cell, index) => {
      const value = typeof cell === "object" && cell !== null && "value" in cell ? cell.value : cell;
      const style = typeof cell === "object" && cell !== null && "value" in cell ? cell.style : undefined;
      row[index] = value;
      if (style) this.styles.set(address(rowNumber, index), style);
    });
    this.rows.push(row);
    return rowNumber;
  }

  addBlankRow(): number {
    this.rows.push([]);
    return this.rows.length;
  }

  merge(startRow: number, startCol: number, endRow: number, endCol: number) {
    this.merges.push({
      s: { r: startRow - 1, c: startCol },
      e: { r: endRow - 1, c: endCol }
    });
  }

  setRowHeight(row: number, hpt: number) {
    this.rowInfo[row - 1] = { hpt };
  }

  build(): XLSX.WorkSheet {
    const worksheet = XLSX.utils.aoa_to_sheet(this.rows);
    if (this.cols.length > 0) worksheet["!cols"] = this.cols;
    if (this.merges.length > 0) worksheet["!merges"] = this.merges;
    if (this.rowInfo.length > 0) worksheet["!rows"] = this.rowInfo;
    if (this.autoFilter) worksheet["!autofilter"] = { ref: this.autoFilter };
    return worksheet;
  }
}

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

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function address(row: number, col: number) {
  return XLSX.utils.encode_cell({ r: row - 1, c: col });
}

function formulaNumber(formula: string): XLSX.CellObject {
  return { t: "n", f: formula };
}

function formulaText(formula: string): XLSX.CellObject {
  return { t: "str", f: formula };
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

function resolvePriceSource(item: PortableCommercialPricingItem): PriceSourceRow {
  if (item.itemType === "hardware") {
    const catalogId = item.component?.catalogId ?? item.id;
    return {
      key: `hardware:${catalogId}`,
      category: "Komponent",
      catalogId,
      label: item.component?.displayName ?? item.description ?? item.name,
      group: item.component?.componentType ?? item.pricingGroup ?? "hardware",
      unit: item.pricingUnit ?? "pcs",
      unitPrice: money(item.unitPrice ?? 0)
    };
  }

  const catalogId = item.material?.catalogId ?? item.id;
  return {
    key: `${item.itemType}:${catalogId}`,
    category: item.itemType === "edge_band" ? "Olepovanie" : "Doskový materiál",
    catalogId,
    label: item.material?.displayName ?? item.description ?? item.name,
    group: item.material?.family ?? item.materialGroup ?? item.pricingGroup ?? "material",
    unit: item.pricingUnit ?? (item.itemType === "edge_band" ? "lm" : "m2"),
    unitPrice: money(item.unitPrice ?? 0)
  };
}

function buildPriceSourceRows(entries: ProjectPricingView[]) {
  const sourceMap = new Map<string, PriceSourceRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      const source = resolvePriceSource(item);
      const existing = sourceMap.get(source.key);
      if (!existing) {
        sourceMap.set(source.key, source);
        continue;
      }
      if (!existing.unitPrice && source.unitPrice) existing.unitPrice = source.unitPrice;
      if (!existing.group && source.group) existing.group = source.group;
      if (!existing.label && source.label) existing.label = source.label;
    }
  }
  return [...sourceMap.values()].sort((left, right) =>
    left.category.localeCompare(right.category) ||
    left.label.localeCompare(right.label) ||
    left.catalogId.localeCompare(right.catalogId)
  );
}

function buildBoardRows(entry: ProjectPricingView) {
  const rows: BoardRow[] = [];
  const partKeyToBoardLabel = new Map<string, string>();

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "board") continue;
    const count = quantityCount(item.quantity);
    const totalArea = item.metrics?.areaM2 ?? item.pricingQuantityBase ?? item.pricingQuantity ?? 0;
    const perBoardArea = count > 0 ? totalArea / count : totalArea;
    const partIds = item.sourcePartIds?.length ? item.sourcePartIds : [item.id];
    const source = resolvePriceSource(item);

    for (let index = 0; index < count; index += 1) {
      const ordinal = count > 1 ? ` ${index + 1}` : "";
      const partKey = partIds[Math.min(index, partIds.length - 1)] ?? `${item.id}:${index + 1}`;
      const boardLabel = `${translateBoardDescription(item.description)}${ordinal}`;
      rows.push({
        boardLabel,
        dimensionsLabel: formatDimensions(item),
        materialSourceKey: source.key,
        areaM2: round(perBoardArea, 4)
      });
      partKeyToBoardLabel.set(partKey, boardLabel);
    }
  }

  return { rows, partKeyToBoardLabel };
}

function buildEdgeRows(entry: ProjectPricingView, boardMap: Map<string, string>) {
  const rows: EdgeRow[] = [];

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "edge_band") continue;
    const sourcePartIds = item.sourcePartIds?.length ? item.sourcePartIds : [];
    const rowCount = Math.max(sourcePartIds.length, quantityCount(item.quantity));
    const totalLengthM = item.metrics?.edgeLengthLm ?? item.pricingQuantity ?? 0;
    const perBoardLengthM = rowCount > 0 ? totalLengthM / rowCount : totalLengthM;
    const sideLabel = translateEdgeNotes(item.notes);
    const source = resolvePriceSource(item);

    for (let index = 0; index < rowCount; index += 1) {
      const partKey = sourcePartIds[Math.min(index, sourcePartIds.length - 1)] ?? `${item.id}:${index + 1}`;
      rows.push({
        boardLabel: boardMap.get(partKey) ?? translateBoardDescription(item.description),
        sideLabel,
        materialSourceKey: source.key,
        lengthM: round(perBoardLengthM, 4)
      });
    }
  }

  return rows;
}

function buildComponentRows(entry: ProjectPricingView) {
  const buckets = new Map<string, ComponentRow>();

  for (const item of entry.result.pricing.items) {
    if (item.itemType !== "hardware") continue;
    const source = resolvePriceSource(item);
    const existing = buckets.get(source.key) ?? {
      sourceKey: source.key,
      quantity: 0
    };
    existing.quantity += item.pricingQuantity ?? item.quantity ?? 0;
    buckets.set(source.key, existing);
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      quantity: round(row.quantity, 4)
    }))
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function buildPriceSourceSheet(sheetName: string, sources: PriceSourceRow[]): BuiltSheet & { refs: Map<string, PriceSourceRefs> } {
  const builder = new SheetBuilder();
  builder.cols = [{ wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 14 }];

  const titleRow = builder.addRow([{ value: "Zdroj cien a názvov", style: "title" }]);
  builder.merge(titleRow, 0, titleRow, 5);
  builder.setRowHeight(titleRow, 24);

  const headerRow = builder.addRow([
    { value: "Kategória", style: "sourceHeader" },
    { value: "Catalog ID", style: "sourceHeader" },
    { value: "Názov", style: "sourceHeader" },
    { value: "Skupina", style: "sourceHeader" },
    { value: "Jednotka", style: "sourceHeader" },
    { value: "Jedn. cena", style: "sourceHeader" }
  ]);
  builder.autoFilter = `A${headerRow}:F${headerRow + Math.max(sources.length, 1)}`;
  builder.freeze = { ySplit: 2, topLeftCell: "A3" };

  const refs = new Map<string, PriceSourceRefs>();
  for (const source of sources) {
    const row = builder.addRow([
      { value: source.category, style: "sourceText" },
      { value: source.catalogId, style: "sourceText" },
      { value: source.label, style: "sourceText" },
      { value: source.group, style: "sourceText" },
      { value: source.unit, style: "sourceText" },
      { value: source.unitPrice, style: "sourceCurrency" }
    ]);
    refs.set(source.key, {
      category: `${quoteSheetName(sheetName)}!$A$${row}`,
      catalogId: `${quoteSheetName(sheetName)}!$B$${row}`,
      label: `${quoteSheetName(sheetName)}!$C$${row}`,
      group: `${quoteSheetName(sheetName)}!$D$${row}`,
      unit: `${quoteSheetName(sheetName)}!$E$${row}`,
      unitPrice: `${quoteSheetName(sheetName)}!$F$${row}`
    });
  }

  return {
    name: sheetName,
    worksheet: builder.build(),
    styles: Object.fromEntries(builder.styles),
    freeze: builder.freeze,
    refs
  };
}

function buildModuleSheet(args: {
  entry: ProjectPricingView;
  sheetName: string;
  priceRefs: Map<string, PriceSourceRefs>;
}): BuiltSheet & { refs: ModuleSheetRefs } {
  const { entry, priceRefs } = args;
  const builder = new SheetBuilder();
  builder.cols = [{ wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const titleRow = builder.addRow([{ value: entry.label, style: "title" }]);
  builder.merge(titleRow, 0, titleRow, 5);
  builder.setRowHeight(titleRow, 24);

  const typeLabel = entry.kind === "worktop" ? "Pracovná doska" : entry.result.displayName;
  builder.addRow([
    { value: "Typ", style: "metaLabel" },
    { value: typeLabel, style: "metaValue" },
    "",
    { value: "Práca", style: "metaLabel" },
    { value: entry.result.pricing.laborCostFixed, style: "currency" }
  ]);
  builder.addBlankRow();

  const { rows: boardRows, partKeyToBoardLabel } = buildBoardRows(entry);
  const edgeRows = buildEdgeRows(entry, partKeyToBoardLabel);
  const componentRows = buildComponentRows(entry);

  const boardsTitleRow = builder.addRow([{ value: "Dosky", style: "sectionTitle" }]);
  builder.merge(boardsTitleRow, 0, boardsTitleRow, 5);
  const boardsHeaderRow = builder.addRow([
    { value: "Položka", style: "header" },
    { value: "Rozmer (mm)", style: "header" },
    { value: "Materiál", style: "header" },
    { value: "Plocha (m2)", style: "header" },
    { value: "Cena / m2", style: "header" },
    { value: "Cena", style: "header" }
  ]);
  const boardDataStart = boardsHeaderRow + 1;
  for (const row of boardRows) {
    const refs = priceRefs.get(row.materialSourceKey);
    builder.addRow([
      { value: row.boardLabel, style: "text" },
      { value: row.dimensionsLabel, style: "text" },
      { value: refs ? formulaText(refs.label) : "-", style: "text" },
      { value: row.areaM2, style: "decimal" },
      { value: refs ? formulaNumber(refs.unitPrice) : 0, style: "currency" },
      { value: formulaNumber(`D${builder.rows.length + 1}*E${builder.rows.length + 1}`), style: "currency" }
    ]);
  }
  const boardSubtotalRow = builder.addRow([
    { value: "Spolu dosky", style: "subtotalLabel" },
    "",
    "",
    { value: formulaNumber(boardRows.length ? `SUM(D${boardDataStart}:D${builder.rows.length})` : "0"), style: "subtotalDecimal" },
    "",
    { value: formulaNumber(boardRows.length ? `SUM(F${boardDataStart}:F${builder.rows.length})` : "0"), style: "subtotalCurrency" }
  ]);
  builder.addBlankRow();

  const edgesTitleRow = builder.addRow([{ value: "Olepovanie", style: "sectionTitle" }]);
  builder.merge(edgesTitleRow, 0, edgesTitleRow, 5);
  const edgesHeaderRow = builder.addRow([
    { value: "Doska", style: "header" },
    { value: "Hrana", style: "header" },
    { value: "Materiál", style: "header" },
    { value: "Dĺžka (m)", style: "header" },
    { value: "Cena / m", style: "header" },
    { value: "Cena", style: "header" }
  ]);
  const edgeDataStart = edgesHeaderRow + 1;
  for (const row of edgeRows) {
    const refs = priceRefs.get(row.materialSourceKey);
    builder.addRow([
      { value: row.boardLabel, style: "text" },
      { value: row.sideLabel, style: "text" },
      { value: refs ? formulaText(refs.label) : "-", style: "text" },
      { value: row.lengthM, style: "decimal" },
      { value: refs ? formulaNumber(refs.unitPrice) : 0, style: "currency" },
      { value: formulaNumber(`D${builder.rows.length + 1}*E${builder.rows.length + 1}`), style: "currency" }
    ]);
  }
  const edgeSubtotalRow = builder.addRow([
    { value: "Spolu olepovanie", style: "subtotalLabel" },
    "",
    "",
    { value: formulaNumber(edgeRows.length ? `SUM(D${edgeDataStart}:D${builder.rows.length})` : "0"), style: "subtotalDecimal" },
    "",
    { value: formulaNumber(edgeRows.length ? `SUM(F${edgeDataStart}:F${builder.rows.length})` : "0"), style: "subtotalCurrency" }
  ]);
  builder.addBlankRow();

  const componentsTitleRow = builder.addRow([{ value: "Komponenty", style: "sectionTitle" }]);
  builder.merge(componentsTitleRow, 0, componentsTitleRow, 5);
  const componentsHeaderRow = builder.addRow([
    { value: "Komponent", style: "header" },
    { value: "Catalog ID", style: "header" },
    { value: "Typ", style: "header" },
    { value: "Počet", style: "header" },
    { value: "Cena / ks", style: "header" },
    { value: "Cena", style: "header" }
  ]);
  const componentDataStart = componentsHeaderRow + 1;
  for (const row of componentRows) {
    const refs = priceRefs.get(row.sourceKey);
    builder.addRow([
      { value: refs ? formulaText(refs.label) : "-", style: "text" },
      { value: refs ? formulaText(refs.catalogId) : "-", style: "text" },
      { value: refs ? formulaText(refs.group) : "-", style: "text" },
      { value: row.quantity, style: "decimal" },
      { value: refs ? formulaNumber(refs.unitPrice) : 0, style: "currency" },
      { value: formulaNumber(`D${builder.rows.length + 1}*E${builder.rows.length + 1}`), style: "currency" }
    ]);
  }
  const componentSubtotalRow = builder.addRow([
    { value: "Spolu komponenty", style: "subtotalLabel" },
    "",
    "",
    { value: formulaNumber(componentRows.length ? `SUM(D${componentDataStart}:D${builder.rows.length})` : "0"), style: "subtotalDecimal" },
    "",
    { value: formulaNumber(componentRows.length ? `SUM(F${componentDataStart}:F${builder.rows.length})` : "0"), style: "subtotalCurrency" }
  ]);
  builder.addBlankRow();

  const summaryTitleRow = builder.addRow([{ value: "Finančný súhrn", style: "sectionTitle" }]);
  builder.merge(summaryTitleRow, 0, summaryTitleRow, 1);
  const summaryBoardsRow = builder.addRow([
    { value: "Dosky", style: "summaryLabel" },
    { value: formulaNumber(`F${boardSubtotalRow}`), style: "summaryCurrency" }
  ]);
  const summaryEdgesRow = builder.addRow([
    { value: "Olepovanie", style: "summaryLabel" },
    { value: formulaNumber(`F${edgeSubtotalRow}`), style: "summaryCurrency" }
  ]);
  const summaryComponentsRow = builder.addRow([
    { value: "Komponenty", style: "summaryLabel" },
    { value: formulaNumber(`F${componentSubtotalRow}`), style: "summaryCurrency" }
  ]);
  const summaryMaterialsRow = builder.addRow([
    { value: "Materiál spolu", style: "summaryLabel" },
    { value: formulaNumber(`SUM(B${summaryBoardsRow}:B${summaryComponentsRow})`), style: "summaryCurrency" }
  ]);
  const summaryLaborRow = builder.addRow([
    { value: "Práca", style: "summaryLabel" },
    { value: formulaNumber("E2"), style: "summaryCurrency" }
  ]);
  const summaryTotalRow = builder.addRow([
    { value: "Celkom", style: "totalLabel" },
    { value: formulaNumber(`B${summaryMaterialsRow}+B${summaryLaborRow}`), style: "totalCurrency" }
  ]);

  builder.freeze = { ySplit: 6, topLeftCell: "A7" };

  return {
    name: args.sheetName,
    worksheet: builder.build(),
    styles: Object.fromEntries(builder.styles),
    freeze: builder.freeze,
    refs: {
      titleCell: "A1",
      typeCell: "B2",
      summary: {
        boards: `B${summaryBoardsRow}`,
        edges: `B${summaryEdgesRow}`,
        components: `B${summaryComponentsRow}`,
        materials: `B${summaryMaterialsRow}`,
        labor: `B${summaryLaborRow}`,
        total: `B${summaryTotalRow}`
      }
    }
  };
}

function buildOverviewSheet(moduleSheets: Array<{ name: string; refs: ModuleSheetRefs }>): BuiltSheet {
  const builder = new SheetBuilder();
  builder.cols = [{ wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];

  const titleRow = builder.addRow([{ value: "Kusovník a náklady projektu", style: "title" }]);
  builder.merge(titleRow, 0, titleRow, 7);
  builder.setRowHeight(titleRow, 24);

  builder.addRow([
    { value: "Vygenerované", style: "metaLabel" },
    { value: new Date(), style: "dateValue" }
  ]);
  builder.addBlankRow();

  const headerRow = builder.addRow([
    { value: "Modul", style: "header" },
    { value: "Typ", style: "header" },
    { value: "Dosky", style: "header" },
    { value: "Olepovanie", style: "header" },
    { value: "Komponenty", style: "header" },
    { value: "Materiál spolu", style: "header" },
    { value: "Práca", style: "header" },
    { value: "Celkom", style: "header" }
  ]);
  builder.autoFilter = `A${headerRow}:H${headerRow + Math.max(moduleSheets.length, 1)}`;

  for (const moduleSheet of moduleSheets) {
    const sheetRef = quoteSheetName(moduleSheet.name);
    builder.addRow([
      { value: formulaText(`${sheetRef}!${moduleSheet.refs.titleCell}`), style: "text" },
      { value: formulaText(`${sheetRef}!${moduleSheet.refs.typeCell}`), style: "text" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.boards}`), style: "currency" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.edges}`), style: "currency" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.components}`), style: "currency" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.materials}`), style: "currency" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.labor}`), style: "currency" },
      { value: formulaNumber(`${sheetRef}!${moduleSheet.refs.summary.total}`), style: "currency" }
    ]);
  }

  const totalRow = builder.addRow([
    { value: "SPOLU", style: "totalLabel" },
    "",
    { value: formulaNumber(moduleSheets.length ? `SUM(C${headerRow + 1}:C${builder.rows.length})` : "0"), style: "totalCurrency" },
    { value: formulaNumber(moduleSheets.length ? `SUM(D${headerRow + 1}:D${builder.rows.length})` : "0"), style: "totalCurrency" },
    { value: formulaNumber(moduleSheets.length ? `SUM(E${headerRow + 1}:E${builder.rows.length})` : "0"), style: "totalCurrency" },
    { value: formulaNumber(moduleSheets.length ? `SUM(F${headerRow + 1}:F${builder.rows.length})` : "0"), style: "totalCurrency" },
    { value: formulaNumber(moduleSheets.length ? `SUM(G${headerRow + 1}:G${builder.rows.length})` : "0"), style: "totalCurrency" },
    { value: formulaNumber(moduleSheets.length ? `SUM(H${headerRow + 1}:H${builder.rows.length})` : "0"), style: "totalCurrency" }
  ]);
  builder.setRowHeight(totalRow, 20);
  builder.freeze = { ySplit: 4, topLeftCell: "A5" };

  return {
    name: "Prehľad",
    worksheet: builder.build(),
    styles: Object.fromEntries(builder.styles),
    freeze: builder.freeze
  };
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0.0000"/>
    <numFmt numFmtId="165" formatCode="#,##0.00&quot; €&quot;"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><color rgb="1F2937"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFF"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="1F2937"/><name val="Aptos"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="475467"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="16324F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="244E6E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="D8E7F5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="EEF4FA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="F3F4F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="CBD5E1"/></left>
      <right style="thin"><color rgb="CBD5E1"/></right>
      <top style="thin"><color rgb="CBD5E1"/></top>
      <bottom style="thin"><color rgb="CBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="20">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="165" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="165" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;
}

function applyCellStyles(xml: string, styles: Record<string, StyleKey>) {
  let nextXml = xml;
  for (const [cellAddress, styleKey] of Object.entries(styles)) {
    const styleId = STYLE_IDS[styleKey];
    const cellPattern = new RegExp(`<c([^>]*\\br="${cellAddress}"[^>]*)>`, "g");
    nextXml = nextXml.replace(cellPattern, (match, attrs: string) => {
      const updated = /\bs="[^"]*"/.test(attrs)
        ? attrs.replace(/\bs="[^"]*"/, `s="${styleId}"`)
        : `${attrs} s="${styleId}"`;
      return `<c${updated}>`;
    });
  }
  return nextXml;
}

function applyFreezePane(xml: string, freeze?: FreezePane) {
  if (!freeze) return xml;
  const paneXml = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze.ySplit}" topLeftCell="${freeze.topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${freeze.topLeftCell}" sqref="${freeze.topLeftCell}"/></sheetView></sheetViews>`;
  if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) {
    return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, paneXml);
  }
  return xml.replace(/(<worksheet[^>]*>)/, `$1${paneXml}`);
}

function ensureWorkbookRecalc(xml: string) {
  const calcPr = `<calcPr calcId="171027" fullCalcOnLoad="1" forceFullCalc="1"/>`;
  if (/<calcPr[^>]*\/>/.test(xml)) {
    return xml.replace(/<calcPr[^>]*\/>/, calcPr);
  }
  return xml.replace("</workbook>", `${calcPr}</workbook>`);
}

function applyWorkbookTheme(data: ArrayBuffer, sheets: BuiltSheet[]) {
  const archive = unzipSync(new Uint8Array(data));
  archive["xl/styles.xml"] = strToU8(buildStylesXml());
  archive["xl/workbook.xml"] = strToU8(ensureWorkbookRecalc(strFromU8(archive["xl/workbook.xml"])));

  sheets.forEach((sheet, index) => {
    const sheetPath = `xl/worksheets/sheet${index + 1}.xml`;
    const original = archive[sheetPath];
    if (!original) return;
    let xml = strFromU8(original);
    xml = applyCellStyles(xml, sheet.styles);
    xml = applyFreezePane(xml, sheet.freeze);
    archive[sheetPath] = strToU8(xml);
  });

  return zipSync(archive, { level: 6 });
}

function downloadWorkbook(blobName: string, bytes: Uint8Array) {
  const blob = new Blob([bytes], {
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
  const usedNames = new Set<string>();
  const overviewName = sanitizeSheetName("Prehľad", usedNames);
  const priceSheetName = sanitizeSheetName("Cennik", usedNames);
  const priceSources = buildPriceSourceRows(entries);
  const priceSheet = buildPriceSourceSheet(priceSheetName, priceSources);

  const moduleSheets = entries.map((entry) => {
    const sheetName = sanitizeSheetName(entry.label, usedNames);
    return buildModuleSheet({
      entry,
      sheetName,
      priceRefs: priceSheet.refs
    });
  });

  const overviewSheet = buildOverviewSheet(moduleSheets);
  overviewSheet.name = overviewName;

  const workbook = XLSX.utils.book_new();
  const orderedSheets: BuiltSheet[] = [overviewSheet, ...moduleSheets, priceSheet];
  for (const sheet of orderedSheets) {
    XLSX.utils.book_append_sheet(workbook, sheet.worksheet, sheet.name);
  }

  workbook.Workbook = {
    Sheets: orderedSheets.map((sheet, index) => ({
      name: sheet.name,
      Hidden: index === orderedSheets.length - 1 ? 1 : 0
    }))
  };

  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true
  });
  const styledWorkbook = applyWorkbookTheme(data, orderedSheets);
  const date = new Date().toISOString().slice(0, 10);
  downloadWorkbook(`kusovnik-${date}.xlsx`, styledWorkbook);
}
