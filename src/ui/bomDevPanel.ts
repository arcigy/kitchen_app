import type { KitchenContext } from "../layout/kitchenContext";
import type { KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { BOMResult } from "../layout/bom/bomTypes";
import { exportProjectPricingWorkbook } from "../layout/bom/exportWorkbook";
import { buildProjectPricingPayload, buildProjectPricingViews, type ProjectPricingView } from "../layout/bom/projectPricing";

type CatalogAggregateRow = {
  catalogId: string;
  displayName: string;
  unitPrice: number;
  quantity: number;
  pricedQuantity?: number;
  cost: number;
  unit: string;
  group?: string;
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

function table(headers: string[], rows: string[][]) {
  const wrap = document.createElement("div");
  wrap.style.overflow = "auto";
  wrap.style.border = "1px solid #2a3140";
  wrap.style.borderRadius = "10px";
  wrap.style.background = "#0d1117";

  const element = document.createElement("table");
  element.style.width = "100%";
  element.style.borderCollapse = "collapse";
  element.style.fontSize = "12px";
  wrap.appendChild(element);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.padding = "10px 12px";
    th.style.borderBottom = "1px solid #2a3140";
    th.style.color = "#9aa5ba";
    th.style.position = "sticky";
    th.style.top = "0";
    th.style.background = "#0d1117";
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  element.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = headers.length;
    cell.textContent = "Žiadne dáta.";
    cell.style.padding = "12px";
    cell.style.color = "#9aa5ba";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    for (const values of rows) {
      const row = document.createElement("tr");
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        cell.style.padding = "10px 12px";
        cell.style.borderBottom = "1px solid #171c25";
        cell.style.verticalAlign = "top";
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
  }
  element.appendChild(tbody);
  return wrap;
}

function section(title: string, description?: string) {
  const wrap = document.createElement("section");
  wrap.style.display = "grid";
  wrap.style.gap = "10px";

  const heading = document.createElement("div");
  heading.style.display = "grid";
  heading.style.gap = "4px";

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  titleEl.style.margin = "0";
  titleEl.style.font = "700 15px system-ui, sans-serif";
  titleEl.style.color = "#eef2ff";
  heading.appendChild(titleEl);

  if (description) {
    const desc = document.createElement("div");
    desc.textContent = description;
    desc.style.color = "#9aa5ba";
    desc.style.fontSize = "12px";
    heading.appendChild(desc);
  }

  wrap.appendChild(heading);
  return wrap;
}

function aggregateBoards(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      if (item.pricingGroup !== "boards" || !item.material?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          unitPrice: item.unitPrice,
          quantity: 0,
          pricedQuantity: 0,
          cost: 0,
          unit: "m2",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantityBase ?? item.metrics?.areaM2 ?? item.pricingQuantity;
      existing.pricedQuantity = (existing.pricedQuantity ?? 0) + item.pricingQuantity;
      existing.cost += item.itemCost;
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function aggregateEdges(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      if (item.pricingGroup !== "edge_bands" || !item.material?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          unitPrice: item.unitPrice,
          quantity: 0,
          cost: 0,
          unit: "lm",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantity;
      existing.cost += item.itemCost;
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function aggregateComponents(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      const component = item.component;
      if (item.pricingGroup !== "hardware" || !component?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(component.catalogId) ??
        {
          catalogId: component.catalogId,
          displayName: component.displayName,
          unitPrice: item.unitPrice,
          quantity: 0,
          cost: 0,
          unit: "pcs",
          group: component.componentType
        };
      existing.quantity += item.pricingQuantity;
      existing.cost += item.itemCost;
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function itemDisplayName(item: BOMResult["pricing"]["items"][number]) {
  if (item.description?.trim()) return item.description.trim();
  const dashed = item.name.split(" - ");
  return dashed[dashed.length - 1]?.trim() || item.name;
}

function itemResourceLabel(item: BOMResult["pricing"]["items"][number]) {
  if (item.material?.displayName) return item.material.displayName;
  if (item.component?.displayName) return item.component.displayName;
  return "-";
}

function itemThicknessLabel(item: BOMResult["pricing"]["items"][number]) {
  if (item.dimensionsMm?.thickness && Number.isFinite(item.dimensionsMm.thickness)) {
    return `${formatNumber(item.dimensionsMm.thickness, 2)} mm`;
  }
  if (item.material?.defaultThicknessMm && Number.isFinite(item.material.defaultThicknessMm)) {
    return `${formatNumber(item.material.defaultThicknessMm, 2)} mm`;
  }
  return "";
}

export function mountBomDevPanel(
  container: HTMLElement,
  instances: LayoutInstance[],
  worktops: KitchenWorktopInstance[],
  ctx: KitchenContext
): void {
  container.innerHTML = "";
  container.style.display = "grid";
  container.style.gap = "18px";
  container.style.color = "#eef2ff";
  container.style.font = "13px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  if (instances.length === 0 && worktops.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "Nie sú umiestnené žiadne moduly.";
    empty.style.color = "#9aa5ba";
    container.appendChild(empty);
    return;
  }

  const entries = buildProjectPricingViews(instances, worktops, ctx);
  const boards = aggregateBoards(entries);
  const edges = aggregateEdges(entries);
  const components = aggregateComponents(entries);
  const payload = buildProjectPricingPayload(entries);

  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.alignItems = "center";
  toolbar.style.gap = "12px";

  const intro = document.createElement("div");
  intro.style.display = "grid";
  intro.style.gap = "4px";
  const title = document.createElement("h2");
  title.textContent = "Commercial BOM & Costs";
  title.style.margin = "0";
  title.style.font = "700 18px system-ui, sans-serif";
  const desc = document.createElement("div");
  desc.textContent = "Plný prehľad vstupov, cien, vzorcov a výsledných nákladov pre všetky aktuálne vložené moduly.";
  desc.style.color = "#9aa5ba";
  desc.style.fontSize = "12px";
  intro.append(title, desc);
  toolbar.appendChild(intro);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "10px";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.textContent = "Create Sheet";
  exportBtn.style.background = "#0e1118";
  exportBtn.style.color = "#eef2ff";
  exportBtn.style.border = "1px solid #303746";
  exportBtn.style.borderRadius = "8px";
  exportBtn.style.padding = "9px 12px";
  exportBtn.addEventListener("click", () => {
    exportProjectPricingWorkbook(entries);
  });
  actions.appendChild(exportBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy Pricing JSON";
  copyBtn.style.background = "#0e1118";
  copyBtn.style.color = "#eef2ff";
  copyBtn.style.border = "1px solid #303746";
  copyBtn.style.borderRadius = "8px";
  copyBtn.style.padding = "9px 12px";
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy Pricing JSON";
    }, 1200);
  });
  actions.appendChild(copyBtn);
  toolbar.appendChild(actions);
  container.appendChild(toolbar);

  const totals = section("Totals", "Nákladový súčet naprieč všetkými modulmi v aktuálnom projekte.");
  const totalGrid = document.createElement("div");
  totalGrid.style.display = "grid";
  totalGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
  totalGrid.style.gap = "10px";
  const cards = [
    ["Boards", formatCurrency(payload.totals.boardsCost)],
    ["Edge Bands", formatCurrency(payload.totals.edgesCost)],
    ["Hardware", formatCurrency(payload.totals.hardwareCost)],
    ["Labor", formatCurrency(payload.totals.laborCost)],
    ["Final Cost", formatCurrency(payload.totals.finalCost)]
  ];
  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.style.padding = "14px";
    card.style.border = "1px solid #2a3140";
    card.style.borderRadius = "12px";
    card.style.background = "#0d1117";
    card.style.display = "grid";
    card.style.gap = "4px";
    const labelEl = document.createElement("div");
    labelEl.textContent = label;
    labelEl.style.color = "#9aa5ba";
    labelEl.style.fontSize = "12px";
    const valueEl = document.createElement("div");
    valueEl.textContent = value;
    valueEl.style.font = "700 20px system-ui, sans-serif";
    card.append(labelEl, valueEl);
    totalGrid.appendChild(card);
  }
  totals.appendChild(totalGrid);
  container.appendChild(totals);

  const inputs = section("Inputs & Formulas", "Všetky aktívne vstupy kalkulácie, ktoré pricing runtime používa.");
  inputs.appendChild(
    table(
      ["Field", "Value"],
      [
        ["Currency", entries[0]?.result.pricing.priceInputs.currency ?? "EUR"],
        ["Board waste multiplier", formatNumber(entries[0]?.result.pricing.priceInputs.boardWasteMultiplier ?? 1.1, 2)],
        ["Labor fixed per module", formatCurrency(entries[0]?.result.pricing.laborCostFixed ?? 0)],
        ["Formula / board priced quantity", entries[0]?.result.pricing.calculationFormulas.boardPricedQuantity ?? ""],
        ["Formula / item cost", entries[0]?.result.pricing.calculationFormulas.itemCost ?? ""],
        ["Formula / subtotal", entries[0]?.result.pricing.calculationFormulas.subtotalCost ?? ""],
        ["Formula / final", entries[0]?.result.pricing.calculationFormulas.finalPrice ?? ""]
      ]
    )
  );
  container.appendChild(inputs);

  const boardsSection = section("Boards By Material", "Net m2, priced m2, jednotkové ceny a celkové náklady za doskové materiály.");
  boardsSection.appendChild(
    table(
      ["Material", "Catalog ID", "Group", "Net m2", "Priced m2", "Unit price", "Cost"],
      boards.map((row) => [
        row.displayName,
        row.catalogId,
        row.group ?? "",
        formatNumber(row.quantity),
        formatNumber(row.pricedQuantity ?? row.quantity),
        formatCurrency(row.unitPrice),
        formatCurrency(row.cost)
      ])
    )
  );
  container.appendChild(boardsSection);

  const edgesSection = section("Edge Bands", "Lineárne metre pásky podľa materiálu a presné nákladové ceny.");
  edgesSection.appendChild(
    table(
      ["Material", "Catalog ID", "Group", "Length lm", "Unit price", "Cost"],
      edges.map((row) => [
        row.displayName,
        row.catalogId,
        row.group ?? "",
        formatNumber(row.quantity),
        formatCurrency(row.unitPrice),
        formatCurrency(row.cost)
      ])
    )
  );
  container.appendChild(edgesSection);

  const componentsSection = section("Components", "Kusy všetkých katalogových komponentov s jednotkovou cenou a celkom.");
  componentsSection.appendChild(
    table(
      ["Component", "Catalog ID", "Type", "Pieces", "Unit price", "Cost"],
      components.map((row) => [
        row.displayName,
        row.catalogId,
        row.group ?? "",
        formatNumber(row.quantity),
        formatCurrency(row.unitPrice),
        formatCurrency(row.cost)
      ])
    )
  );
  container.appendChild(componentsSection);

  const modulesSection = section("Modules", "Súhrn každého vloženého modulu s jeho aktuálnym výsledkom.");
  modulesSection.appendChild(
    table(
      ["Module", "Boards", "Edges", "Hardware", "Labor", "Final"],
      entries.map((entry) => [
        entry.label,
        formatCurrency(entry.result.pricing.groups.boards.cost),
        formatCurrency(entry.result.pricing.groups.edge_bands.cost),
        formatCurrency(entry.result.pricing.groups.hardware.cost),
        formatCurrency(entry.result.pricing.laborCostFixed),
        formatCurrency(entry.result.pricing.finalPrice)
      ])
    )
  );
  container.appendChild(modulesSection);

  const breakdown = section("Item Breakdown", "Presné položky BOMu po výpočte, vrátane priced quantity, unit price a cost formula.");
  breakdown.appendChild(
    table(
      ["Module", "Item", "Material / Component", "Thickness", "ID", "Group", "Qty", "Priced Qty", "Unit price", "Item cost", "Formula"],
      entries.flatMap((entry) =>
        entry.result.pricing.items.map((item) => [
          entry.label,
          itemDisplayName(item),
          itemResourceLabel(item),
          itemThicknessLabel(item),
          item.id,
          item.pricingGroup ?? "",
          formatNumber(item.quantity),
          formatNumber(item.pricingQuantity),
          item.unitPrice == null ? "-" : formatCurrency(item.unitPrice),
          item.itemCost == null ? "-" : formatCurrency(item.itemCost),
          item.itemCostFormula ?? ""
        ])
      )
    )
  );
  container.appendChild(breakdown);
}
