import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { CustomFurnitureBoardJustification, CustomFurnitureConstraint } from "../layout/customFurnitureTypes";
import { materialSelect, numberInput, selectInput } from "./customFurnitureUiControls";

export type CustomFurnitureActiveToolKind = "boundary" | "horizontalBoard" | "verticalBoard" | "edgeBand";

export type CustomFurnitureToolPropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};

export type CustomFurnitureVerticalBoardDraftProps = {
  materialId: string;
  thicknessMm: number;
  justification: CustomFurnitureBoardJustification;
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
};

export function mountCustomFurnitureActiveToolProps(args: {
  props: CustomFurnitureToolPropsApi;
  catalog: ClientCatalog;
  activeTool: CustomFurnitureActiveToolKind | null;
  boundaryEditActive: boolean;
  boundarySegmentsCount: number;
  boundaryHasFirstPoint: boolean;
  draftPointsCount: number;
  constraintOptions: readonly CustomFurnitureConstraint[];
  verticalBoardDraft: CustomFurnitureVerticalBoardDraftProps;
  onVerticalBoardDraftChange: (next: Partial<CustomFurnitureVerticalBoardDraftProps>) => void;
}) {
  if (!args.activeTool && !args.boundaryEditActive) return false;

  args.props.setTitle("Custom furniture tool");
  const section = args.props.section();

  if (args.activeTool === "verticalBoard") {
    mountVerticalBoardDraftRows(args, section);
  }

  const text = document.createElement("div");
  text.className = "muted";
  text.textContent = args.boundaryEditActive
    ? `boundary: ${args.boundarySegmentsCount} line(s). ${
        args.boundaryHasFirstPoint ? "Click next point to place the current line." : "Click a first point or select an existing line."
      }`
    : `${args.activeTool}: ${args.draftPointsCount} point(s).`;
  section.appendChild(text);
  return true;
}

function mountVerticalBoardDraftRows(
  args: Parameters<typeof mountCustomFurnitureActiveToolProps>[0],
  section: HTMLElement
) {
  const draft = args.verticalBoardDraft;
  args.props.row(section, "Material", materialSelect(args.catalog, draft.materialId, "board", (next) => {
    args.onVerticalBoardDraftChange({ materialId: next });
  }));
  args.props.row(section, "Thickness", numberInput(draft.thicknessMm, (next) => {
    args.onVerticalBoardDraftChange({ thicknessMm: Math.max(1, Math.round(next)) });
  }));
  args.props.row(section, "Justification", selectInput<CustomFurnitureBoardJustification>(draft.justification, [
    { value: "center", label: "center" },
    { value: "negative", label: "negative" },
    { value: "positive", label: "positive" }
  ], (next) => {
    args.onVerticalBoardDraftChange({ justification: next });
  }));
  args.props.row(section, "Base constraint", selectInput(draft.baseConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    args.onVerticalBoardDraftChange({ baseConstraint: next });
  }));
  args.props.row(section, "Base offset", numberInput(draft.baseOffsetMm, (next) => {
    args.onVerticalBoardDraftChange({ baseOffsetMm: next });
  }));
  args.props.row(section, "Top constraint", selectInput(draft.topConstraint, args.constraintOptions.map((value) => ({ value, label: value })), (next) => {
    args.onVerticalBoardDraftChange({ topConstraint: next });
  }));
  args.props.row(section, "Top offset", numberInput(draft.topOffsetMm, (next) => {
    args.onVerticalBoardDraftChange({ topOffsetMm: next });
  }));
}
