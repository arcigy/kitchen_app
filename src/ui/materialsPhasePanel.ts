import type { MaterialUsageGroup, ProjectMaterialUsageSummary } from "../layout/bom/materialUsageSummary";

export function mountProjectMaterialsPanel(container: HTMLElement, summary: ProjectMaterialUsageSummary): void {
  container.innerHTML = renderProjectMaterialsPanel(summary);
}

export function renderProjectMaterialsPanel(summary: ProjectMaterialUsageSummary): string {
  const visibleGroups = summary.groups.filter((group) => group.alwaysVisible || group.items.length > 0);
  return `
    <header class="materials-phase__header">
      <div>
        <h1>Materiály a komponenty</h1>
        <p>Reálny súhrn spotreby z aktuálneho projektu. Ceny a cenníky sa v tejto fáze nezobrazujú.</p>
      </div>
      <div class="materials-phase__metrics" aria-label="Súhrn projektu">
        ${metric("Dosky", `${formatNumber(summary.boardPieces)} ks`)}
        ${metric("Plocha dosiek", `${formatNumber(summary.boardAreaM2)} m²`)}
        ${metric("Hrany", `${formatNumber(summary.edgeLengthLm)} bm`)}
        ${metric("Kovanie", `${formatNumber(summary.hardwarePieces)} ks`)}
      </div>
    </header>
    <p class="materials-phase__notice">Množstvá vychádzajú z kusovníka projektu a obnovia sa pri ďalšom otvorení Materiálov.</p>
    <div class="materials-phase__content">
      <section class="materials-phase__groups" aria-label="Materiálové skupiny">
        ${summary.isEmpty ? emptyProject() : visibleGroups.map(renderGroup).join("")}
      </section>
      <aside class="materials-phase__overview" aria-label="Prehľad materiálov">
        <h2>Prehľad materiálov</h2>
        <p>Rozdelenie podľa výrobných skupín.</p>
        <dl>
          ${visibleGroups.map(renderOverviewRow).join("")}
        </dl>
      </aside>
    </div>
  `;
}

export function renderMaterialWarnings(summary: ProjectMaterialUsageSummary): string {
  if (summary.warnings.length === 0) return `<p class="materials-warning-empty">Bez materiálových varovaní.</p>`;
  return summary.warnings
    .slice(0, 4)
    .map((warning) => `<p class="materials-warning"><span aria-hidden="true">△</span>${escapeHtml(warning)}</p>`)
    .join("");
}

function renderGroup(group: MaterialUsageGroup): string {
  const quantity = group.unit === "m2" ? `${formatNumber(group.quantity)} m²` : group.unit === "lm" ? `${formatNumber(group.quantity)} bm` : `${formatNumber(group.quantity)} ks`;
  return `
    <article class="materials-group materials-group--${group.id}">
      <div class="materials-group__icon" aria-hidden="true">${groupIcon(group.id)}</div>
      <div class="materials-group__body">
        <header>
          <div><h2>${escapeHtml(group.label)}</h2><p>${formatPieceLabel(group.pieces, group.itemLabel)} · ${quantity}</p></div>
          <strong>${quantity}</strong>
        </header>
        ${group.items.length ? `<div class="materials-group__rows">${group.items.map((item) => renderGroupItem(group, item)).join("")}</div>` : `<p class="materials-group__empty">V projekte zatiaľ nie sú žiadne položky.</p>`}
      </div>
    </article>
  `;
}

function renderGroupItem(group: MaterialUsageGroup, item: MaterialUsageGroup["items"][number]): string {
  const quantity = group.unit === "m2" ? `${formatNumber(item.quantity)} m²` : group.unit === "lm" ? `${formatNumber(item.quantity)} bm` : `${formatNumber(item.quantity)} ks`;
  return `
    <div class="materials-group__row">
      <span class="materials-group__swatch" aria-hidden="true"></span>
      <div><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.catalogId ?? "Materiál nie je priradený")} · ${escapeHtml(item.detail)}</small></div>
      <span>${formatNumber(item.pieces)} ks</span>
      <b>${quantity}</b>
    </div>
  `;
}

function renderOverviewRow(group: MaterialUsageGroup): string {
  const quantity = group.unit === "m2" ? `${formatNumber(group.quantity)} m²` : group.unit === "lm" ? `${formatNumber(group.quantity)} bm` : `${formatNumber(group.quantity)} ks`;
  return `<div><dt>${escapeHtml(group.label)}</dt><dd>${quantity}<small>${formatMaterialCount(group.items.length)}</small></dd></div>`;
}

function metric(label: string, value: string): string {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function emptyProject(): string {
  return `<div class="materials-phase__empty"><strong>Projekt zatiaľ neobsahuje materiálové položky.</strong><p>Vlož modul alebo pracovnú dosku a po otvorení Materiálov sa tu zobrazí reálna spotreba.</p></div>`;
}

function groupIcon(group: MaterialUsageGroup["id"]): string {
  const icons: Record<MaterialUsageGroup["id"], string> = {
    corpus: "▧",
    front: "▣",
    worktop: "▱",
    plinth: "▰",
    back: "▤",
    drawer_bottom: "▥",
    edge: "◉",
    hardware: "⌁"
  };
  return icons[group];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 2 }).format(value);
}

function formatPieceLabel(count: number, label: string): string {
  const rounded = Math.round(count);
  if (label === "ks") return `${formatNumber(count)} ks`;
  if (label === "doska") return `${formatNumber(count)} ${slovakPlural(rounded, "doska", "dosky", "dosiek")}`;
  return `${formatNumber(count)} ${slovakPlural(rounded, "hrana", "hrany", "hrán")}`;
}

function formatMaterialCount(count: number): string {
  return `${formatNumber(count)} ${slovakPlural(count, "materiál", "materiály", "materiálov")}`;
}

function slovakPlural(count: number, singular: string, few: string, many: string): string {
  return count === 1 ? singular : count >= 2 && count <= 4 ? few : many;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
