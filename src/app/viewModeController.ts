import * as THREE from "three";

type AppMode = "build" | "layout";

export function createViewModeController(ctx: any) {
  function setView2d(enabled: boolean) {
    if (!enabled && ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) {
      ctx.handleKitchenWorktopEscape();
    }
    ctx.viewMode = enabled ? "2d" : "3d";
    ctx.S.viewMode = ctx.viewMode;
    ctx.setViewMode(ctx.viewMode);
    if (!enabled) ctx.activeViewerTab = "3d";
    if (enabled && ctx.activeViewerTab === "3d") ctx.activeViewerTab = "floorplan";
    ctx.syncViewerTabs(ctx.activeViewerTab);
    const isFloorplanView = enabled && ctx.activeViewerTab === "floorplan";
    const isDetailOrthoView = enabled && ctx.activeViewerTab !== "floorplan";
    ctx.setPlanPresentation(isFloorplanView);
    ctx.viewNavigation.syncControls();
    if (!isDetailOrthoView) {
      ctx.activeDetailClipPlanes = [];
    }

    for (const inst of ctx.instances) {
      ctx.ensurePickAndOutline(inst, isFloorplanView);
      inst.module.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.95 : 0.98;
      outlineMaterial.depthTest = !enabled;
      inst.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    if (ctx.windowInst) {
      const outlineMaterial = ctx.windowInst.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.98 : 0.75;
      outlineMaterial.depthTest = !enabled;
      ctx.windowInst.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    for (const floor of ctx.floors) {
      floor.mesh.visible = !enabled || isFloorplanView;
      (floor.outline.material as THREE.LineBasicMaterial).depthTest = !enabled;
      floor.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    for (const worktop of ctx.kitchenWorktops) {
      worktop.outline.geometry.dispose();
      worktop.outline.geometry = ctx.makeKitchenWorktopOutlineGeometry(worktop.params, isFloorplanView);
      worktop.outline.position.set(0, worktop.params.heightMm / 1000 + (isFloorplanView ? 0.0015 : 0), 0);
      worktop.mesh.visible = !enabled || isFloorplanView || isDetailOrthoView;
      worktop.outline.visible = isFloorplanView || isDetailOrthoView;
      const outlineMaterial = worktop.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.98 : 0.94;
    }

    ctx.wallSnapMarkers.visible = isFloorplanView && !!ctx.selectedWallId;
    if (!isFloorplanView) {
      ctx.drawSnapOverlay.hide();
      ctx.hideHoverCursor();
    }
    ctx.updateSelectionHighlights();
    ctx.updateAllSectionVisuals();
    ctx.updateDetailSliceOverlay();

    ctx.wallPlanGroup.visible = isFloorplanView;
    ctx.rebuildWallPlanMesh();
    for (const w of ctx.walls) {
      w.mesh.visible = !enabled || isFloorplanView || isDetailOrthoView;
      w.outline.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = w.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0 : 0.94;
      outlineMaterial.depthTest = !(isFloorplanView || isDetailOrthoView);
    }
    ctx.syncDetailClippingAndMaterials();
  }

  function setMode(next: AppMode) {
    if (next !== "layout") return;
    ctx.mode = next;
    ctx.S.mode = ctx.mode;

    const isLayout = ctx.mode === "layout";
    if (!isLayout && ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
    ctx.buildUi.style.display = isLayout ? "none" : "";
    ctx.layoutUi.style.display = isLayout ? "" : "none";
    ctx.partsBuildHost.style.display = isLayout ? "none" : "";
    ctx.partsLayoutHost.style.display = isLayout ? "" : "none";

    ctx.args.propertiesEl.hidden = !isLayout;
    if (ctx.drawOrthoToggleEl) ctx.drawOrthoToggleEl.style.display = isLayout ? "" : "none";
    if (!isLayout) {
      ctx.layoutTool = "select";
      ctx.clearWallDrawState();
    }

    if (!isLayout) {
      ctx.measureState.enabled = false;
      ctx.args.measureBtn.textContent = "Measure: Off";
      ctx.clearAllMeasurements();
      ctx.hideHoverCursor();
      ctx.args.measureReadoutEl.textContent = "";
    }

    ctx.layoutRoot.visible = isLayout;

    if (ctx.cabinetGroup) ctx.cabinetGroup.visible = !isLayout;
    ctx.clearOverlapHighlight();
    ctx.selectMesh(null);

    if (isLayout) {
      setView2d(ctx.view2d.checked);
      ctx.updateLayoutPanel();
      if (ctx.selectedKind === "window") ctx.setSelectedWindow();
      else if (ctx.selectedKind === "section") ctx.setSelectedSection(ctx.selectedSectionId);
      else if (ctx.selectedKind === "wall") ctx.setSelectedWall(ctx.selectedWallId);
      else if (ctx.selectedKind === "floor") ctx.setSelectedFloor(ctx.selectedFloorId);
      else ctx.setSelectedModule(ctx.selectedInstanceId);

      // Hide selection editors in right panel (use properties panel on the left).
      ctx.windowEditorHost.style.display = "none";
      ctx.instanceEditorHost.style.display = "none";
      ctx.mountProps();
    } else {
      setView2d(false);
      ctx.selectedKind = null;
      ctx.selectedWallId = null;
      ctx.windowEditorHost.style.display = "none";
      ctx.instanceEditorHost.style.display = "";
      ctx.setInstanceSelected(null);
      ctx.mountControls();
      ctx.rebuild();
      ctx.showNoProps();
    }
  }

  return { setView2d, setMode };
}
