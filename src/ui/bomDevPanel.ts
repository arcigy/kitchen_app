import type { KitchenContext } from "../layout/kitchenContext";
import type { LayoutInstance } from "../layout/appState";
import { calculateModuleBOM } from "../layout/bom/calculateBOM";

const typeLabels: Record<LayoutInstance["params"]["type"], string> = {
  drawer_low: "drawerLow",
  nested_drawer_low: "nestedDrawerLow",
  shelves: "shelves",
  corner_shelf_lower: "cornerShelfLower",
  fridge_tall: "fridgeTall",
  flap_shelves_low: "flapShelvesLow",
  swing_shelves_low: "swingShelvesLow",
  oven_base_low: "ovenBaseLow",
  microwave_oven_tall: "microwaveOvenTall",
  top_drawers_doors_low: "topDrawersDoorsLow"
};

export function mountBomDevPanel(
  container: HTMLElement,
  instances: LayoutInstance[],
  ctx: KitchenContext
): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.style.display = "grid";
  root.style.gap = "14px";
  root.style.color = "#eef2ff";
  root.style.font = "13px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  container.appendChild(root);

  if (instances.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "Nie sú umiestnené žiadne moduly.";
    empty.style.color = "#aab2c5";
    root.appendChild(empty);
    return;
  }

  const selectLabel = document.createElement("label");
  selectLabel.textContent = "Modul";
  selectLabel.style.display = "grid";
  selectLabel.style.gap = "6px";

  const select = document.createElement("select");
  select.style.background = "#0e1118";
  select.style.color = "#eef2ff";
  select.style.border = "1px solid #303746";
  select.style.borderRadius = "6px";
  select.style.padding = "8px";

  const typeCounts = new Map<string, number>();
  instances.forEach((instance, index) => {
    const moduleType = typeLabels[instance.params.type];
    const next = (typeCounts.get(moduleType) ?? 0) + 1;
    typeCounts.set(moduleType, next);

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${moduleType} #${next}`;
    select.appendChild(option);
  });

  selectLabel.appendChild(select);
  root.appendChild(selectLabel);

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "16px";
  root.appendChild(content);

  const render = () => {
    content.innerHTML = "";
    const selected = instances[Number(select.value)] ?? instances[0];

    content.appendChild(section("Module parameters", renderParams(selected.params)));
    content.appendChild(section("BOM result", renderResult(selected, ctx)));
  };

  select.addEventListener("change", render);
  render();
}

function section(title: string, body: HTMLElement) {
  const wrap = document.createElement("section");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.style.margin = "0";
  heading.style.fontSize = "14px";
  heading.style.fontWeight = "700";
  wrap.appendChild(heading);
  wrap.appendChild(body);
  return wrap;
}

function renderParams(params: LayoutInstance["params"]) {
  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gridTemplateColumns = "minmax(130px, 1fr) minmax(0, 2fr)";
  list.style.gap = "4px 12px";

  for (const row of flattenParams(params)) {
    const key = document.createElement("div");
    key.textContent = row.key;
    key.style.color = "#9aa5ba";
    key.style.wordBreak = "break-word";

    const value = document.createElement("div");
    value.textContent = row.value;
    value.style.wordBreak = "break-word";

    list.appendChild(key);
    list.appendChild(value);
  }

  return list;
}

function renderResult(instance: LayoutInstance, ctx: KitchenContext) {
  const result = calculateModuleBOM(instance, ctx);
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "14px";

  wrap.appendChild(renderPartsTable(result.parts));
  wrap.appendChild(renderHardwareTable(result.hardware));

  const total = document.createElement("div");
  total.textContent = `Total: ${formatPrice(result.totalPrice)}`;
  total.style.fontWeight = "700";
  total.style.textAlign = "right";
  wrap.appendChild(total);

  wrap.appendChild(renderJsonCopyAction(instance, ctx));

  return wrap;
}

function renderJsonCopyAction(instance: LayoutInstance, ctx: KitchenContext) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "10px";
  row.style.justifyContent = "flex-end";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Kopírovať JSON";
  button.style.background = "#0e1118";
  button.style.color = "#eef2ff";
  button.style.border = "1px solid #303746";
  button.style.borderRadius = "6px";
  button.style.padding = "7px 10px";

  const status = document.createElement("span");
  status.textContent = "Skopírované!";
  status.style.color = "#7ddc9b";
  status.style.opacity = "0";
  status.style.transition = "opacity 120ms ease";

  let hideTimer: number | undefined;
  button.addEventListener("click", async () => {
    const data = buildBomJson(instance, ctx);
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));

    status.style.opacity = "1";
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      status.style.opacity = "0";
    }, 2000);
  });

  row.appendChild(button);
  row.appendChild(status);
  return row;
}

function buildBomJson(instance: LayoutInstance, ctx: KitchenContext) {
  const result = calculateModuleBOM(instance, ctx);

  return {
    moduleType: result.moduleType,
    params: instance.params,
    bom: {
      parts: result.parts,
      hardware: result.hardware,
      totalPrice: result.totalPrice
    }
  };
}

function renderPartsTable(parts: ReturnType<typeof calculateModuleBOM>["parts"]) {
  return renderTable(
    ["Názov", "Š×V×Hr", "Materiál", "Ks", "Plocha m²", "Cena"],
    parts.map((part) => [
      part.name,
      `${part.widthMm}×${part.heightMm}×${part.thicknessMm}`,
      part.materialId,
      formatNumber(part.quantity),
      formatNumber(part.areaMm2 / 1_000_000),
      formatPrice(part.totalPrice)
    ])
  );
}

function renderHardwareTable(hardware: ReturnType<typeof calculateModuleBOM>["hardware"]) {
  return renderTable(
    ["Názov", "Ks", "Cena/ks", "Celkom"],
    hardware.map((item) => [
      item.name,
      formatNumber(item.quantity),
      formatPrice(item.pricePerPiece),
      formatPrice(item.totalPrice)
    ])
  );
}

function renderTable(headers: string[], rows: string[][]) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.padding = "6px";
    th.style.borderBottom = "1px solid #303746";
    th.style.color = "#9aa5ba";
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length;
    td.textContent = "Zatiaľ prázdne.";
    td.style.padding = "8px 6px";
    td.style.color = "#9aa5ba";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const row of rows) {
      const tr = document.createElement("tr");
      for (const value of row) {
        const td = document.createElement("td");
        td.textContent = value;
        td.style.padding = "6px";
        td.style.borderBottom = "1px solid #202632";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);
  return table;
}

function flattenParams(value: unknown, prefix = ""): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object") {
    return [{ key: prefix, value: formatValue(value) }];
  }

  if (Array.isArray(value)) {
    return [{ key: prefix, value: formatValue(value) }];
  }

  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      rows.push(...flattenParams(child, nextKey));
    } else {
      rows.push({ key: nextKey, value: formatValue(child) });
    }
  }
  return rows;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (value === null) return "null";
  if (value === undefined) return "";
  return String(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(value);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}
