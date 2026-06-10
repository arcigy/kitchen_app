import type { ClientCatalog } from "../core/catalog/catalog-types";
import { polygonBoundsMm } from "../layout/customFurnitureGeometry";
import type {
  CustomFurnitureBoardJustification,
  CustomFurnitureBoardKind,
  CustomFurnitureBoardParams,
  CustomFurnitureConstraint,
  CustomFurnitureInstance
} from "../layout/customFurnitureTypes";
import { materialSelect, numberInput, selectInput, textInput } from "./customFurnitureUiControls";

export type CustomFurnitureSelectedPropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};

export function mountCustomFurnitureProps(args: {
  props: CustomFurnitureSelectedPropsApi;
  furniture: CustomFurnitureInstance;
  constraintOptions: readonly CustomFurnitureConstraint[];
  rebuildFurniture: (furniture: CustomFurnitureInstance) => void;
  commitHistory: () => void;
  refreshProps: () => void;
}) {
  const { furniture } = args;
  args.props.setTitle("Custom furniture");
  const section = args.props.section();
  args.props.row(section, "Name", textInput(furniture.params.name, (next) => {
    furniture.params.name = next;
    args.commitHistory();
    args.refreshProps();
  }));
  args.props.row(section, "Base constraint", selectInput(furniture.params.baseConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    furniture.params.baseConstraint = next;
    args.commitHistory();
  }));
  args.props.row(section, "Base offset", numberInput(furniture.params.baseOffsetMm, (next) => {
    furniture.params.baseOffsetMm = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Top constraint", selectInput(furniture.params.topConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    furniture.params.topConstraint = next;
    args.commitHistory();
  }));
  args.props.row(section, "Top offset", numberInput(furniture.params.topOffsetMm, (next) => {
    furniture.params.topOffsetMm = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  const summary = document.createElement("div");
  summary.className = "muted";
  summary.textContent = `Boundary: ${furniture.params.boundary.length} points. Boards: ${furniture.params.boards.length}.`;
  section.appendChild(summary);
}

export function mountCustomFurnitureBoardProps(args: {
  props: CustomFurnitureSelectedPropsApi;
  catalog: ClientCatalog;
  furniture: CustomFurnitureInstance;
  board: CustomFurnitureBoardParams;
  constraintOptions: readonly CustomFurnitureConstraint[];
  syncVerticalBoardProfileToConstraints: (furniture: CustomFurnitureInstance, board: CustomFurnitureBoardParams) => void;
  rebuildFurniture: (furniture: CustomFurnitureInstance) => void;
  commitHistory: () => void;
  refreshProps: () => void;
}) {
  const { furniture, board } = args;
  args.props.setTitle("Custom board");
  const section = args.props.section();
  args.props.row(section, "Name", textInput(board.name, (next) => {
    board.name = next;
    args.commitHistory();
    args.refreshProps();
  }));
  args.props.row(section, "Kind", selectInput<CustomFurnitureBoardKind>(board.kind, ["horizontal", "vertical", "worktop", "custom"].map((value) => ({ value: value as CustomFurnitureBoardKind, label: value })), (next) => {
    board.kind = next;
    args.commitHistory();
  }));
  args.props.row(section, "Material", materialSelect(args.catalog, board.materialId, "board", (next) => {
    board.materialId = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Thickness", numberInput(board.thicknessMm, (next) => {
    board.thicknessMm = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  if (board.workplane.type === "horizontal") {
    const workplane = board.workplane;
    args.props.row(section, "Elevation", numberInput(workplane.elevationMm, (next) => {
      workplane.elevationMm = next;
      args.rebuildFurniture(furniture);
      args.commitHistory();
    }));
  }
  args.props.row(section, "Justification", selectInput<CustomFurnitureBoardJustification>(board.justification, [
    { value: "center", label: "center" },
    { value: "negative", label: "negative" },
    { value: "positive", label: "positive" }
  ], (next) => {
    board.justification = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Base constraint", selectInput(board.baseConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    board.baseConstraint = next;
    args.syncVerticalBoardProfileToConstraints(furniture, board);
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Base offset", numberInput(board.baseOffsetMm, (next) => {
    board.baseOffsetMm = next;
    args.syncVerticalBoardProfileToConstraints(furniture, board);
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Top constraint", selectInput(board.topConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    board.topConstraint = next;
    args.syncVerticalBoardProfileToConstraints(furniture, board);
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  args.props.row(section, "Top offset", numberInput(board.topOffsetMm, (next) => {
    board.topOffsetMm = next;
    args.syncVerticalBoardProfileToConstraints(furniture, board);
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  const bounds = polygonBoundsMm(board.profile);
  const summary = document.createElement("div");
  summary.className = "muted";
  summary.textContent = `Profile: ${board.profile.length} points, ${Math.round(bounds.widthMm)} x ${Math.round(bounds.heightMm)} mm. Edge banding: ${board.edgeBanding.length}.`;
  section.appendChild(summary);
}
