import * as THREE from "three";

export function createClassicTopbarController(ctx: any) {
  const buildClassicTopbar = () => {
    const row = ctx.tb.addRow({ className: "topbar-classic-ribbon" });

    const tools = ctx.tb.addGroup("Layout", { row });
    ctx.tb.toolButton(tools, { title: "Select", label: "Select", iconSvg: ctx.I_SELECT, onClick: () => ctx.setToolSelect() });
    ctx.tb.toolButton(tools, { title: "Wall", label: "Wall", iconSvg: ctx.I_WALL, onClick: () => ctx.setToolWall() });
    ctx.tb.toolButton(tools, { title: "Align", label: "Align", iconSvg: ctx.I_ALIGN, onClick: () => ctx.setToolAlign() });
    ctx.tb.toolButton(tools, { title: "Trim", label: "Trim", iconSvg: ctx.I_TRIM, onClick: () => ctx.setToolTrim() });
    ctx.tb.toolButton(tools, { title: "Section", label: "Section", iconSvg: ctx.I_SECTION, onClick: () => ctx.setToolSection() });
    ctx.tb.toolButton(tools, {
      title: "Dimension",
      label: "KĂ„â€šÄąâ€šta",
      iconSvg: ctx.I_DIM,
      onClick: () => ctx.setToolDimension()
    });
    ctx.tb.toolButton(tools, {
      title: "Measure",
      label: "Measure",
      iconSvg: ctx.I_DIM,
      onClick: () => {
        if (ctx.layoutTool === "measure") ctx.setToolSelect();
        else ctx.setToolMeasure();
      }
    });
    ctx.tb.toolButton(tools, { title: "Floor", label: "Floor", iconSvg: ctx.I_FLOOR, onClick: () => ctx.enterFloorBoundaryEdit() });
    ctx.tb.toolButton(tools, { title: "Underlay", label: "Underlay", iconSvg: ctx.I_UNDERLAY, onClick: ctx.openUnderlayPanel });
    ctx.tb.toolButton(tools, { title: "Kitchen", label: "Kitchen", iconSvg: ctx.I_CABINET, onClick: () => ctx.kitchenMode?.enterNew() });

    const edit = ctx.tb.addGroup("Edit", { row });
    ctx.S.undoBtnEl = ctx.tb.toolButton(edit, { title: "Undo", label: "Undo", iconSvg: ctx.I_UNDO, onClick: () => ctx.undo(ctx.S, ctx.helpers) });
    ctx.S.redoBtnEl = ctx.tb.toolButton(edit, { title: "Redo", label: "Redo", iconSvg: ctx.I_REDO, onClick: () => ctx.redo(ctx.S, ctx.helpers) });
    ctx.tb.toolButton(edit, { title: "Move", label: "Move", iconSvg: ctx.I_MOVE, onClick: () => ctx.startTransformFromSelection("move") });
    ctx.tb.toolButton(edit, { title: "Rotate", label: "Rotate", iconSvg: ctx.I_ROTATE, onClick: () => ctx.startTransformFromSelection("rotate") });
    ctx.tb.toolButton(edit, { title: "Duplicate", label: "Duplicate", iconSvg: ctx.I_DUP, onClick: ctx.duplicateSelected });
    ctx.tb.toolButton(edit, { title: "Delete", label: "Delete", iconSvg: ctx.I_TRASH, onClick: ctx.deleteSelected });

    const project = ctx.tb.addGroup("Project", { row });
    ctx.tb.toolButton(project, { title: "2D View", label: "2D View", iconSvg: ctx.I_GRID2D, onClick: ctx.toggle2dView });
    ctx.tb.toolButton(project, { title: "Reset Defaults", label: "Reset", iconSvg: ctx.I_RESET, onClick: () => ctx.args.resetBtn.click() });
    ctx.tb.toolButton(project, { title: "Export JSON", label: "Export", iconSvg: ctx.I_EXPORT, onClick: () => ctx.args.exportBtn.click() });
    ctx.tb.toolButton(project, { title: "Copy Export", label: "Copy", iconSvg: ctx.I_COPY, onClick: () => ctx.args.copyBtn.click() });
    ctx.tb.toolButton(project, { title: "Pricing Catalog", iconSvg: ctx.I_BOM, label: "Catalog", onClick: ctx.openPricingCatalog });
    ctx.tb.toolButton(project, {
      title: "BOM",
      iconSvg: ctx.I_BOM,
      label: "BOM",
      onClick: () => ctx.openBomPanel({ instances: ctx.S.instances, kitchenWorktops: ctx.S.kitchenWorktops, kitchenCtx: ctx.S.kitchenCtx })
    });
    const installBtn = ctx.tb.toolButton(project, {
      title: "Install App",
      label: "Install",
      iconSvg: ctx.I_INSTALL,
      onClick: () => {
        const state = ctx.getInstallState();
        if (state.available) {
          void ctx.promptAppInstall();
          return;
        }
        window.alert("Chrome: Save and share > Install page as app.");
      }
    });
    const syncInstallButton = () => {
      const state = ctx.getInstallState();
      installBtn.style.display = state.supported && !state.installed ? "" : "none";
      installBtn.style.opacity = state.available ? "1" : "0.72";
      installBtn.title = state.available ? "Install App" : "Install App (Chrome menu)";
    };
    syncInstallButton();
    ctx.subscribeInstallState(syncInstallButton);
    const resetViewBtn = ctx.args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
    ctx.tb.toolButton(project, { title: "Reset View", label: "View", iconSvg: ctx.I_VIEW, onClick: () => resetViewBtn?.click() });

    ctx.updateUndoRedoUi(ctx.S);
  };

  return { buildClassicTopbar };
}
