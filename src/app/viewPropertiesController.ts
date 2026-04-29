import { getSectionBasis } from "./sectionViews";
import type { KitchenWorktopInstance, LayoutInstance, SectionInstance, WallInstance } from "./localTypes";

type PropertiesAdapter = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
};

type ViewPropertiesContext = {
  props: PropertiesAdapter;
  walls: WallInstance[];
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  sections: SectionInstance[];
  getMode: () => "build" | "layout";
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  isDrawOrthoEnabled: () => boolean;
};

export function createViewPropertiesController(ctx: ViewPropertiesContext) {
  const appendMutedRow = (sectionEl: HTMLElement, label: string, value: string) => {
    const el = document.createElement("div");
    el.className = "muted";
    el.style.marginTop = "4px";
    el.textContent = `${label}: ${value}`;
    sectionEl.appendChild(el);
  };

  const showNoProps = () => {
    ctx.props.setTitle("Properties");
    const sectionEl = ctx.props.section();
    const emptyText = document.createElement("div");
    emptyText.className = "muted";
    emptyText.textContent = ctx.getMode() === "layout"
      ? "Select an object or tool."
      : "Properties are available only in layout mode.";
    sectionEl.appendChild(emptyText);
  };

  const mountActiveViewProps = () => {
    ctx.props.setTitle("View");
    const sectionEl = ctx.props.section();
    const row = (label: string, value: string) => appendMutedRow(sectionEl, label, value);
    const wallCountText = `${ctx.walls.length}`;
    const moduleCountText = `${ctx.instances.length}`;
    const worktopCountText = `${ctx.kitchenWorktops.length}`;
    const viewMode = ctx.getViewMode();
    const activeViewerTab = ctx.getActiveViewerTab();

    if (viewMode === "3d") {
      row("View", "3D");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Worktops", worktopCountText);
      return;
    }
    if (activeViewerTab === "floorplan") {
      row("View", "Floorplan");
      row("Ortho", ctx.isDrawOrthoEnabled() ? "ON" : "OFF");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Sections", `${ctx.sections.length}`);
      return;
    }
    if (activeViewerTab.startsWith("section:")) {
      const sectionId = activeViewerTab.slice("section:".length);
      const section = ctx.sections.find((item) => item.id === sectionId) ?? null;
      if (!section) return showNoProps();
      const basis = getSectionBasis(section.params);
      row("View", section.params.name || section.id);
      row("Type", "Section");
      row("Length", basis ? `${Math.round(basis.length * 1000)} mm` : "0 mm");
      row("Direction", section.params.mirrored ? "Mirrored" : "Default");
      row("Cut line", `${section.params.aMm.x}, ${section.params.aMm.z} -> ${section.params.bMm.x}, ${section.params.bMm.z}`);
      return;
    }
    if (activeViewerTab.startsWith("elevation:")) {
      row("View", activeViewerTab.slice("elevation:".length));
      row("Type", "Elevation");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Worktops", worktopCountText);
      return;
    }
    showNoProps();
  };

  return {
    showNoProps,
    mountActiveViewProps
  };
}
