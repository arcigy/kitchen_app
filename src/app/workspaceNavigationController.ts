import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialsView } from "../core/project-materials/project-material-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import type { AppState, LayoutInstance } from "../layout/appState";
import { buildProjectMaterialUsageSummary } from "../layout/bom/materialUsageSummary";
import { mountProjectMaterialsPanel, renderMaterialWarnings } from "../ui/materialsPhasePanel";
import { showComingSoonDialog } from "../ui/comingSoonDialog";
import { mountLoadingSkeleton } from "../ui/loadingSkeleton";
import { createButtonElement, createFileInputElement, createHtmlButtonElement } from "./propsPanelElements";
import { getAppContextMenuController, type ContextMenuItem } from "../ui/contextMenu";
import { t } from "../i18n";

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
    footerEl: HTMLElement;
  };
  marginsController?: {
    open: () => Promise<ProjectMarginsView>;
    close: () => Promise<void>;
  };
  setVisualisationTopbar: () => void;
  setDesignTopbar: () => void;
  selectModuleById?: (instanceId: string) => void;
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
    if (args.marginsPhase) {
      args.marginsPhase.hostEl.hidden = true;
      args.marginsPhase.footerEl.hidden = true;
    }
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
          <button type="button" data-workspace-close aria-label="${t("Close")}">×</button>
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
    const importButton = createButtonElement(t("Import PDF"));
    importButton.className = "workspace-primary";
    importButton.dataset.importSheet = "";
    const helpText = document.createElement("span");
    helpText.textContent = t("Drawings serve as an underlay. The system will add exported drawings here automatically later.");
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
    openOverlay(t("Sheets"), t("Choose a drawing or PDF underlay for the layout."), body);
  };

  const openSchedules = () => {
    const body = document.createElement("div");
    body.className = "workspace-schedules";
    const tabs = document.createElement("nav");
    tabs.className = "workspace-schedule-tabs";
    tabs.setAttribute("aria-label", t("Schedule type"));
    const tabButtons = [
      createScheduleTabButton("modules", t("Module schedule"), true),
      createScheduleTabButton("materials", t("Material boards")),
      createScheduleTabButton("edgebanding", t("Edge banding")),
      createScheduleTabButton("components", t("Components")),
      createScheduleTabButton("views", t("Views"))
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
    if (typeof window !== "undefined" && typeof HTMLElement !== "undefined" && body instanceof HTMLElement) getAppContextMenuController().register(body, (request) => {
      const row = request.target.closest<HTMLTableRowElement>("tbody tr");
      if (!row) return [];
      const instanceId = row.dataset.scheduleInstanceId;
      const items: ContextMenuItem[] = [];
      if (instanceId && args.selectModuleById) {
        items.push({
          id: "schedule-open-source",
          label: t("Open source module"),
          iconId: "open",
          execute: async () => {
            await handleNav("design");
            args.selectModuleById?.(instanceId);
          }
        });
      }
      items.push({
        id: "schedule-copy-row",
        label: t("Copy row"),
        iconId: "copyExport",
        execute: () => copyScheduleRow(row)
      });
      items.push({ type: "separator", id: "schedule-phase-separator" });
      items.push(
        { id: "schedule-open-materials", label: t("Open Materials"), iconId: "materials", execute: () => handleNav("materials") },
        { id: "schedule-open-margins", label: t("Open Margins"), iconId: "margins", execute: () => handleNav("margins") }
      );
      return items;
    });
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        tabButtons.forEach((item) => item.classList.toggle("active", item === button));
        render(button.dataset.scheduleTab ?? "modules");
      });
    });
    render("modules");
    openOverlay(t("Schedules"), t("Tables of modules, materials, edge banding, components and views."), body, "xl");
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
      const materialsLoading = mountLoadingSkeleton(args.materialsPhase.hostEl, {
        variant: "phase",
        label: t("Loading project materials…")
      });
      const warningsLoading = mountLoadingSkeleton(args.materialsPhase.warningListEl, {
        variant: "phase",
        label: t("Loading material warnings…")
      });
      void args.materialsController.open()
        .then((view) => {
          if (!materialsPhaseActive) return;
          materialsLoading.clear();
          warningsLoading.clear();
          args.materialsPhase.warningListEl.innerHTML = renderMaterialWarnings(view.warnings);
        })
        .catch((error: unknown) => {
          if (!materialsPhaseActive) return;
          materialsLoading.clear();
          warningsLoading.clear();
          const message = error instanceof Error ? error.message : t("Materials could not be loaded.");
          args.materialsPhase.hostEl.innerHTML = `<p class="materials-phase__status materials-phase__status--error" role="alert">${t("Materials cannot be opened safely because the project could not be saved.")} ${escapeHtml(message)}</p>`;
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
      openPlaceholder(t("Margins"), t("Project margins could not be initialized."));
      return;
    }
    args.root.classList.add("archux-margins-phase");
    args.marginsPhase.mainEl.classList.add("archux-margins-phase");
    args.marginsPhase.hostEl.hidden = false;
    args.marginsPhase.footerEl.hidden = false;
    marginsPhaseActive = true;
    const marginsLoading = mountLoadingSkeleton(args.marginsPhase.hostEl, {
      variant: "phase",
      label: t("Loading project margins")
    });
    const footerLoading = mountLoadingSkeleton(args.marginsPhase.footerEl, {
      variant: "phase",
      label: t("Loading margin summary")
    });
    const opening = args.marginsController.open();
    marginsOpenPromise = opening;
    void opening.catch((error: unknown) => {
      if (!marginsPhaseActive || !args.marginsPhase) return;
      marginsLoading.clear();
      footerLoading.clear();
      const message = error instanceof Error ? error.message : t("Margins could not be loaded.");
      args.marginsPhase.hostEl.innerHTML = `<p class="margins-phase__status margins-phase__status--error" data-margin-error role="alert">${t("Margins cannot be opened safely.")} ${escapeHtml(message)}</p>`;
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
    else if (id === "documents") showComingSoonDialog(t("Documents"));
    else if (id === "settings") showComingSoonDialog(t("Settings"));
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
    <span>${t(sheet.type)}</span>
    <small>${t(sheet.source)} · ${t(sheet.status)}</small>
  `;
  card.addEventListener("click", () => showComingSoonDialog(sheet.name));
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
      <thead><tr><th>${t("ID")}</th><th>${t("Module")}</th><th>${t("Size")}</th><th>${t("Position")}</th><th>${t("Material")}</th></tr></thead>
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
    row.dataset.scheduleInstanceId = instance.id;
    row.addEventListener("click", () => renderModuleDetail(detail, instance));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") renderModuleDetail(detail, instance);
    });
    tbody?.appendChild(row);
  }
  if (S.instances[0]) renderModuleDetail(detail, S.instances[0]);
  else detail.innerHTML = `<strong>${t("No modules")}</strong><p>${t("The module schedule appears here after modules are added.")}</p>`;
  wrap.append(list, detail);
  return wrap;
}

function renderModuleDetail(target: HTMLElement, instance: LayoutInstance): void {
  const rows = boardRowsForInstance(instance);
  target.innerHTML = `
    <strong>${moduleScheduleId(instance)} · ${formatModuleType(instance.params.type)}</strong>
    <p>${t("Detailed bill of materials for this module.")}</p>
    <table>
      <thead><tr><th>${t("Part ID")}</th><th>${t("Part")}</th><th>${t("Size")}</th><th>${t("Material")}</th><th>${t("Edges")}</th></tr></thead>
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
  return scheduleTable([t("Material"), t("Boards"), t("Modules"), t("Catalog name")], Array.from(rows.entries()).map(([materialId, row]) => [
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
  return scheduleTable([t("Part ID"), t("Part"), t("Size"), t("Module"), t("Edges")], rows);
}

function renderComponentSchedule(S: AppState): HTMLElement {
  const rows = S.instances.flatMap((instance) =>
    Object.entries(instance.params)
      .filter(([key, value]) => key.toLowerCase().includes("component") && typeof value === "string")
      .map(([key, value]) => [`CMP-${String(value).slice(-6).toUpperCase()}`, key, String(value), moduleScheduleId(instance)])
  );
  return scheduleTable([t("Component ID"), t("Use"), t("Catalog ref"), t("Module")], rows);
}

function renderViewSchedule(S: AppState): HTMLElement {
  const baseRows = [
    ["VIEW-FP-001", t("Floorplan"), t("Floor plan"), t("Ready")],
    ["VIEW-3D-001", t("3D"), t("Model view"), t("Ready")],
    ["VIEW-N-001", t("North"), t("Elevation"), t("Ready")],
    ["VIEW-E-001", t("East"), t("Elevation"), t("Ready")],
    ["VIEW-S-001", t("South"), t("Elevation"), t("Ready")],
    ["VIEW-W-001", t("West"), t("Elevation"), t("Ready")]
  ];
  const sectionRows = S.sections.map((section, index) => [`VIEW-SEC-${String(index + 1).padStart(3, "0")}`, section.params.name, t("Section"), t("DXF export later")]);
  return scheduleTable([t("View ID"), t("Name"), t("Type"), t("Status")], [...baseRows, ...sectionRows]);
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
            : `<tr><td colspan="${headers.length}">${t("No records yet.")}</td></tr>`
        }
      </tbody>
    </table>
  `;
  return wrap;
}

async function copyScheduleRow(row: HTMLTableRowElement): Promise<void> {
  const text = Array.from(row.cells, (cell) => cell.textContent?.trim() ?? "").join("\t");
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function boardRowsForInstance(instance: LayoutInstance) {
  const width = numberParam(instance, "width");
  const height = numberParam(instance, "heightCarcass") || numberParam(instance, "height");
  const depth = numberParam(instance, "depth");
  const material = materialIdForModule(instance) ?? "-";
  const prefix = moduleScheduleId(instance);
  return [
    { id: `${prefix}-L`, name: t("Left side"), size: `${depth} × ${height}`, material, edges: t("front") },
    { id: `${prefix}-R`, name: t("Right side"), size: `${depth} × ${height}`, material, edges: t("front") },
    { id: `${prefix}-B`, name: t("Bottom"), size: `${width} × ${depth}`, material, edges: t("front, left, right") },
    { id: `${prefix}-T`, name: t("Top"), size: `${width} × ${depth}`, material, edges: t("front, left, right") },
    { id: `${prefix}-BACK`, name: t("Back panel"), size: `${width} × ${height}`, material: String(instance.params.backMaterialId ?? material), edges: "-" }
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
