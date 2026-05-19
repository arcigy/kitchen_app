import type { ClientCatalog } from "../core/catalog/catalog-types";

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
  element.appendChild(tbody);
  return wrap;
}

function formatCurrency(value: number | null) {
  if (value == null) return "-";
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

export function mountPricingCatalogPanel(container: HTMLElement, catalog: ClientCatalog) {
  container.innerHTML = "";
  container.style.display = "grid";
  container.style.gap = "18px";
  container.style.color = "#eef2ff";
  container.style.font = "13px system-ui, sans-serif";

  const intro = document.createElement("div");
  intro.style.display = "grid";
  intro.style.gap = "4px";
  const title = document.createElement("h2");
  title.textContent = "Pricing Catalog";
  title.style.margin = "0";
  title.style.font = "700 18px system-ui, sans-serif";
  const desc = document.createElement("div");
  desc.textContent = "Centrálny katalóg materiálov, komponentov a jednotkových cien pre obchodný kusovník.";
  desc.style.color = "#9aa5ba";
  desc.style.fontSize = "12px";
  intro.append(title, desc);
  container.appendChild(intro);

  const materialsSection = document.createElement("section");
  materialsSection.style.display = "grid";
  materialsSection.style.gap = "10px";
  const materialsTitle = document.createElement("h3");
  materialsTitle.textContent = "Materials";
  materialsTitle.style.margin = "0";
  materialsTitle.style.font = "700 15px system-ui, sans-serif";
  materialsSection.appendChild(materialsTitle);
  materialsSection.appendChild(
    table(
      ["Display Name", "Catalog ID", "Type", "Base", "Decor", "Finish", "Thicknesses", "Unit", "Unit price"],
      catalog.materials.map((material) => [
        material.displayName,
        material.id,
        material.materialType,
        material.baseMaterial,
        material.decor,
        material.finish,
        material.availableThicknessesMm.join(", "),
        material.pricingUnit,
        formatCurrency(catalog.priceList.prices[material.id] ?? null)
      ])
    )
  );
  container.appendChild(materialsSection);

  const componentsSection = document.createElement("section");
  componentsSection.style.display = "grid";
  componentsSection.style.gap = "10px";
  const componentsTitle = document.createElement("h3");
  componentsTitle.textContent = "Components";
  componentsTitle.style.margin = "0";
  componentsTitle.style.font = "700 15px system-ui, sans-serif";
  componentsSection.appendChild(componentsTitle);
  componentsSection.appendChild(
    table(
      ["Display Name", "Catalog ID", "Type", "Brand", "Series", "Variant", "Geometry", "Unit price"],
      catalog.components.map((component) => [
        component.displayName,
        component.id,
        component.componentType,
        component.brand,
        component.series,
        component.variant,
        component.geometryId,
        formatCurrency(catalog.priceList.prices[component.id] ?? null)
      ])
    )
  );
  container.appendChild(componentsSection);
}
