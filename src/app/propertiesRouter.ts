import { formatMm } from "./sharedUtils";
import { getSectionBasis } from "./sectionViews";
import { mountAlignToolPropsPanel, mountKitchenWorktopToolPropsPanel, mountMeasureToolPropsPanel, mountTrimToolPropsPanel, mountWallToolPropsPanel } from "./toolPropsPanels";
import { mountFloorBoundaryPropsPanel, mountFloorPropsPanel, mountSectionPropsPanel, mountSectionToolPropsPanel, mountModulePropsPanel, mountUnderlayPropsPanel, mountWallPropsPanel, mountWindowPropsPanel } from "./selectedPropsPanels";
import { loadUnderlayToCanvas } from "../ui/loadUnderlay";
import { getAllMaterials } from "../data/materials";
import { getMaterialDefinitionById } from "../data/pricing/materialDefinitions";

export function createPropertiesRouter(ctx: any) {
  const mountFloorBoundaryProps = () => mountFloorBoundaryPropsPanel({ props: ctx.props, floorEdit: ctx.floorEdit, getAllMaterials, floorDefault: ctx.floorDefault });
  const mountWallToolProps = () => mountWallToolPropsPanel({ props: ctx.props, wallDefault: ctx.wallDefault, wallDraw: ctx.wallDraw, updateWallMeshWithJustification: ctx.updateWallMeshWithJustification, setUnderlayStatus: ctx.setUnderlayStatus });
  const mountKitchenWorktopToolProps = () => mountKitchenWorktopToolPropsPanel({ props: ctx.props, S: ctx.S, kitchenWorktopDraw: ctx.kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate: ctx.scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById });
  const mountAlignToolProps = () => mountAlignToolPropsPanel({ props: ctx.props, alignState: ctx.alignState });
  const mountTrimToolProps = () => mountTrimToolPropsPanel({ props: ctx.props, trimState: ctx.trimState });
  const mountMeasureToolProps = () => mountMeasureToolPropsPanel({ props: ctx.props, measureState: ctx.measureState, args: ctx.args, formatMm, clearAllMeasurements: ctx.clearAllMeasurements, setUnderlayStatus: ctx.setUnderlayStatus, mountProps });
  const mountWallProps = (w?: any) => mountWallPropsPanel({ props: ctx.props, selectedWallIds: ctx.selectedWallIds, walls: ctx.walls, showNoProps: ctx.showNoProps, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, rebuildWall: ctx.rebuildWall, rebuildWallPlanMesh: ctx.rebuildWallPlanMesh, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, w);
  const mountFloorProps = (floor: any) => mountFloorPropsPanel({ props: ctx.props, getAllMaterials, floorDefault: ctx.floorDefault, rebuildFloor: ctx.rebuildFloor, updateSelectionHighlights: ctx.updateSelectionHighlights, commitHistory: ctx.commitHistory, S: ctx.S, enterFloorBoundaryEdit: ctx.enterFloorBoundaryEdit, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, floor);
  const mountSectionToolProps = () => mountSectionToolPropsPanel({ props: ctx.props, sectionDraw: ctx.sectionDraw, drawOrthoEnabled: ctx.drawOrthoEnabled });
  const mountSectionProps = (id: string) => mountSectionPropsPanel({ props: ctx.props, sections: ctx.sections, showNoProps: ctx.showNoProps, getSectionBasis, updateAllSectionVisuals: ctx.updateAllSectionVisuals, mountProps, commitHistory: ctx.commitHistory, S: ctx.S }, id);
  const mountModuleProps = (id: string) => mountModulePropsPanel({ findInstance: ctx.findInstance, showNoProps: ctx.showNoProps, props: ctx.props, pinnedInstanceIds: ctx.pinnedInstanceIds, instanceFitsRoom: ctx.instanceFitsRoom, anyOverlap: ctx.anyOverlap, moduleOverlapsWalls: ctx.moduleOverlapsWalls, moduleOverlapsKitchenWorktops: ctx.moduleOverlapsKitchenWorktops, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, getModuleDescriptorOrThrow: ctx.getModuleDescriptorOrThrow, args: ctx.args, rebuildInstance: ctx.rebuildInstance, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, id);
  const mountWindowProps = () => mountWindowPropsPanel({ props: ctx.props });
  const mountUnderlayProps = () => mountUnderlayPropsPanel({
    props: ctx.props,
    loadUnderlayToCanvas,
    ensureLayoutMode: ctx.ensureLayoutMode,
    setUnderlayStatus: ctx.setUnderlayStatus,
    setUnderlayFromCanvas: ctx.setUnderlayFromCanvas,
    underlayState: ctx.underlayState,
    commitHistory: ctx.commitHistory,
    S: ctx.S,
    setSelectedUnderlay: ctx.setSelectedUnderlay,
    updateUnderlayTransform: ctx.updateUnderlayTransform,
    underlayCal: ctx.underlayCal,
    underlayMesh: ctx.underlayMesh,
    clearUnderlay: ctx.clearUnderlay,
    setSelectedModule: ctx.setSelectedModule,
    mountProps,
    setUnderlayScaleEl: ctx.setUnderlayScaleEl,
    setUnderlayOffXEl: ctx.setUnderlayOffXEl,
    setUnderlayOffZEl: ctx.setUnderlayOffZEl,
    setUnderlayStatusEl: ctx.setUnderlayStatusEl,
    markUnderlaySelected: ctx.markUnderlaySelected
  });

  function mountProps() {
    if (ctx.mode !== "layout") return ctx.showNoProps();
    if (ctx.floorEdit.active) return mountFloorBoundaryProps();
    if (ctx.placement.active) return ctx.mountPlacementControls(ctx.S, ctx.placementHelpers);
    if (ctx.layoutTool === "wall") return mountWallToolProps();
    if (ctx.layoutTool === "measure") return mountMeasureToolProps();
    if (ctx.layoutTool === "section") return mountSectionToolProps();
    if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) return mountKitchenWorktopToolProps();
    if (ctx.layoutTool === "align") return mountAlignToolProps();
    if (ctx.layoutTool === "trim") return mountTrimToolProps();
    if (ctx.selectedKind === "kitchenGroup" && ctx.selectedKitchenGroupId && ctx.kitchenMode?.mountKitchenGroupProps(ctx.selectedKitchenGroupId)) {
      const section = ctx.args.propertiesEl.querySelector(".props-section:last-of-type") as HTMLElement | null;
      if (section) {
        ctx.appendLinkedMeasureInputs(section, {
          kind: "kitchenGroup",
          groupId: ctx.selectedKitchenGroupId,
          instanceIds: new Set(ctx.instances.filter((inst: any) => inst.kitchenGroupId === ctx.selectedKitchenGroupId).map((inst: any) => inst.id)),
          worktopIds: new Set(ctx.kitchenWorktops.filter((worktop: any) => worktop.kitchenGroupId === ctx.selectedKitchenGroupId).map((worktop: any) => worktop.id))
        });
      }
      return;
    }
    if (ctx.selectedKind === "underlay") return mountUnderlayProps();
    if (ctx.selectedWallIds.size > 1 && ctx.selectedInstanceIds.size === 0) return mountWallProps();
    if (ctx.selectedWallIds.size + ctx.selectedInstanceIds.size > 1) {
      ctx.args.propertiesEl.innerHTML = "";
      const t = document.createElement("div");
      t.className = "props-title";
      t.textContent = "Properties";
      ctx.args.propertiesEl.appendChild(t);
      const s = document.createElement("div");
      s.className = "props-section";
      s.innerHTML = `<div class="muted">Selected: ${ctx.selectedWallIds.size} wall(s), ${ctx.selectedInstanceIds.size} module(s)</div>
      <div class="muted" style="margin-top:6px;">Delete = remove selected</div>`;
      ctx.args.propertiesEl.appendChild(s);
      return;
    }
    if (ctx.selectedKind === "wall") {
      const w = ctx.walls.find((x: any) => x.id === ctx.selectedWallId) ?? null;
      if (w) return mountWallProps(w);
      return ctx.showNoProps();
    }
    if (ctx.selectedKind === "floor" && ctx.selectedFloorId) {
      const floor = ctx.floors.find((x: any) => x.id === ctx.selectedFloorId) ?? null;
      if (floor) return mountFloorProps(floor);
      return ctx.showNoProps();
    }
    if (ctx.selectedKind === "window") return mountWindowProps();
    if (ctx.selectedKind === "section" && ctx.selectedSectionId) return mountSectionProps(ctx.selectedSectionId);
    if (ctx.selectedKind === "module" && ctx.selectedInstanceId) return mountModuleProps(ctx.selectedInstanceId);
    if (ctx.kitchenMode && ctx.kitchenMode.tryMountActiveKitchenGroupProps()) return;
    ctx.mountActiveViewProps();
  }

  return { mountProps };
}
