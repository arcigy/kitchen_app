import { describe, expect, it } from "vitest";
import type { CustomFurnitureSharedDrawToolId } from "./customFurnitureBoundaryEditing";
import {
  getCustomFurnitureSharedDrawToolButton,
  getCustomFurnitureSharedDrawToolLabel,
  isCustomFurnitureSharedDrawToolActive,
  resolveCustomFurnitureDrawOffsetMm,
  type CustomFurnitureSharedDrawIconMap
} from "./customFurnitureTopbarModel";

const icons = {
  boundaryLine: "boundary",
  line: "line",
  rectangle: "rectangle",
  polygon: "polygon",
  circle: "circle",
  arc: "arc",
  spline: "spline",
  pickLines: "pick"
} satisfies CustomFurnitureSharedDrawIconMap;

describe("custom furniture topbar model", () => {
  it("keeps shared draw tool labels identical to the controller toolbar", () => {
    expect(getCustomFurnitureSharedDrawToolLabel("boundaryLine")).toBe("Boundary Line");
    expect(getCustomFurnitureSharedDrawToolLabel("pickLines")).toBe("Pick Lines");
    expect(getCustomFurnitureSharedDrawToolLabel("rectangle")).toBe("Rectangle");
  });

  it("keeps boundary draw active state strict to the selected boundary tool", () => {
    expect(
      isCustomFurnitureSharedDrawToolActive({
        context: "boundary",
        tool: "boundaryLine",
        boundaryDrawTool: "boundaryLine",
        verticalBoardDrawMode: "line"
      })
    ).toBe(true);
    expect(
      isCustomFurnitureSharedDrawToolActive({
        context: "boundary",
        tool: "boundaryLine",
        boundaryDrawTool: "line",
        verticalBoardDrawMode: "line"
      })
    ).toBe(false);
  });

  it("keeps board draw active state mapping boundaryLine to line mode", () => {
    for (const context of ["verticalBoard", "horizontalBoard"] as const) {
      expect(
        isCustomFurnitureSharedDrawToolActive({
          context,
          tool: "boundaryLine",
          boundaryDrawTool: "line",
          verticalBoardDrawMode: "line"
        })
      ).toBe(true);
    }
  });

  it("keeps vertical board pickLines active only for pickLine mode", () => {
    expect(
      isCustomFurnitureSharedDrawToolActive({
        context: "verticalBoard",
        tool: "pickLines",
        boundaryDrawTool: "pickLines",
        verticalBoardDrawMode: "pickLine"
      })
    ).toBe(true);
    expect(
      isCustomFurnitureSharedDrawToolActive({
        context: "verticalBoard",
        tool: "pickLines",
        boundaryDrawTool: "pickLines",
        verticalBoardDrawMode: "line"
      })
    ).toBe(false);
  });

  it("returns the full shared draw button model with the existing icon lookup", () => {
    const button = getCustomFurnitureSharedDrawToolButton({
      tool: "arc",
      context: "horizontalBoard",
      boundaryDrawTool: "arc",
      verticalBoardDrawMode: "line",
      icons
    });

    expect(button).toEqual({
      title: "Arc",
      iconSvg: "arc",
      label: "Arc",
      active: true
    });
  });

  it("keeps draw offset parsing compatible with the inline controller behavior", () => {
    expect(resolveCustomFurnitureDrawOffsetMm("12.4")).toBe(12);
    expect(resolveCustomFurnitureDrawOffsetMm("12,6")).toBe(13);
    expect(resolveCustomFurnitureDrawOffsetMm("abc")).toBe(0);
    expect(resolveCustomFurnitureDrawOffsetMm("")).toBe(0);
  });

  it("covers every shared tool icon explicitly", () => {
    const tools: CustomFurnitureSharedDrawToolId[] = ["boundaryLine", "line", "rectangle", "polygon", "circle", "arc", "spline", "pickLines"];
    expect(tools.map((tool) => icons[tool])).toEqual(["boundary", "line", "rectangle", "polygon", "circle", "arc", "spline", "pick"]);
  });
});
