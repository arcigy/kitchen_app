import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialsView } from "../core/project-materials/project-material-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import type { AppState, LayoutInstance } from "../layout/appState";
import { buildProjectMaterialUsageSummary } from "../layout/bom/materialUsageSummary";
import { mountProjectMaterialsPanel, renderMaterialWarnings } from "../ui/materialsPhasePanel";
import { createButtonElement, createFileInputElement, createHtmlButtonElement } from "./propsPanelElements";

type WorkspaceNavId = "design" | "sheets" | "documents" | "visualisation" | "schedules" | "margins" | "materials" | "settings";

type WorkspaceNavigationControllerArgs = {
  root: HTMLElement;
  S: AppState;
  catalog: ClientCatalog;
  materialsPhase: {
    mainEl: HTMLElement;
    hostEl: HTMLElement;
    viewsEl: HTMLElement;
    warningsEl: HTMLElement;
    warningListEl: HTMLElement;
  };
  materialsController?: {
    open: () => Promise<ProjectMaterialsView>;
    close: () => Promise<void>;
  };
  marginsPhase?: {
    mainEl: HTMLElement;
    hostEl: HTMLElement;
  };
  marginsController?: {
    open: () => Promise<ProjectMarginsView>;
    close: () => Promise<void>;
  };
  setVisualisationTopbar: () => void;
  setDesignTopbar: () => void;
};

type SheetRecord = {
  id: string;
  name: string;
  type: string;
  source: string;
  status: string;
  accent: string;
};

const defaultSheets: SheetRecord[] = [
  { id: "a101", name: "A101 - Floor plan Level 1", type: "Podorys", source: "Project base", status: "Ready as underlay", accent: "#6655ff" },
  { id: "a201", name: "A201 - North elevation", type: "Pohlad", source: "Generated placeholder", status: "Waiting for auto sheet", accent: "#2572dc" },
  { id: "s101", name: "S101 - Section S1", type: "Rez", source: "Generated placeholder", status: "Waiting for section export", accent: "#23a98f" },
  { id: "d301", name: "D301 - Detail package", type: "Detail", source: "Manual placeholder", status: "No file linked", accent: "#f79009" }
];

export function createWorkspaceNavigationController(args: WorkspaceNavigationControllerArgs) {
  const navButtons = Array.from(args.root.querySelectorAll<HTMLButtonElement>("[data-workspace-nav]"));
  const sheets = [...defaultSheets];
  let overlay: HTMLElement | null = null;
  let materialsPhaseActive = false;
  let marginsPhaseActive = false;
  let marginsOpenPromise: Promise<ProjectMarginsView> | null = null;

  const setActiveNav = (id: WorkspaceNavId) => {
    for (const button of navButtons) button.classList.toggle("active", button.dataset.workspaceNav === id);
  };

  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
  };

  const leaveMaterialsPhase = async () => {
    if (!materialsPhaseActive) return;
    materialsPhaseActive = false;
    await args.materialsController?.close();
    args.root.classList.remove("archux-materials-phase");
    args.materialsPhase.mainEl.classList.remove("archux-materials-phase");
    args.materialsPhase.hostEl.hidden = true;
    args.materialsPhase.viewsEl.hidden = false;
    args.materialsPhase.warningsEl.hidden = true;
  };

  const leaveMarginsPhase = async () => {
    if (!marginsPhaseActive && !marginsOpenPromise) return;
    marginsPhaseActive = false;
    const opening = marginsOpenPromise;
    if (opening) await opening.catch(() => undefined);
    await args.marginsController?.close();
    args.root.classList.remove("archux-margins-phase");
    args.marginsPhase?.mainEl.classList.remove("archux-margins-phase");
    if (args.marginsPhase) args.marginsPhase.hostEl.hidden = true;
  };

  const openOverlay = (title: string, subtitle: string, body: HTMLElement, width: "wide" | "xl" = "wide") => {
    closeOverlay();
    overlay = document.createElement("div");
    overlay.className = "workspace-overlay";
    overlay.innerHTML = `
      <section class="workspace-dialog ${width}" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="workspace-dialog-header">
          <div>
            <strong>${title}</strong>
            <span>${subtitle}</span>
          </div>
          <button type="button" data-workspace-close aria-label="Close">×</button>
        </header>
      </section>
    `;
    overlay.querySelector(".workspace-dialog")?.appendChild(body);
    args.root.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>("[data-workspace-close]")?.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeOverlay();
    });
  };

  const openSheets = () => {
    const body = document.createElement("div");
    body.className = "workspace-sheets";
    const actions = document.createElement("div");
    actions.className = "workspace-panel-actions";
    const importButton = createButtonElement("Import PDF");
    importButton.className = "workspace-primary";
    importButton.dataset.importSheet = "";
    const helpText = document.createElement("span");
    helpText.textContent = "Vykresy sluzia ako podklad. Neskor sem bude system automaticky vkladat exportovane vykresy.";
    actions.append(importButton, helpText);
    const grid = document.createElement("div");
    grid.className = "workspace-sheet-grid";
    grid.dataset.sheetGrid = "";
    body.append(actions, grid);
    const render = () => {
      grid.innerHTML = "";
      for (const sheet of sheets) grid.appendChild(renderSheetCard(sheet));
    };
    importButton.addEventListener("click", () => importPdfSheet(sheets, render));
    render();
    openOverlay("Sheets", "Vyber vykresu alebo PDF podkladu pre layout.", body);
  };

  const openSchedules = () => {
    const body = document.createElement("div");
    body.className = "workspace-schedules";
    const tabs = document.createElement("nav");
    tabs.className = "workspace-schedule-tabs";
    tabs.setAttribute("aria-label", "Schedule type");
    const tabButtons = [
      createScheduleTabButton("modules", "Module schedule", true),
      createScheduleTabButton("materials", "Material boards"),
      createScheduleTabButton("edgebanding", "Opaskovanie"),
      createScheduleTabButton("components", "Components"),
      createScheduleTabButton("views", "Views")
    ];
    tabs.append(...tabButtons);
    const content = document.createElement("div");
    content.className = "workspace-schedule-content";
    content.dataset.scheduleContent = "";
    body.append(tabs, content);
    const render = (tab: string) => {
      content.innerHTML = "";
      if (tab === "materials") content.appendChild(renderMaterialSchedule(args.S, args.catalog));
      else if (tab === "edgebanding") content.appendChild(renderEdgeSchedule(args.S));
      else if (tab === "components") content.appendChild(renderComponentSchedule(args.S));
      else if (tab === "views") content.appendChild(renderViewSchedule(args.S));
      else content.appendChild(renderModuleSchedule(args.S));
    };
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        tabButtons.forEach((item) => item.classList.toggle("active", item === button));
        render(button.dataset.scheduleTab ?? "modules");
      });
    });
    render("modules");
    openOverlay("Schedules", "Tabulky modulov, materialov, opaskovania, komponentov a pohladov.", body, "xl");
  };

  const openMaterials = () => {
    closeOverlay();
    args.setDesignTopbar();
    args.root.classList.add("archux-materials-phase");
    args.materialsPhase.mainEl.classList.add("archux-materials-phase");
    args.materialsPhase.hostEl.hidden = false;
    args.materialsPhase.viewsEl.hidden = true;
    args.materialsPhase.warningsEl.hidden = false;
    materialsPhaseActive = true;
    if (args.materialsController) {
      args.materialsPhase.warningListEl.innerHTML = `<p class="materials-warning-empty">Načítavam varovania…</p>`;
      void args.materialsController.open()
        .then((view) => {
          if (!materialsPhaseActive) return;
          args.materialsPhase.warningListEl.innerHTML = renderMaterialWarnings(view.warnings);
        })
        .catch((error: unknown) => {
          if (!materialsPhaseActive) return;
          const message = error instanceof Error ? error.message : "Materiály sa nepodarilo načítať.";
          args.materialsPhase.hostEl.innerHTML = `<p class="materials-phase__status materials-phase__status--error" role="alert">Materiály sa nedajú bezpečne otvoriť, pretože projekt sa nepodarilo uložiť. ${escapeHtml(message)}</p>`;
          args.materialsPhase.warningListEl.innerHTML = `<p class="materials-warning">${escapeHtml(message)}</p>`;
        });
      return;
    }
    const summary = buildProjectMaterialUsageSummary({
      instances: args.S.instances,
      worktops: args.S.kitchenWorktops,
      customFurniture: args.S.customFurniture,
      kitchenContext: args.S.kitchenCtx,
      kitchenGroups: args.S.kitchenGroups,
      catalog: args.catalog
    });
    mountProjectMaterialsPanel(args.materialsPhase.hostEl, summary);
    args.materialsPhase.warningListEl.innerHTML = renderMaterialWarnings(summary);
  };

  const openMargins = () => {
    if (marginsPhaseActive) return;
    closeOverlay();
    args.setDesignTopbar();
    if (!args.marginsPhase || !args.marginsController) {
      openPlaceholder("Marže", "Marže projektu sa nepodarilo inicializovať.");
      return;
    }
    args.root.classList.add("archux-margins-phase");
    args.marginsPhase.mainEl.classList.add("archux-margins-phase");
    args.marginsPhase.hostEl.hidden = false;
    marginsPhaseActive = true;
    const opening = args.marginsController.open();
    marginsOpenPromise = opening;
    void opening.catch((error: unknown) => {
      if (!marginsPhaseActive || !args.marginsPhase) return;
      const message = error instanceof Error ? error.message : "Marže sa nepodarilo načítať.";
      args.marginsPhase.hostEl.innerHTML = `<p class="margins-phase__status margins-phase__status--error" data-margin-error role="alert">Marže sa nedajú bezpečne otvoriť. ${escapeHtml(message)}</p>`;
    }).finally(() => {
      if (marginsOpenPromise === opening) marginsOpenPromise = null;
    });
  };

  const openPlaceholder = (title: string, subtitle: string) => {
    const body = document.createElement("div");
    body.className = "workspace-placeholder";
    body.innerHTML = `
      <strong>${title}</strong>
      <p>${subtitle}</p>
    `;
    openOverlay(title, subtitle, body);
  };

  const handleNav = async (id: WorkspaceNavId) => {
    if (id === "design") {
      await leaveMaterialsPhase();
      await leaveMarginsPhase();
      closeOverlay();
      setActiveNav("design");
      args.setDesignTopbar();
      return;
    }
    if (id === "visualisation") {
      await leaveMaterialsPhase();
      await leaveMarginsPhase();
      closeOverlay();
      setActiveNav("visualisation");
      args.setVisualisationTopbar();
      return;
    }
    if (id !== "materials") await leaveMaterialsPhase();
    if (id !== "margins") await leaveMarginsPhase();
    setActiveNav(id);
    if (id === "sheets") openSheets();
    else if (id === "schedules") openSchedules();
    else if (id === "materials") openMaterials();
    else if (id === "margins") openMargins();
    else if (id === "documents") openPlaceholder("Documents", "Dokumenty budu samostatny priestor pre zmluvy, poznamky a projektove subory.");
    else if (id === "settings") openPlaceholder("Settings", "Nastavenia organizacie, projektu a workspace budu napojene neskor.");
  };

  for (const button of navButtons) {
    button.addEventListener("click", () => {
      const id = button.dataset.workspaceNav as WorkspaceNavId | undefined;
      if (id) void handleNav(id);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
    if (materialsPhaseActive) {
      void leaveMaterialsPhase().then(() => {
        setActiveNav("design");
        args.setDesignTopbar();
      });
      return;
    }
    if (marginsPhaseActive) {
      void leaveMarginsPhase().then(() => {
        setActiveNav("design");
        args.setDesignTopbar();
      });
      return;
    }
    if (overlay) {
      closeOverlay();
      setActiveNav("design");
    }
  });

  return { closeOverlay, openSheets, openSchedules, openMaterials, openMargins, leaveMaterialsPhase, leaveMarginsPhase };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function importPdfSheet(sheets: SheetRecord[], onDone: () => void): void {
  const input = createFileInputElement("application/pdf,.pdf");
  input.addEventListener("change", () => {
    const file = input.files?.[0] ?? null;
    if (!file) return;
    sheets.unshift({
      id: `pdf_${Date.now()}`,
      name: file.name,
      type: "Imported PDF",
      source: `${Math.max(1, Math.round(file.size / 1024))} kB`,
      status: "Imported locally",
      accent: "#6655ff"
    });
    onDone();
    input.remove();
  });
  input.click();
}

function createScheduleTabButton(tab: string, label: string, active = false): HTMLButtonElement {
  const button = createButtonElement(label);
  if (active) button.className = "active";
  button.dataset.scheduleTab = tab;
  return button;
}

function renderSheetCard(sheet: SheetRecord): HTMLElement {
  const card = createHtmlButtonElement("");
  card.className = "workspace-sheet-card";
  card.innerHTML = `
    <span class="workspace-sheet-preview" style="--sheet-accent:${sheet.accent}">
      <i></i><i></i><i></i><i></i>
    </span>
    <strong>${sheet.name}</strong>
    <span>${sheet.type}</span>
    <small>${sheet.source} · ${sheet.status}</small>
  `;
  return card;
}

function renderModuleSchedule(S: AppState): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "workspace-schedule-split";
  const list = document.createElement("div");
  list.className = "workspace-schedule-table";
  const detail = document.createElement("div");
  detail.className = "workspace-schedule-detail";
  list.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Module</th><th>Size</th><th>Position</th><th>Material</th></tr></thead>
      <tbody></tbody>
    </table>
  `;
  const tbody = list.querySelector("tbody");
  for (const instance of S.instances) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.innerHTML = `
      <td>${moduleScheduleId(instance)}</td>
      <td>${formatModuleType(instance.params.type)}</td>
      <td>${numberParam(instance, "width")} × ${numberParam(instance, "height")} × ${numberParam(instance, "depth")} mm</td>
      <td>${Math.round(instance.root.position.x * 1000)} / ${Math.round(instance.root.position.z * 1000)} mm</td>
      <td>${materialIdForModule(instance) ?? "-"}</td>
    `;
    row.addEventListener("click", () => renderModuleDetail(detail, instance));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") renderModuleDetail(detail, instance);
    });
    tbody?.appendChild(row);
  }
  if (S.instances[0]) renderModuleDetail(detail, S.instances[0]);
  else detail.innerHTML = `<strong>No modules</strong><p>Po vlozeni modulov sa tu ukaze module schedule.</p>`;
  wrap.append(list, detail);
  return wrap;
}

function renderModuleDetail(target: HTMLElement, instance: LayoutInstance): void {
  const rows = boardRowsForInstance(instance);
  target.innerHTML = `
    <strong>${moduleScheduleId(instance)} · ${formatModuleType(instance.params.type)}</strong>
    <p>Detailny kusovnik konkretneho modulu.</p>
    <table>
      <thead><tr><th>Part ID</th><th>Part</th><th>Size</th><th>Material</th><th>Edges</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${row.id}</td><td>${row.name}</td><td>${row.size}</td><td>${row.material}</td><td>${row.edges}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderMaterialSchedule(S: AppState, catalog: ClientCatalog): HTMLElement {
  const rows = new Map<string, { count: number; modules: string[] }>();
  for (const instance of S.instances) {
    for (const materialId of moduleMaterialIds(instance)) {
      const row = rows.get(materialId) ?? { count: 0, modules: [] };
      row.count += boardRowsForInstance(instance).filter((part) => part.material === materialId).length || 1;
      row.modules.push(moduleScheduleId(instance));
      rows.set(materialId, row);
    }
  }
  return scheduleTable(["Material", "Boards", "Modules", "Catalog name"], Array.from(rows.entries()).map(([materialId, row]) => [
    materialId,
    String(row.count),
    [...new Set(row.modules)].join(", "),
    catalog.materials.find((material) => material.id === materialId)?.displayName ?? "-"
  ]));
}

function renderEdgeSchedule(S: AppState): HTMLElement {
  const rows = S.instances.flatMap((instance) =>
    boardRowsForInstance(instance).map((part) => [part.id, part.name, part.size, moduleScheduleId(instance), part.edges])
  );
  return scheduleTable(["Part ID", "Part", "Size", "Module", "Edges"], rows);
}

function renderComponentSchedule(S: AppState): HTMLElement {
  const rows = S.instances.flatMap((instance) =>
    Object.entries(instance.params)
      .filter(([key, value]) => key.toLowerCase().includes("component") && typeof value === "string")
      .map(([key, value]) => [`CMP-${String(value).slice(-6).toUpperCase()}`, key, String(value), moduleScheduleId(instance)])
  );
  return scheduleTable(["Component ID", "Use", "Catalog ref", "Module"], rows);
}

function renderViewSchedule(S: AppState): HTMLElement {
  const baseRows = [
    ["VIEW-FP-001", "Floorplan", "Podorys", "Ready"],
    ["VIEW-3D-001", "3D", "Model view", "Ready"],
    ["VIEW-N-001", "North", "Elevation", "Ready"],
    ["VIEW-E-001", "East", "Elevation", "Ready"],
    ["VIEW-S-001", "South", "Elevation", "Ready"],
    ["VIEW-W-001", "West", "Elevation", "Ready"]
  ];
  const sectionRows = S.sections.map((section, index) => [`VIEW-SEC-${String(index + 1).padStart(3, "0")}`, section.params.name, "Section", "DXF export later"]);
  return scheduleTable(["View ID", "Name", "Type", "Status"], [...baseRows, ...sectionRows]);
}

function scheduleTable(headers: string[], rows: string[][]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "workspace-schedule-table";
  wrap.innerHTML = `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>
        ${
          rows.length
            ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}">No records yet.</td></tr>`
        }
      </tbody>
    </table>
  `;
  return wrap;
}

function boardRowsForInstance(instance: LayoutInstance) {
  const width = numberParam(instance, "width");
  const height = numberParam(instance, "heightCarcass") || numberParam(instance, "height");
  const depth = numberParam(instance, "depth");
  const material = materialIdForModule(instance) ?? "-";
  const prefix = moduleScheduleId(instance);
  return [
    { id: `${prefix}-L`, name: "Left side", size: `${depth} × ${height}`, material, edges: "front" },
    { id: `${prefix}-R`, name: "Right side", size: `${depth} × ${height}`, material, edges: "front" },
    { id: `${prefix}-B`, name: "Bottom", size: `${width} × ${depth}`, material, edges: "front,left,right" },
    { id: `${prefix}-T`, name: "Top", size: `${width} × ${depth}`, material, edges: "front,left,right" },
    { id: `${prefix}-BACK`, name: "Back panel", size: `${width} × ${height}`, material: String(instance.params.backMaterialId ?? material), edges: "-" }
  ];
}

function moduleMaterialIds(instance: LayoutInstance): string[] {
  return Object.entries(instance.params)
    .filter(([key, value]) => key.toLowerCase().includes("material") && typeof value === "string" && value.length > 0)
    .map(([, value]) => String(value));
}

function materialIdForModule(instance: LayoutInstance): string | null {
  return String(instance.params.corpusMaterialId ?? instance.params.materialId ?? instance.params.frontsMaterialId ?? "").trim() || null;
}

function moduleScheduleId(instance: LayoutInstance): string {
  return `MOD-${instance.id.replace(/\D+/g, "").slice(-4).padStart(4, "0") || instance.id.slice(-4).toUpperCase()}`;
}

function numberParam(instance: LayoutInstance, key: string): number {
  const value = instance.params[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function formatModuleType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
