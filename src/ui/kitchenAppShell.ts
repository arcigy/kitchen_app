import { actionIconMarkup, type ActionIconId } from "./actionIcons";
import { t } from "../i18n";

const navItems: Array<{ id: string; label: string; iconId: ActionIconId }> = [
  {
    id: "design",
    label: "Design",
    iconId: "design"
  },
  {
    id: "sheets",
    label: "Sheets",
    iconId: "sheets"
  },
  {
    id: "documents",
    label: "Documents",
    iconId: "documents"
  },
  {
    id: "visualisation",
    label: "Visualisation",
    iconId: "visualisation"
  },
  {
    id: "schedules",
    label: "Schedules",
    iconId: "schedules"
  },
  {
    id: "margins",
    label: "Margins",
    iconId: "margins"
  },
  {
    id: "materials",
    label: "Materials",
    iconId: "materials"
  },
  {
    id: "settings",
    label: "Settings",
    iconId: "settings"
  }
];

export function renderKitchenAppShell(root: HTMLElement): void {
  root.className = "archux-app";
  root.innerHTML = `
    <header class="arcigy-mobile-header" data-mobile-header aria-label="${t("Mobile workspace header")}">
      <button type="button" data-mobile-projects aria-label="${t("Projects")}">‹</button>
      <div class="arcigy-mobile-header__title">
        <strong>${t("Arcigy project")}</strong>
        <span aria-live="polite">${t("Workspace ready")}</span>
      </div>
      <button type="button" class="arcigy-mobile-save" data-mobile-save aria-label="${t("Save project")}">${t("Save")}</button>
      <div class="arcigy-mobile-workspace-switcher">
        <button type="button" data-mobile-workspace-toggle aria-haspopup="menu" aria-expanded="false">${t("Design")} ▾</button>
        <div class="arcigy-mobile-workspace-menu" data-mobile-workspace-menu role="menu" hidden>
          ${navItems.map((item) => `<button type="button" role="menuitem" data-mobile-workspace="${item.id}">${t(item.label)}</button>`).join("")}
        </div>
      </div>
    </header>
    <header id="ribbon" aria-label="${t("Ribbon toolbar")}"></header>

    <div id="main" class="archux-main" role="main">
      <nav class="archux-side-nav" aria-label="${t("Main navigation")}">
        ${navItems
          .map(
            (item, index) => `
              <button class="archux-side-nav-item${index === 0 ? " active" : ""}" type="button" data-workspace-nav="${item.id}">
                ${actionIconMarkup(item.iconId, "archux-side-icon")}
                <span>${t(item.label)}</span>
              </button>
            `
          )
          .join("")}
      </nav>

      <aside id="moduleCatalog" class="archux-module-catalog" aria-label="${t("Module catalog")}" hidden></aside>

      <div id="viewer" aria-label="${t("3D viewer")}">
        <button id="resetViewBtn" type="button" title="${t("Reset view")}">${t("Reset view")}</button>
        <div class="archux-view-tools" role="toolbar" aria-label="${t("Viewer navigation tools")}">
          <button class="archux-view-tool active" type="button" data-viewer-tool="select" aria-label="${t("Select")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8.7 5.4 23.9 19.8l-8.4.6-3.8 7.2Z" />
              <path d="m17.4 19.7 5.2 7" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="pan" aria-label="${t("Pan")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M11.2 15.3V8.4a2.1 2.1 0 0 1 4.2 0v5.7" />
              <path d="M15.4 14.2V6.9a2.1 2.1 0 0 1 4.2 0v7.9" />
              <path d="M19.6 15V9.1a2.1 2.1 0 0 1 4.1 0v9.8" />
              <path d="M11.2 15.4 9.3 13.5a2.15 2.15 0 0 0-3.1 3l6.5 7.6a7.1 7.1 0 0 0 5.4 2.5h.9a6.7 6.7 0 0 0 6.7-6.7v-4.2" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="zoom-out" aria-label="${t("Zoom out")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="13.7" cy="13.7" r="8.1" />
              <path d="M19.7 19.7 26.6 26.6" />
              <path d="M9.4 13.7H18" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="zoom-in" aria-label="${t("Zoom in")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="13.7" cy="13.7" r="8.1" />
              <path d="M19.7 19.7 26.6 26.6" />
              <path d="M9.4 13.7H18" />
              <path d="M13.7 9.4V18" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="orbit" aria-label="${t("Orbit")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8.4 10.5 16 6.1l7.6 4.4v9L16 23.9l-7.6-4.4Z" />
              <path d="M16 14.9v9" />
              <path d="m8.4 10.5 7.6 4.4 7.6-4.4" />
              <path d="M10.5 21.1a10.8 10.8 0 0 0 13.7-2" />
              <path d="m25.2 16.7-.7 3.9-3.7-.9" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="fit" aria-label="${t("Fit view")}">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6.5 13V6.5H13" />
              <path d="M25.5 13V6.5H19" />
              <path d="M6.5 19v6.5H13" />
              <path d="M19 25.5h6.5V19" />
              <path d="M12 20 20 12" />
              <path d="M15.3 11.7H20v4.7" />
            </svg>
          </button>
        </div>
        <div class="archux-view-cube" role="group" aria-label="${t("View cube")}">
          <button class="archux-view-cube-roll roll-left" type="button" data-view-rotate="ccw" aria-label="${t("Rotate view left")}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7.2a6.5 6.5 0 1 1-1.6 6.6" /><path d="M8.6 3.8v3.6H5" /></svg>
          </button>
          <button class="archux-view-cube-roll roll-right" type="button" data-view-rotate="cw" aria-label="${t("Rotate view right")}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 7.2a6.5 6.5 0 1 0 1.6 6.6" /><path d="M15.4 3.8v3.6H19" /></svg>
          </button>
          <div class="archux-view-cube-orbit" aria-hidden="true"></div>
          <div class="archux-view-cube-shell-shadow" aria-hidden="true"></div>
          <div class="archux-view-cube-shell">
            <button class="archux-view-cube-face face-front" type="button" data-view-target="front">${t("Front")}</button>
            <button class="archux-view-cube-face face-back" type="button" data-view-target="back">${t("Back")}</button>
            <button class="archux-view-cube-face face-right" type="button" data-view-target="right">${t("Right")}</button>
            <button class="archux-view-cube-face face-left" type="button" data-view-target="left">${t("Left")}</button>
            <button class="archux-view-cube-face face-top" type="button" data-view-target="top">${t("Top")}</button>
            <button class="archux-view-cube-face face-bottom" type="button" data-view-target="bottom">${t("Bottom")}</button>
            <button class="archux-view-cube-hit hit-edge hit-top-front" type="button" data-view-target="top-front" aria-label="${t("Top front edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-back" type="button" data-view-target="top-back" aria-label="${t("Top back edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-left" type="button" data-view-target="top-left" aria-label="${t("Top left edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-right" type="button" data-view-target="top-right" aria-label="${t("Top right edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-front-left" type="button" data-view-target="front-left" aria-label="${t("Front left edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-front-right" type="button" data-view-target="front-right" aria-label="${t("Front right edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-back-left" type="button" data-view-target="back-left" aria-label="${t("Back left edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-back-right" type="button" data-view-target="back-right" aria-label="${t("Back right edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-front" type="button" data-view-target="bottom-front" aria-label="${t("Bottom front edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-back" type="button" data-view-target="bottom-back" aria-label="${t("Bottom back edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-left" type="button" data-view-target="bottom-left" aria-label="${t("Bottom left edge view")}"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-right" type="button" data-view-target="bottom-right" aria-label="${t("Bottom right edge view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-front-left" type="button" data-view-target="top-front-left" aria-label="${t("Top front left view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-front-right" type="button" data-view-target="top-front-right" aria-label="${t("Top front right view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-back-left" type="button" data-view-target="top-back-left" aria-label="${t("Top back left view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-back-right" type="button" data-view-target="top-back-right" aria-label="${t("Top back right view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-front-left" type="button" data-view-target="bottom-front-left" aria-label="${t("Bottom front left view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-front-right" type="button" data-view-target="bottom-front-right" aria-label="${t("Bottom front right view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-back-left" type="button" data-view-target="bottom-back-left" aria-label="${t("Bottom back left view")}"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-back-right" type="button" data-view-target="bottom-back-right" aria-label="${t("Bottom back right view")}"></button>
          </div>
        </div>
      </div>

      <section id="materialsPhase" class="archux-materials-phase-panel" aria-label="${t("Materials and components")}" hidden></section>
      <section id="marginsPhase" class="archux-margins-phase-panel" aria-label="${t("Project margins")}" hidden></section>

      <aside id="properties" aria-label="${t("Properties")}"></aside>

      <footer class="archux-bottom" aria-label="${t("Project overview")}">
        <section class="archux-levels archux-view-list" data-bottom-default data-bottom-views>
          <strong>${t("Views")}</strong>
          <div class="archux-view-list-scroll">
            <button type="button" data-bottom-view-key="floorplan"><span>${t("Floorplan")}</span></button>
            <button type="button" data-bottom-view-key="3d" class="active"><span>${t("3D")}</span></button>
            <button type="button" data-bottom-view-key="elevation:north"><span>${t("North")}</span></button>
            <button type="button" data-bottom-view-key="elevation:east"><span>${t("East")}</span></button>
            <button type="button" data-bottom-view-key="elevation:south"><span>${t("South")}</span></button>
            <button type="button" data-bottom-view-key="elevation:west"><span>${t("West")}</span></button>
          </div>
        </section>
        <section class="archux-levels archux-material-warning-panel" data-bottom-default data-material-warning-panel hidden>
          <strong>${t("Warnings")}</strong>
          <div class="archux-material-warning-list" data-material-warning-list></div>
        </section>
        <section class="archux-area archux-live-price" data-bottom-default>
          <strong>${t("BOM / pricing")}</strong>
          <div class="archux-pricing-summary" data-project-pricing-summary aria-live="polite">
            <p class="archux-pricing-summary__state" data-project-pricing-state>Prepočítať cenu podľa aktuálneho návrhu.</p>
            <div class="archux-pricing-summary__metrics">
              <div><span>Cena projektu</span><b data-project-pricing-final-price>—</b></div>
              <div><span>Položky</span><b data-project-pricing-item-count>—</b></div>
              <div><span>Bez ceny</span><b data-project-pricing-missing-count>—</b></div>
            </div>
            <div class="archux-pricing-summary__actions">
              <button class="archux-pricing-summary__recalculate" type="button" data-recalculate-project-price>Prepočítať cenu</button>
              <button class="archux-activity-open" type="button" data-open-bom-panel>${t("Open BOM")}</button>
            </div>
          </div>
        </section>
        <section class="archux-sheet" data-bottom-default>
          <strong>${t("Sheet preview")}</strong>
          <div></div>
          <span>${t("A101 - Floor plan level 1")}</span>
        </section>
        <section class="archux-margin-footer" data-margin-footer hidden></section>
        <section class="archux-activity">
          <strong>${t("Recent activity")}</strong>
          <div class="archux-activity-list" data-recent-activity>
            <p><span>${t("No recent changes")}</span><b>${t("now")}</b></p>
          </div>
          <button class="archux-activity-open" type="button" data-recent-activity-count>${t("0 changes")}</button>
        </section>
      </footer>
    </div>

    <button class="arcigy-mobile-scrim" type="button" data-mobile-scrim aria-label="${t("Close panel")}" hidden></button>
    <section class="arcigy-mobile-command-sheet" data-mobile-command-sheet aria-label="${t("All commands")}">
      <header>
        <strong>${t("All commands")}</strong>
        <button type="button" data-mobile-multi-select aria-pressed="false">${t("Multi-select")}</button>
        <button type="button" data-mobile-project-overview>${t("Project overview")}</button>
        <button type="button" data-mobile-sheet-close aria-label="${t("Close")}">×</button>
      </header>
      <label class="arcigy-mobile-command-search">
        <span>${t("Search commands")}</span>
        <input type="search" data-mobile-command-search placeholder="${t("Search commands")}" autocomplete="off" />
      </label>
      <div class="arcigy-mobile-command-list" data-mobile-command-list></div>
    </section>

    <div class="arcigy-mobile-command-hud" data-mobile-command-hud role="toolbar" aria-label="${t("Active command")}">
      <strong data-mobile-hud-label></strong>
      <label class="arcigy-mobile-hud-value"><span>${t("Value")}</span><input type="text" inputmode="decimal" data-mobile-hud-value aria-label="${t("Numeric value")}" /></label>
      <button type="button" data-mobile-hud-apply>${t("Apply")}</button>
      <button type="button" data-mobile-hud-back>${t("Back")}</button>
      <button type="button" data-mobile-hud-snap>Snap</button>
      <button type="button" data-mobile-hud-ortho>Ortho</button>
      <button type="button" data-mobile-hud-alternate></button>
      <button type="button" data-mobile-hud-finish>${t("Finish")}</button>
      <button type="button" data-mobile-hud-cancel>${t("Cancel")}</button>
    </div>

    <nav class="arcigy-mobile-dock" data-mobile-dock aria-label="${t("Mobile editor controls")}">
      <button type="button" data-mobile-panel="commands" aria-expanded="false"><b data-mobile-active-tool>${t("Select")}</b><span>${t("Tool")}</span></button>
      <button type="button" data-mobile-command="undo"><b>↶</b><span>${t("Undo")}</span></button>
      <button type="button" data-mobile-command="redo"><b>↷</b><span>${t("Redo")}</span></button>
      <button type="button" data-mobile-panel="properties" aria-expanded="false"><b>☷</b><span>${t("Properties")}</span></button>
      <button type="button" data-mobile-panel="commands" aria-expanded="false"><b>•••</b><span>${t("More")}</span></button>
    </nav>
  `;
}
