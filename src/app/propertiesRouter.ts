import * as THREE from "three";
import { formatMm } from "./sharedUtils";
import { getSectionBasis } from "./sectionViews";
import { mountAlignToolPropsPanel, mountKitchenWorktopToolPropsPanel, mountMeasureToolPropsPanel, mountTrimToolPropsPanel, mountWallToolPropsPanel } from "./toolPropsPanels";
import { mountFloorBoundaryPropsPanel, mountFloorPropsPanel, mountSectionPropsPanel, mountSectionToolPropsPanel, mountModulePropsPanel, mountUnderlayPropsPanel, mountWallPropsPanel, mountWindowPropsPanel } from "./selectedPropsPanels";
import { loadUnderlayToCanvas } from "../ui/loadUnderlay";
import { getAllMaterials } from "../data/materials";
import { getMaterialDefinitionById } from "../data/pricing/materialDefinitions";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { MeasureSelectionTarget } from "./measureEditing";
import type { MeasureState } from "./measureTools";
import type { ModuleParams } from "../model/cabinetTypes";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import type {
  AlignPickedLine,
  FloorInstance,
  FloorParams,
  KitchenWorktopJustification,
  LayoutInstance,
  SectionParams,
  SelectedKind,
  WallInstance,
  WallParams
} from "./localTypes";

type RebuildInstanceOptions = {
  skipLayoutValidation?: boolean;
  preserveBackAnchor?: boolean;
  previousParams?: ModuleParams;
  sourceKey?: string;
};

type WallDrawState = {
  preview: THREE.Mesh | null;
  a: THREE.Vector3 | null;
  hoverB: THREE.Vector3 | null;
};

type KitchenWorktopDrawState = {
  active: boolean;
  justification: KitchenWorktopJustification;
};

type AlignState = { ref: AlignPickedLine | null };
type TrimState = { step: "pickTarget" | "pickCutter"; targetPick: AlignPickedLine | null };

type FloorEditState = {
  active: boolean;
  params: FloorParams | null;
  segments: unknown[];
  ortho: boolean;
  error: string;
};

type PropertiesRouterContext = {
  props: PropertiesPanelApi;
  floorEdit: FloorEditState;
  floorDefault: Pick<FloorParams, "heightMm" | "thicknessMm" | "materialId">;
  wallDefault: Pick<WallParams, "thicknessMm" | "justification" | "exteriorSign" | "materialId">;
  wallDraw: WallDrawState;
  kitchenWorktopDraw: KitchenWorktopDrawState;
  sectionDraw: unknown;
  alignState: AlignState;
  trimState: TrimState;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint">;
  args: { propertiesEl: HTMLElement; axisLockEl: HTMLInputElement };
  mode: "build" | "layout";
  layoutTool: string;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  selectedWallId: string | null;
  selectedFloorId: string | null;
  selectedSectionId: string | null;
  selectedInstanceId: string | null;
  selectedWallIds: Set<string>;
  selectedInstanceIds: Set<string>;
  pinnedInstanceIds: Set<string>;
  walls: WallInstance[];
  floors: FloorInstance[];
  sections: Array<{ id: string; params: SectionParams }>;
  instances: LayoutInstance[];
  kitchenWorktops: Array<{ id: string; kitchenGroupId: string }>;
  S: AppState;
  kitchenMode: null | {
    mountKitchenGroupProps: (groupId: string) => boolean;
    tryMountActiveKitchenGroupProps: () => boolean;
  };
  placement: AppState["placement"];
  placementHelpers: PlacementHelpers;
  underlayState: unknown;
  underlayCal: unknown;
  underlayMesh: unknown;
  showNoProps: () => void;
  mountPlacementControls: (state: AppState, helpers: PlacementHelpers) => void;
  mountActiveViewProps: () => void;
  updateWallMeshWithJustification: (
    mesh: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: NonNullable<WallParams["justification"]>,
    exteriorSign: 1 | -1
  ) => void;
  setUnderlayStatus: (status: string) => void;
  clearAllMeasurements: () => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  rebuildFloor: (floor: FloorInstance) => void;
  updateSelectionHighlights: () => void;
  updateLayoutPanel: () => void;
  commitHistory: (state: AppState) => void;
  enterFloorBoundaryEdit: (floorId?: string) => void;
  appendLinkedMeasureInputs: (section: HTMLElement, target: MeasureSelectionTarget | null) => void;
  updateAllSectionVisuals: () => void;
  findInstance: (id: string) => LayoutInstance | null;
  instanceFitsRoom: (inst: LayoutInstance) => boolean;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (inst: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (inst: LayoutInstance) => boolean;
  getModuleDescriptorOrThrow: unknown;
  rebuildInstance: (inst: LayoutInstance, opts?: RebuildInstanceOptions) => boolean;
  ensureLayoutMode: () => void;
  setUnderlayFromCanvas: (...args: never[]) => void;
  setSelectedUnderlay: (...args: never[]) => void;
  updateUnderlayTransform: (...args: never[]) => void;
  clearUnderlay: () => void;
  setSelectedModule: (id: string | null) => void;
  setUnderlayScaleEl: (el: HTMLInputElement) => void;
  setUnderlayOffXEl: (el: HTMLInputElement) => void;
  setUnderlayOffZEl: (el: HTMLInputElement) => void;
  setUnderlayStatusEl: (el: HTMLDivElement) => void;
  markUnderlaySelected: (...args: never[]) => void;
  scheduleKitchenWorktopPreviewUpdate: () => void;
  drawOrthoEnabled: boolean;
};

export function createPropertiesRouter(ctx: PropertiesRouterContext) {
  const mountFloorBoundaryProps = () => mountFloorBoundaryPropsPanel({ props: ctx.props, floorEdit: ctx.floorEdit, getAllMaterials, floorDefault: ctx.floorDefault });
  const mountWallToolProps = () => mountWallToolPropsPanel({ props: ctx.props, wallDefault: ctx.wallDefault, wallDraw: ctx.wallDraw, updateWallMeshWithJustification: ctx.updateWallMeshWithJustification, setUnderlayStatus: ctx.setUnderlayStatus });
  const mountKitchenWorktopToolProps = () => mountKitchenWorktopToolPropsPanel({ props: ctx.props, S: ctx.S, kitchenWorktopDraw: ctx.kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate: ctx.scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById });
  const mountAlignToolProps = () => mountAlignToolPropsPanel({ props: ctx.props, alignState: ctx.alignState });
  const mountTrimToolProps = () => mountTrimToolPropsPanel({ props: ctx.props, trimState: ctx.trimState });
  const mountMeasureToolProps = () => mountMeasureToolPropsPanel({ props: ctx.props, measureState: ctx.measureState, args: ctx.args, formatMm, clearAllMeasurements: ctx.clearAllMeasurements, setUnderlayStatus: ctx.setUnderlayStatus, mountProps });
  const mountWallProps = (w?: WallInstance) => mountWallPropsPanel({ props: ctx.props, selectedWallIds: ctx.selectedWallIds, walls: ctx.walls, showNoProps: ctx.showNoProps, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, rebuildWall: ctx.rebuildWall, rebuildWallPlanMesh: ctx.rebuildWallPlanMesh, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, w);
  const mountFloorProps = (floor: FloorInstance) => mountFloorPropsPanel({ props: ctx.props, getAllMaterials, floorDefault: ctx.floorDefault, rebuildFloor: ctx.rebuildFloor, updateSelectionHighlights: ctx.updateSelectionHighlights, commitHistory: ctx.commitHistory, S: ctx.S, enterFloorBoundaryEdit: ctx.enterFloorBoundaryEdit, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, floor);
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
          instanceIds: new Set(ctx.instances.filter((inst) => inst.kitchenGroupId === ctx.selectedKitchenGroupId).map((inst) => inst.id)),
          worktopIds: new Set(ctx.kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === ctx.selectedKitchenGroupId).map((worktop) => worktop.id))
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
      const w = ctx.walls.find((x) => x.id === ctx.selectedWallId) ?? null;
      if (w) return mountWallProps(w);
      return ctx.showNoProps();
    }
    if (ctx.selectedKind === "floor" && ctx.selectedFloorId) {
      const floor = ctx.floors.find((x) => x.id === ctx.selectedFloorId) ?? null;
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
