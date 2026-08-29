import type { CustomFurnitureSharedDrawToolId } from "./customFurnitureBoundaryEditing";

export type CustomFurnitureDrawToolbarContext = "boundary" | "verticalBoard" | "horizontalBoard";
export type CustomFurnitureVerticalBoardDrawMode = "line" | "pickLine";

export type CustomFurnitureSharedDrawIconMap = Record<CustomFurnitureSharedDrawToolId, string>;

export function getCustomFurnitureSharedDrawToolLabel(tool: CustomFurnitureSharedDrawToolId) {
  if (tool === "boundaryLine") return "Boundary Line";
  if (tool === "pickLines") return "Pick Lines";
  return tool[0]!.toUpperCase() + tool.slice(1);
}

export function isCustomFurnitureSharedDrawToolActive(args: {
  context: CustomFurnitureDrawToolbarContext;
  tool: CustomFurnitureSharedDrawToolId;
  boundaryDrawTool: string;
  verticalBoardDrawMode: CustomFurnitureVerticalBoardDrawMode;
}) {
  if (args.context === "boundary") return args.boundaryDrawTool === args.tool;
  if (args.context === "verticalBoard") {
    return args.tool === "pickLines"
      ? args.verticalBoardDrawMode === "pickLine"
      : args.boundaryDrawTool === args.tool || (args.tool === "boundaryLine" && args.boundaryDrawTool === "line");
  }
  return args.boundaryDrawTool === args.tool || (args.tool === "boundaryLine" && args.boundaryDrawTool === "line");
}

export function getCustomFurnitureSharedDrawToolButton(args: {
  tool: CustomFurnitureSharedDrawToolId;
  context: CustomFurnitureDrawToolbarContext;
  boundaryDrawTool: string;
  verticalBoardDrawMode: CustomFurnitureVerticalBoardDrawMode;
  icons: CustomFurnitureSharedDrawIconMap;
}) {
  const label = getCustomFurnitureSharedDrawToolLabel(args.tool);
  return {
    title: label,
    iconSvg: args.icons[args.tool],
    label,
    active: isCustomFurnitureSharedDrawToolActive(args)
  };
}

export function resolveCustomFurnitureDrawOffsetMm(value: string) {
  return Math.round(Number(value.replace(",", ".")) || 0);
}
