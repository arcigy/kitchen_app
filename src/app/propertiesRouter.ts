import * as THREE from "three";
import { formatMm } from "./sharedUtils";
import { getSectionBasis } from "./sectionViews";
import { mountAlignToolPropsPanel, mountKitchenWorktopToolPropsPanel, mountMeasureToolPropsPanel, mountTrimToolPropsPanel, mountWallToolPropsPanel } from "./toolPropsPanels";
import { mountColumnPlacementPropsPanel, mountColumnPropsPanel, mountDoorPlacementPropsPanel, mountDoorPropsPanel, mountFloorBoundaryPropsPanel, mountFloorPropsPanel, mountSectionPropsPanel, mountSectionToolPropsPanel, mountModulePropsPanel, mountMultiModulePropsPanel, mountUnderlayPropsPanel, mountWallPropsPanel, mountWindowPlacementPropsPanel, mountWindowPropsPanel } from "./selectedPropsPanels";
import { loadUnderlayToCanvas } from "../ui/loadUnderlay";
import type { Material } from "../types/material";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { UnderlaySource } from "../ui/loadUnderlay";
import type { MeasureSelectionTarget } from "./measureEditing";
import type { MeasureState } from "./measureTools";
import type { ModuleParams } from "../model/cabinetTypes";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import type {
  AlignPickedLine,
  ColumnInstance,
  ColumnParams,
  DoorInstance,
  DoorParams,
  FloorBoundarySegment,
  FloorInstance,
  FloorParams,
  KitchenWorktopJustification,
  LayoutInstance,
  SectionParams,
  SelectedKind,
  WallInstance,
  WallParams,
  WindowInstance,
  WindowParams
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
  segments: FloorBoundarySegment[];
  ortho: boolean;
  error: string;
};

type SectionDrawState = { a: { x: number; z: number } | null; mirrored: boolean };

type UnderlayState = {
  opacity: number;
  scale: number;
  rotationDeg: number;
  offsetMm: { x: number; z: number };
  pinned: boolean;
  sourceName?: string | null;
};

type UnderlayCalibrationState = {
  knownMm: number;
  active: boolean;
  mode: "calibrate" | "reference";
  first: unknown | null;
};

type PropertiesRouterContext = {
  props: PropertiesPanelApi;
  floorEdit: FloorEditState;
  floorDefault: Pick<FloorParams, "heightMm" | "thicknessMm" | "materialId">;
  wallDefault: Pick<WallParams, "typeId" | "thicknessMm" | "heightMm" | "justification" | "exteriorSign" | "materialId">;
  wallDraw: WallDrawState;
  kitchenWorktopDraw: KitchenWorktopDrawState;
  sectionDraw: SectionDrawState;
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
  selectedColumnId: string | null;
  selectedSectionId: string | null;
  selectedInstanceId: string | null;
  selectedWallIds: Set<string>;
  selectedInstanceIds: Set<string>;
  pinnedInstanceIds: Set<string>;
  wallJoinTolMm: number;
  walls: WallInstance[];
  columns: ColumnInstance[];
  columnPlacementParams: ColumnParams | null;
  windowInst: WindowInstance | null;
  windowPlacementParams: WindowParams | null;
  floors: FloorInstance[];
  sections: Array<{ id: string; params: SectionParams }>;
  instances: LayoutInstance[];
  kitchenWorktops: Array<{ id: string; kitchenGroupId: string }>;
  S: AppState;
  kitchenMode: null | {
    mountKitchenGroupProps: (groupId: string) => boolean;
    tryMountActiveTallSubmoduleProps?: () => boolean;
    getActiveTallEditorInstanceId?: () => string | null;
    tryMountActiveKitchenGroupProps: () => boolean;
    renderModuleCatalogIconSvg?: (modulePackage: FurnQuoteModulePackage) => string;
  };
  wardrobeMode: null | {
    tryMountActiveWardrobeProps: () => boolean;
  };
  customFurnitureMode: null | {
    tryMountActiveCustomFurnitureProps: () => boolean;
  };
  placement: AppState["placement"];
  placementHelpers: PlacementHelpers;
  underlayState: UnderlayState;
  underlayCal: UnderlayCalibrationState;
  underlayMesh: { visible: boolean };
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
  rebuildColumn: (column: ColumnInstance) => void;
  updateWindowTransform: (windowInst: WindowInstance) => void;
  updateDoorTransform: (doorInst: DoorInstance) => void;
  updateColumnPlacementParams: (params: Partial<ColumnParams>) => ColumnParams;
  updateWindowPlacementParams: (params: Partial<WindowParams>) => WindowParams;
  updateDoorPlacementParams: (params: Partial<DoorParams>) => DoorParams;
  isColumnPlacementActive: () => boolean;
  isWindowPlacementActive: () => boolean;
  isDoorPlacementActive: () => boolean;
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
  modulePackages: readonly FurnQuoteModulePackage[];
  rebuildInstance: (inst: LayoutInstance, opts?: RebuildInstanceOptions) => boolean;
  ensureLayoutMode: () => void;
  setUnderlayFromCanvas: (
    canvas: HTMLCanvasElement,
    name: string,
    kind: UnderlaySource["kind"],
    physicalSizeMm?: UnderlaySource["physicalSizeMm"]
  ) => void;
  setSelectedUnderlay: () => void;
  updateUnderlayTransform: () => void;
  clearUnderlay: () => void;
  setSelectedModule: (id: string | null) => void;
  setUnderlayScaleEl: (el: HTMLInputElement) => void;
  setUnderlayOffXEl: (el: HTMLInputElement) => void;
  setUnderlayOffZEl: (el: HTMLInputElement) => void;
  setUnderlayStatusEl: (el: HTMLDivElement) => void;
  markUnderlaySelected: () => void;
  scheduleKitchenWorktopPreviewUpdate: () => void;
  drawOrthoEnabled: boolean;
  doorInst: DoorInstance | null;
  doorPlacementParams: DoorParams | null;
  getAllMaterials: () => Material[];
  getMaterialDefinitionById: (id: string) => MaterialDefinition | null;
  catalog: ClientCatalog;
  recordActivity?: (label: string) => void;
  mountModuleCommercialProperties?: (host: HTMLElement, instanceId: string) => void;
};

export function createPropertiesRouter(ctx: PropertiesRouterContext) {
  const mountFloorBoundaryProps = () => mountFloorBoundaryPropsPanel({ props: ctx.props, floorEdit: ctx.floorEdit, getAllMaterials: ctx.getAllMaterials, floorDefault: ctx.floorDefault });
  const mountWallToolProps = () => mountWallToolPropsPanel({ props: ctx.props, wallDefault: ctx.wallDefault, wallDraw: ctx.wallDraw, updateWallMeshWithJustification: ctx.updateWallMeshWithJustification, setUnderlayStatus: ctx.setUnderlayStatus });
  const mountKitchenWorktopToolProps = () => mountKitchenWorktopToolPropsPanel({ props: ctx.props, S: ctx.S, kitchenWorktopDraw: ctx.kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate: ctx.scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById: ctx.getMaterialDefinitionById });
  const mountAlignToolProps = () => mountAlignToolPropsPanel({ props: ctx.props, alignState: ctx.alignState });
  const mountTrimToolProps = () => mountTrimToolPropsPanel({ props: ctx.props, trimState: ctx.trimState });
  const mountMeasureToolProps = () => mountMeasureToolPropsPanel({ props: ctx.props, measureState: ctx.measureState, args: ctx.args, formatMm, clearAllMeasurements: ctx.clearAllMeasurements, setUnderlayStatus: ctx.setUnderlayStatus, mountProps });
  const mountWallProps = (w?: WallInstance) => mountWallPropsPanel({ props: ctx.props, selectedWallIds: ctx.selectedWallIds, walls: ctx.walls, wallJoinTolMm: ctx.wallJoinTolMm, showNoProps: ctx.showNoProps, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, rebuildWall: ctx.rebuildWall, rebuildWallPlanMesh: ctx.rebuildWallPlanMesh, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, w);
  const mountColumnProps = () => mountColumnPropsPanel({ props: ctx.props, column: ctx.columns.find((x) => x.id === ctx.selectedColumnId) ?? null, showNoProps: ctx.showNoProps, rebuildColumn: ctx.rebuildColumn, commitHistory: ctx.commitHistory, S: ctx.S, mountProps });
  const mountColumnPlacementProps = () => {
    if (!ctx.columnPlacementParams) return ctx.showNoProps();
    return mountColumnPlacementPropsPanel({
      props: ctx.props,
      params: ctx.columnPlacementParams,
      onChange: ctx.updateColumnPlacementParams,
      mountProps
    });
  };
  const mountFloorProps = (floor: FloorInstance) => mountFloorPropsPanel({ props: ctx.props, getAllMaterials: ctx.getAllMaterials, floorDefault: ctx.floorDefault, rebuildFloor: ctx.rebuildFloor, updateSelectionHighlights: ctx.updateSelectionHighlights, commitHistory: ctx.commitHistory, S: ctx.S, enterFloorBoundaryEdit: ctx.enterFloorBoundaryEdit, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, floor);
  const mountSectionToolProps = () => mountSectionToolPropsPanel({ props: ctx.props, sectionDraw: ctx.sectionDraw, drawOrthoEnabled: ctx.drawOrthoEnabled });
  const mountSectionProps = (id: string) => mountSectionPropsPanel({ props: ctx.props, sections: ctx.sections, showNoProps: ctx.showNoProps, getSectionBasis, updateAllSectionVisuals: ctx.updateAllSectionVisuals, mountProps, commitHistory: ctx.commitHistory, S: ctx.S }, id);
  const mountModuleProps = (id: string) => mountModulePropsPanel({ findInstance: ctx.findInstance, showNoProps: ctx.showNoProps, props: ctx.props, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, modulePackages: ctx.modulePackages, args: ctx.args, clientCatalog: ctx.catalog, rebuildInstance: ctx.rebuildInstance, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs, renderModuleCatalogIconSvg: ctx.kitchenMode?.renderModuleCatalogIconSvg, mountModuleCommercialProperties: ctx.mountModuleCommercialProperties }, id);
  const mountMultiModuleProps = () => mountMultiModulePropsPanel({ findInstance: ctx.findInstance, showNoProps: ctx.showNoProps, props: ctx.props, commitHistory: ctx.commitHistory, S: ctx.S, mountProps, modulePackages: ctx.modulePackages, args: ctx.args, clientCatalog: ctx.catalog, rebuildInstance: ctx.rebuildInstance, appendLinkedMeasureInputs: ctx.appendLinkedMeasureInputs }, ctx.selectedInstanceIds);
  const mountWindowProps = () => mountWindowPropsPanel({
    props: ctx.props,
    windowInst: ctx.windowInst,
    walls: ctx.walls,
    updateWindowTransform: ctx.updateWindowTransform,
    commitHistory: ctx.commitHistory,
    S: ctx.S,
    mountProps,
    recordActivity: ctx.recordActivity
  });
  const mountWindowPlacementProps = () => {
    if (!ctx.windowPlacementParams) return ctx.showNoProps();
    return mountWindowPlacementPropsPanel({
      props: ctx.props,
      params: ctx.windowPlacementParams,
      onChange: ctx.updateWindowPlacementParams
    });
  };
  const mountDoorProps = () => mountDoorPropsPanel({
    props: ctx.props,
    doorInst: ctx.doorInst,
    walls: ctx.walls,
    updateDoorTransform: ctx.updateDoorTransform,
    commitHistory: ctx.commitHistory,
    S: ctx.S,
    mountProps,
    recordActivity: ctx.recordActivity
  });
  const mountDoorPlacementProps = () => {
    if (!ctx.doorPlacementParams) return ctx.showNoProps();
    return mountDoorPlacementPropsPanel({
      props: ctx.props,
      params: ctx.doorPlacementParams,
      onChange: ctx.updateDoorPlacementParams
    });
  };
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
    if (ctx.isColumnPlacementActive()) return mountColumnPlacementProps();
    if (ctx.layoutTool === "wall") return mountWallToolProps();
    if (ctx.isWindowPlacementActive()) return mountWindowPlacementProps();
    if (ctx.isDoorPlacementActive()) return mountDoorPlacementProps();
    if (ctx.layoutTool === "measure") return mountMeasureToolProps();
    if (ctx.layoutTool === "section") return mountSectionToolProps();
    if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) return mountKitchenWorktopToolProps();
    if (ctx.layoutTool === "align") return mountAlignToolProps();
    if (ctx.layoutTool === "trim") return mountTrimToolProps();
    if (ctx.customFurnitureMode?.tryMountActiveCustomFurnitureProps()) return;
    if (ctx.wardrobeMode?.tryMountActiveWardrobeProps()) return;
    if (ctx.kitchenMode?.tryMountActiveTallSubmoduleProps?.()) return;
    const activeTallEditorInstanceId = ctx.kitchenMode?.getActiveTallEditorInstanceId?.() ?? null;
    if (activeTallEditorInstanceId) return mountModuleProps(activeTallEditorInstanceId);
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
    if (ctx.selectedInstanceIds.size > 1 && ctx.selectedWallIds.size === 0 && ctx.selectedKind === "module") return mountMultiModuleProps();
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
    if (ctx.selectedKind === "column" && ctx.selectedColumnId) return mountColumnProps();
    if (ctx.selectedKind === "window") return mountWindowProps();
    if (ctx.selectedKind === "door") return mountDoorProps();
    if (ctx.selectedKind === "section" && ctx.selectedSectionId) return mountSectionProps(ctx.selectedSectionId);
    if (ctx.selectedKind === "module" && ctx.selectedInstanceId) return mountModuleProps(ctx.selectedInstanceId);
    if (ctx.kitchenMode && ctx.kitchenMode.tryMountActiveKitchenGroupProps()) return;
    ctx.mountActiveViewProps();
  }

  return { mountProps };
}
