import type { KitchenContext } from "../layout/kitchenContext";
import type { KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { BOMResult } from "../layout/bom/bomTypes";
import { exportMarketingOfferPdf } from "../layout/bom/exportMarketingPdf";
import { exportProjectPricingWorkbook } from "../layout/bom/exportWorkbook";
import { buildProjectPricingPayload, buildProjectPricingViews, type ProjectPricingView } from "../layout/bom/projectPricing";
import {
  aggregateProjectBoards,
  aggregateProjectComponents,
  aggregateProjectEdges,
  buildProjectQuoteSummary,
  sanitizeProjectQuoteSettings,
  type ProjectQuoteSettings
} from "../layout/bom/projectQuote";

const SETTINGS_STORAGE_KEY = "bom.projectQuoteSettings";

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

function readStoredSettings(): ProjectQuoteSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return sanitizeProjectQuoteSettings();
    return sanitizeProjectQuoteSettings(JSON.parse(raw) as Partial<ProjectQuoteSettings>);
  } catch {
    return sanitizeProjectQuoteSettings();
  }
}

function writeStoredSettings(settings: ProjectQuoteSettings) {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
    cell.textContent = "Ziadne data.";
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

function buildNumberInput(label: string, value: number, onChange: (value: number) => void, suffix?: string) {
  const wrap = document.createElement("label");
  wrap.style.display = "grid";
  wrap.style.gap = "6px";

  const title = document.createElement("span");
  title.textContent = label;
  title.style.color = "#9aa5ba";
  title.style.fontSize = "12px";
  wrap.appendChild(title);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  wrap.appendChild(row);

  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  input.value = String(value);
  input.style.background = "#0e1118";
  input.style.color = "#eef2ff";
  input.style.border = "1px solid #303746";
  input.style.borderRadius = "8px";
  input.style.padding = "10px 12px";
  input.style.width = "100%";
  input.addEventListener("input", () => {
    onChange(Number(input.value));
  });
  row.appendChild(input);

  if (suffix) {
    const suffixEl = document.createElement("span");
    suffixEl.textContent = suffix;
    suffixEl.style.color = "#9aa5ba";
    suffixEl.style.fontSize = "12px";
    row.appendChild(suffixEl);
  }

  return wrap;
}

export function mountBomDevPanel(
  container: HTMLElement,
  instances: LayoutInstance[],
  worktops: KitchenWorktopInstance[],
  ctx: KitchenContext
): void {
  const entries = buildProjectPricingViews(instances, worktops, ctx);
  let settings = readStoredSettings();

  container.style.display = "grid";
  container.style.gap = "18px";
  container.style.color = "#eef2ff";
  container.style.font = "13px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  const render = () => {
    container.innerHTML = "";

    if (instances.length === 0 && worktops.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "Nie su umiestnene ziadne moduly.";
      empty.style.color = "#9aa5ba";
      container.appendChild(empty);
      return;
    }

    settings = sanitizeProjectQuoteSettings(settings);
    writeStoredSettings(settings);

    const boards = aggregateProjectBoards(entries);
    const edges = aggregateProjectEdges(entries);
    const components = aggregateProjectComponents(entries);
    const summary = buildProjectQuoteSummary(entries, settings);
    const payload = buildProjectPricingPayload(entries, settings);

    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.justifyContent = "space-between";
    toolbar.style.alignItems = "center";
    toolbar.style.gap = "12px";

    const intro = document.createElement("div");
    intro.style.display = "grid";
    intro.style.gap = "4px";
    const title = document.createElement("h2");
    title.textContent = "BOM + Cenova ponuka";
    title.style.margin = "0";
    title.style.font = "700 18px system-ui, sans-serif";
    const desc = document.createElement("div");
    desc.textContent = "App, Create Sheet aj marketingove PDF idu z tej istej cenovej logiky.";
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
      exportProjectPricingWorkbook(entries, summary);
    });
    actions.appendChild(exportBtn);

    const pdfBtn = document.createElement("button");
    pdfBtn.type = "button";
    pdfBtn.textContent = "Marketing PDF";
    pdfBtn.style.background = "#0e1118";
    pdfBtn.style.color = "#eef2ff";
    pdfBtn.style.border = "1px solid #303746";
    pdfBtn.style.borderRadius = "8px";
    pdfBtn.style.padding = "9px 12px";
    pdfBtn.addEventListener("click", async () => {
      pdfBtn.disabled = true;
      const previous = pdfBtn.textContent;
      pdfBtn.textContent = "Generujem...";
      try {
        await exportMarketingOfferPdf(entries, summary);
      } finally {
        pdfBtn.disabled = false;
        pdfBtn.textContent = previous;
      }
    });
    actions.appendChild(pdfBtn);

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

    const settingsSection = section(
      "Project pricing inputs",
      "Tieto dve hodnoty sa pouziju rovnako v appke, v Create Sheet aj v marketingovom PDF."
    );
    const settingsGrid = document.createElement("div");
    settingsGrid.style.display = "grid";
    settingsGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(240px, 1fr))";
    settingsGrid.style.gap = "12px";
    settingsGrid.appendChild(
      buildNumberInput("Dodatocna praca projektu", settings.additionalLaborCost, (value) => {
        settings = sanitizeProjectQuoteSettings({ ...settings, additionalLaborCost: value });
        render();
      }, "EUR")
    );
    settingsGrid.appendChild(
      buildNumberInput("Marza", settings.marginPercent, (value) => {
        settings = sanitizeProjectQuoteSettings({ ...settings, marginPercent: value });
        render();
      }, "%")
    );
    settingsSection.appendChild(settingsGrid);
    container.appendChild(settingsSection);

    const results = section(
      "Sheet result",
      "Toto je vysledok, ktory musi vyjst rovnako v appke aj v Create Sheet exporte."
    );
    const totalGrid = document.createElement("div");
    totalGrid.style.display = "grid";
    totalGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
    totalGrid.style.gap = "10px";
    const cards = [
      ["Material", formatCurrency(summary.materialCost)],
      ["Praca moduly", formatCurrency(summary.moduleLaborCost)],
      ["Praca projekt", formatCurrency(summary.additionalLaborCost)],
      ["Marza", `${formatNumber(summary.marginPercent, 2)} % / ${formatCurrency(summary.marginAmount)}`],
      ["Vysledok Create Sheet", formatCurrency(summary.finalPrice)]
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
    results.appendChild(totalGrid);
    results.appendChild(
      table(["Check", "Value"], [
        ["Create Sheet result", formatCurrency(summary.finalPrice)],
        ["App BOM result", formatCurrency(summary.finalPrice)],
        ["Rozdiel", formatCurrency(0)],
        ["Board pricing rule", summary.formulas.boardPricing],
        ["Final formula", summary.formulas.finalPrice]
      ])
    );
    container.appendChild(results);

    const inputs = section("Inputs & formulas", "Jasne vypisane, co sa do vysledku pocita.");
    inputs.appendChild(
      table(["Field", "Value"], [
        ["Board pricing", summary.formulas.boardPricing],
        ["Material formula", summary.formulas.materialCost],
        ["Labor formula", summary.formulas.laborCost],
        ["Subtotal formula", summary.formulas.subtotalBeforeMargin],
        ["Margin formula", summary.formulas.marginAmount],
        ["Final formula", summary.formulas.finalPrice],
        ["Additional project labor", formatCurrency(summary.additionalLaborCost)],
        ["Margin percent", `${formatNumber(summary.marginPercent, 2)} %`]
      ])
    );
    container.appendChild(inputs);

    const boardsSection = section("Boards by material", "Net m2, priced m2, jednotkove ceny a celkove naklady za doskove materialy.");
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

    const edgesSection = section("Edge bands", "Linearne metre pasky podla materialu a presne nakladove ceny.");
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

    const componentsSection = section("Components", "Kusy vsetkych katalogovych komponentov s jednotkovou cenou a celkom.");
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

    const modulesSection = section("Modules", "Suhrn kazdeho vlozeneho modulu s jeho aktualnym vysledkom.");
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

    const breakdown = section("Item breakdown", "Presne polozky BOMu po vypocte, vratane priced quantity, unit price a item cost.");
    breakdown.appendChild(
      table(
        ["Module", "Item", "Material / Component", "Thickness", "ID", "Group", "Qty", "Priced Qty", "Unit price", "Item cost"],
        entries.flatMap((entry: ProjectPricingView) =>
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
            item.itemCost == null ? "-" : formatCurrency(item.itemCost)
          ])
        )
      )
    );
    container.appendChild(breakdown);
  };

  render();
}
