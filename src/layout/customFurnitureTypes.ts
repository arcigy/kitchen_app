import * as THREE from "three";
import type { ManufacturingRecipeSnapshot } from "../core/project-manufacturing/project-manufacturing-types";
import type { MaterialDefinition } from "../core/catalog/catalog-types";
import type { CatalogItemSnapshot } from "../core/project-materials/project-material-types";

export type CustomFurnitureConstraint = "projectBase" | "furnitureBase" | "furnitureTop" | "absolute";
export type CustomFurnitureBoardKind = "horizontal" | "vertical" | "worktop" | "custom";
export type CustomFurnitureAdditionKind = "cover_side" | "filler" | "cladding" | "crown" | "extra_bottom" | "custom";
export type CustomFurnitureBoardJustification = "center" | "negative" | "positive";

export type CustomFurniturePlanPoint = { x: number; z: number };
export type CustomFurnitureProfilePoint = { x: number; y: number };
export type CustomFurnitureBoundarySegmentParams = {
  a: CustomFurniturePlanPoint;
  b: CustomFurniturePlanPoint;
  arcPoints?: CustomFurniturePlanPoint[];
};

export type CustomFurnitureVerticalWorkplane = {
  type: "vertical";
  aMm: CustomFurniturePlanPoint;
  bMm: CustomFurniturePlanPoint;
  pathMm?: CustomFurniturePlanPoint[];
  mirrored: boolean;
};

export type CustomFurnitureHorizontalWorkplane = {
  type: "horizontal";
  elevationMm: number;
};

export type CustomFurnitureBoardWorkplane = CustomFurnitureHorizontalWorkplane | CustomFurnitureVerticalWorkplane;

export type CustomFurnitureEdgeBand = {
  edgeIndex: number;
  materialId: string;
};

export type CustomFurnitureCabinetAttachment = {
  cabinetId: string;
  side: "left" | "right" | "front" | "back" | "top" | "bottom";
  offsetMm: number;
  startOverhangMm: number;
  endOverhangMm: number;
  /** Only explicitly chosen dimensions follow the cabinet. */
  followDimensions: Array<"width" | "height" | "depth">;
};

export type CustomBoardCutout = { id: string; profile: CustomFurnitureProfilePoint[]; sourceOpeningId?: string };
export type BacksplashAutomaticField = "profile" | "workplane" | "thicknessMm" | "materialId" | "cutouts" | "baseOffsetMm" | "topOffsetMm";
export type BacksplashBoardSource = {
  materialSnapshot?: CatalogItemSnapshot<MaterialDefinition>;
  key: string; wallId: string; worktopId: string;
  automatic: Partial<Pick<CustomFurnitureBoardParams, BacksplashAutomaticField>>;
  overrides: BacksplashAutomaticField[];
  suppressedOpeningIds?: string[];
};
export type BacksplashGroupSource = {
  materialSnapshot?: CatalogItemSnapshot<MaterialDefinition>;
  scope?: "all" | "walls";
  materialOverride?: boolean; thicknessOverride?: boolean;
  kitchenId: string; wallIds: string[]; materialId: string; thicknessMm: number;
  offsetMm: number; kerfMm: number; allowHalf: boolean; grain: "length" | "width" | "free";
  maxLengthMm: number; stockLengthMm?: number; stockWidthMm?: number;
  /** Wall-local joint positions, in mm. */
  joints: Record<string, number[]>;
  suppressedKeys: string[]; orphanedWallIds: string[]; detached?: boolean;
};
export type CustomFurnitureBoardParams = {
  materialOverride?: boolean;
  cutouts?: CustomBoardCutout[];
  backsplashSource?: BacksplashBoardSource;
  edgeBandingOverrides?: import("../core/edge-banding/edgeEntities").EdgeBindingMap;
  id: string;
  name: string;
  kind: CustomFurnitureBoardKind;
  workplane: CustomFurnitureBoardWorkplane;
  profile: CustomFurnitureProfilePoint[];
  thicknessMm: number;
  materialId: string;
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
  justification: CustomFurnitureBoardJustification;
  edgeBanding: CustomFurnitureEdgeBand[];
  additionKind?: CustomFurnitureAdditionKind;
  cabinetAttachment?: CustomFurnitureCabinetAttachment;
  /** Project-owned recipe snapshot; rendering uses the final thickness and surface only. */
  recipeSnapshot?: ManufacturingRecipeSnapshot;
};

export type CustomFurnitureParams = {
  groupKind?: "backsplash";
  backsplash?: BacksplashGroupSource;
  name: string;
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
  boundary: CustomFurniturePlanPoint[];
  boundarySegments?: CustomFurnitureBoundarySegmentParams[];
  boards: CustomFurnitureBoardParams[];
};

export type CustomFurnitureBoardObject = {
  boardId: string;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  edgeBandLines: THREE.LineSegments;
};

export type CustomFurnitureInstance = {
  id: string;
  params: CustomFurnitureParams;
  root: THREE.Group;
  boundaryLine: THREE.Line;
  boardsRoot: THREE.Group;
  boardObjects: CustomFurnitureBoardObject[];
};

export type CustomFurnitureSnapshotItem = {
  id: string;
  params: CustomFurnitureParams;
};
