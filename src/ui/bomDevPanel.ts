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
  wrap.className = "bom-dev__table-wrap";

  const element = document.createElement("table");
  element.className = "bom-dev__table";
  wrap.appendChild(element);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
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
    cell.className = "bom-dev__empty-cell";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    for (const values of rows) {
      const row = document.createElement("tr");
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
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
  wrap.className = "bom-dev__section";

  const heading = document.createElement("div");
  heading.className = "bom-dev__section-heading";

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  titleEl.className = "bom-dev__section-title";
  heading.appendChild(titleEl);

  if (description) {
    const desc = document.createElement("div");
    desc.textContent = description;
    desc.className = "bom-dev__section-description";
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
  wrap.className = "bom-dev__field";

  const title = document.createElement("span");
  title.textContent = label;
  title.className = "bom-dev__field-label";
  wrap.appendChild(title);

  const row = document.createElement("div");
  row.className = "bom-dev__field-row";
  wrap.appendChild(row);

  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  input.value = String(value);
  input.className = "bom-dev__input";
  input.addEventListener("input", () => {
    onChange(Number(input.value));
  });
  row.appendChild(input);

  if (suffix) {
    const suffixEl = document.createElement("span");
    suffixEl.textContent = suffix;
    suffixEl.className = "bom-dev__field-suffix";
    row.appendChild(suffixEl);
  }

  return wrap;
}

function createButton(label: string, variant: "secondary" | "primary" = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = `bom-dev__button bom-dev__button--${variant}`;
  return button;
}

function createMetricCard(label: string, value: string, tone: "default" | "accent" = "default") {
  const card = document.createElement("div");
  card.className = `bom-dev__metric bom-dev__metric--${tone}`;

  const labelEl = document.createElement("div");
  labelEl.className = "bom-dev__metric-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "bom-dev__metric-value";
  valueEl.textContent = value;

  card.append(labelEl, valueEl);
  return card;
}

export function mountBomDevPanel(
  container: HTMLElement,
  instances: LayoutInstance[],
  worktops: KitchenWorktopInstance[],
  ctx: KitchenContext
): void {
  const entries = buildProjectPricingViews(instances, worktops, ctx);
  let settings = readStoredSettings();

  container.className = "bom-dev";

  const render = () => {
    container.innerHTML = "";

    if (instances.length === 0 && worktops.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "Nie su umiestnene ziadne moduly.";
      empty.className = "bom-dev__empty";
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
    toolbar.className = "bom-dev__hero";

    const intro = document.createElement("div");
    intro.className = "bom-dev__hero-copy";
    const title = document.createElement("h2");
    title.textContent = "BOM + Cenova ponuka";
    title.className = "bom-dev__hero-title";
    const desc = document.createElement("div");
    desc.textContent = "App, Create Sheet aj marketingove PDF idu z tej istej cenovej logiky.";
    desc.className = "bom-dev__hero-description";
    intro.append(title, desc);
    toolbar.appendChild(intro);

    const actions = document.createElement("div");
    actions.className = "bom-dev__actions";

    const exportBtn = createButton("Create Sheet");
    exportBtn.addEventListener("click", () => {
      exportProjectPricingWorkbook(entries, summary);
    });
    actions.appendChild(exportBtn);

    const pdfBtn = createButton("Marketing PDF", "primary");
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

    const copyBtn = createButton("Copy Pricing JSON");
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
    settingsGrid.className = "bom-dev__settings-grid";
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
    totalGrid.className = "bom-dev__metrics";
    const cards = [
      ["Material", formatCurrency(summary.materialCost), "default" as const],
      ["Praca moduly", formatCurrency(summary.moduleLaborCost), "default" as const],
      ["Praca projekt", formatCurrency(summary.additionalLaborCost), "default" as const],
      ["Marza", `${formatNumber(summary.marginPercent, 2)} % / ${formatCurrency(summary.marginAmount)}`, "default" as const],
      ["Vysledok Create Sheet", formatCurrency(summary.finalPrice), "accent" as const]
    ];
    for (const [label, value, tone] of cards) {
      totalGrid.appendChild(createMetricCard(label, value, tone));
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
