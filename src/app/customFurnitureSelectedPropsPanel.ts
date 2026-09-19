import type { ClientCatalog } from "../core/catalog/catalog-types";
import { polygonBoundsMm } from "../layout/customFurnitureGeometry";
import { recipeThicknessMm } from "../core/project-manufacturing/project-manufacturing-types";
import type {
  CustomFurnitureCabinetAttachment,
  CustomFurnitureBoardJustification,
  CustomFurnitureAdditionKind,
  CustomFurnitureBoardKind,
  CustomFurnitureBoardParams,
  CustomFurnitureConstraint,
  CustomFurnitureInstance
} from "../layout/customFurnitureTypes";
import { materialSelect, numberInput, selectInput, textInput } from "./customFurnitureUiControls";
import { appendMutedText, createCheckboxElement } from "./propsPanelElements";

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
  appendMutedText(section, `Boundary: ${furniture.params.boundary.length} points. Boards: ${furniture.params.boards.length}.`);
}

export function mountCustomFurnitureBoardProps(args: {
  props: CustomFurnitureSelectedPropsApi;
  catalog: ClientCatalog;
  furniture: CustomFurnitureInstance;
  board: CustomFurnitureBoardParams;
  constraintOptions: readonly CustomFurnitureConstraint[];
  syncVerticalBoardProfileToConstraints: (furniture: CustomFurnitureInstance, board: CustomFurnitureBoardParams) => void;
  rebuildFurniture: (furniture: CustomFurnitureInstance) => void;
  cabinetOptions?: readonly { id: string; label: string }[];
  syncCabinetAttachment?: (cabinetId: string) => void;
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
  args.props.row(section, "Addition", selectInput<CustomFurnitureAdditionKind>(board.additionKind ?? "custom", [
    ["cover_side", "Cover side"], ["filler", "Filler"], ["cladding", "Cladding"], ["crown", "Crown"], ["extra_bottom", "Extra bottom"], ["custom", "Custom board"]
  ].map(([value, label]) => ({ value: value as CustomFurnitureAdditionKind, label })), (next) => {
    board.additionKind = next;
    args.commitHistory();
  }));
  if (args.cabinetOptions && args.cabinetOptions.length > 0) {
    const syncAttachment = () => {
      const id = board.cabinetAttachment?.cabinetId;
      if (id) args.syncCabinetAttachment?.(id);
      args.rebuildFurniture(furniture);
      args.commitHistory();
      args.refreshProps();
    };
    args.props.row(section, "Attached cabinet", selectInput(board.cabinetAttachment?.cabinetId ?? "", [
      { value: "", label: "Independent addition" },
      ...args.cabinetOptions.map((cabinet) => ({ value: cabinet.id, label: cabinet.label }))
    ], (cabinetId) => {
      if (!cabinetId) {
        delete board.cabinetAttachment;
      } else {
        board.cabinetAttachment = {
          cabinetId,
          side: board.additionKind === "extra_bottom" ? "bottom" : board.additionKind === "crown" ? "top" : "right",
          offsetMm: 0,
          startOverhangMm: 0,
          endOverhangMm: 0,
          followDimensions: ["width", "height", "depth"]
        };
      }
      syncAttachment();
    }));
    if (board.cabinetAttachment) {
      const attachment = board.cabinetAttachment;
      args.props.row(section, "Attachment side", selectInput(attachment.side, ["left", "right", "front", "back", "top", "bottom"].map((value) => ({ value: value as CustomFurnitureCabinetAttachment["side"], label: value })), (side) => {
        attachment.side = side;
        syncAttachment();
      }));
      args.props.row(section, "Attachment offset", numberInput(attachment.offsetMm, (offsetMm) => {
        attachment.offsetMm = offsetMm;
        syncAttachment();
      }));
      args.props.row(section, "Start overhang", numberInput(attachment.startOverhangMm, (startOverhangMm) => {
        attachment.startOverhangMm = startOverhangMm;
        syncAttachment();
      }));
      args.props.row(section, "End overhang", numberInput(attachment.endOverhangMm, (endOverhangMm) => {
        attachment.endOverhangMm = endOverhangMm;
        syncAttachment();
      }));
      const dimensions = document.createElement("div");
      dimensions.className = "custom-furniture-attachment-dimensions";
      for (const dimension of ["width", "height", "depth"] as const) {
        const label = document.createElement("label");
        const input = createCheckboxElement(attachment.followDimensions.includes(dimension));
        input.addEventListener("change", () => {
          attachment.followDimensions = input.checked
            ? [...new Set([...attachment.followDimensions, dimension])]
            : attachment.followDimensions.filter((value) => value !== dimension);
          syncAttachment();
        });
        label.append(input, document.createTextNode(` Follow ${dimension}`));
        dimensions.appendChild(label);
      }
      args.props.row(section, "Follow dimensions", dimensions);
    }
  }
  args.props.row(section, "Material", materialSelect(args.catalog, board.materialId, "board", (next) => {
    board.materialId = next;
    args.rebuildFurniture(furniture);
    args.commitHistory();
  }));
  const recipes = args.catalog.manufacturing?.recipes ?? [];
  if (recipes.length > 0) {
    args.props.row(section, "Recipe", selectInput(board.recipeSnapshot?.id ?? "", [
      { value: "", label: "Direct board material" },
      ...recipes.map((recipe) => ({ value: recipe.id, label: `${recipe.name} v${recipe.version}` }))
    ], (recipeId) => {
      const recipe = recipes.find((candidate) => candidate.id === recipeId);
      if (!recipe) {
        delete board.recipeSnapshot;
      } else {
        board.recipeSnapshot = {
          ...structuredClone(recipe),
          layers: recipe.layers.map((layer) => ({ ...layer, unitPrice: args.catalog.priceList.prices[layer.materialId] ?? null }))
        };
        board.thicknessMm = recipeThicknessMm(board.recipeSnapshot);
      }
      args.rebuildFurniture(furniture);
      args.commitHistory();
      args.refreshProps();
    }));
  }
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
  appendMutedText(
    section,
    `Profile: ${board.profile.length} points, ${Math.round(bounds.widthMm)} x ${Math.round(bounds.heightMm)} mm. Edge banding: ${board.edgeBanding.length}.${board.cabinetAttachment ? ` Attached to ${board.cabinetAttachment.cabinetId}.` : ""}${board.recipeSnapshot ? ` Recipe: ${board.recipeSnapshot.name} v${board.recipeSnapshot.version}.` : ""}`
  );
}
