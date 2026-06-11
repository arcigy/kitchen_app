import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlignPickedLine, WallParams } from "./localTypes";
import {
  mountAlignToolPropsPanel,
  mountKitchenWorktopToolPropsPanel,
  mountMeasureToolPropsPanel,
  mountTrimToolPropsPanel,
  mountWallToolPropsPanel
} from "./toolPropsPanels";
import type { AppState } from "../layout/appState";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";

function pickedLine(label: string) {
  return { label } as AlignPickedLine;
}

describe("tool props panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps align tool muted hint and reference summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountAlignToolPropsPanel({ props, alignState: { ref: pickedLine("Wall A") } });

    expect(props.setTitle).toHaveBeenCalledWith("Align");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the reference line, then click one or more parallel lines to align. Esc = new reference, Esc again = exit.");
    expect(section.children[1]?.textContent).toBe("Reference: Wall A");
    expect(section.children[1]?.style.marginTop).toBe("8px");
  });

  it("keeps wall tool type and justification select behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const wallDefault = {
      typeId: "partition_100",
      thicknessMm: 100,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1
    } satisfies Pick<WallParams, "typeId" | "thicknessMm" | "heightMm" | "materialId" | "justification" | "exteriorSign">;
    const setUnderlayStatus = vi.fn();

    mountWallToolPropsPanel({
      props,
      wallDefault,
      wallDraw: { preview: null, a: null, hoverB: null },
      updateWallMeshWithJustification: vi.fn(),
      setUnderlayStatus
    });

    expect(props.setTitle).toHaveBeenCalledWith("Wall");
    expect(rows.map((row) => row.label)).toEqual(["Typ steny", "Thickness (mm)", "Height (mm)", "Justification", "Exterior"]);
    expect(rows[0]!.control.value).toBe("partition_100");
    expect(rows[0]!.control.children.map((child) => child.value)).toEqual([
      "custom",
      "partition_100",
      "partition_150",
      "bearing_200",
      "external_300"
    ]);
    expect(rows[1]!.control.type).toBe("number");
    expect(rows[1]!.control.step).toBe("1");
    expect(rows[1]!.control.value).toBe("100");
    expect(rows[2]!.control.type).toBe("number");
    expect(rows[2]!.control.step).toBe("1");
    expect(rows[2]!.control.value).toBe("2600");
    expect(rows[3]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["center", "Center"],
      ["interior", "Finish face: interior"],
      ["exterior", "Finish face: exterior"]
    ]);
    expect(rows[4]!.control.type).toBe("button");
    expect(rows[4]!.control.textContent).toBe("Flip exterior");
    expect(section.children.at(-1)?.className).toBe("muted");

    rows[0]!.control.value = "bearing_200";
    rows[0]!.control.dispatch("change");

    expect(wallDefault.typeId).toBe("bearing_200");
    expect(wallDefault.thicknessMm).toBe(200);
    expect(wallDefault.heightMm).toBe(2800);
    expect(rows[1]!.control.value).toBe("200");
    expect(rows[2]!.control.value).toBe("2800");
    expect(setUnderlayStatus).toHaveBeenLastCalledWith("Wall type: Nosna 200.");

    rows[3]!.control.value = "exterior";
    rows[3]!.control.dispatch("change");

    expect(wallDefault.justification).toBe("exterior");
    expect(wallDefault.typeId).toBe("custom");
    expect(rows[0]!.control.value).toBe("custom");
  });

  it("keeps trim tool muted hint, step, and target summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountTrimToolPropsPanel({
      props,
      trimState: { step: "pickCutter", targetPick: pickedLine("Target wall") }
    });

    expect(props.setTitle).toHaveBeenCalledWith("Trim / Extend");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the target wall, then click the boundary wall or line. The nearest end trims or extends to the intersection. Esc = back.");
    expect(section.children[1]?.textContent).toBe("Step: select cut");
    expect(section.children[1]?.style.marginTop).toBe("8px");
    expect(section.children[2]?.textContent).toBe("Target: Target wall");
    expect(section.children[2]?.style.marginTop).toBe("6px");
  });

  it("keeps measure tool axis lock and clear behavior", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();
    const axisLockEl = { checked: false };
    const measureState = { axisLock: true, firstPoint: null };
    const clearAllMeasurements = vi.fn();
    const setUnderlayStatus = vi.fn();
    const mountProps = vi.fn();

    mountMeasureToolPropsPanel({
      props,
      measureState,
      args: { axisLockEl: axisLockEl as HTMLInputElement },
      formatMm: vi.fn(),
      clearAllMeasurements,
      setUnderlayStatus,
      mountProps
    });

    expect(props.setTitle).toHaveBeenCalledWith("Measure");
    expect(section.children[0]?.className).toBe("muted");
    expect(section.children[1]?.style.marginTop).toBe("10px");
    const axis = section.children[1]!.children[0]!;
    expect(axis.type).toBe("checkbox");
    expect(axis.checked).toBe(true);
    expect(section.children[1]!.children[1]?.textContent).toBe("Axis lock (optional, 2D/3D)");
    expect(section.children[2]?.textContent).toBe("First point: (none)");
    expect(section.children[3]?.type).toBe("button");
    expect(section.children[3]?.textContent).toBe("Clear");

    axis.checked = false;
    axis.dispatch("change");

    expect(measureState.axisLock).toBe(false);
    expect(axisLockEl.checked).toBe(false);

    section.children[3]!.dispatch("click");

    expect(clearAllMeasurements).toHaveBeenCalledOnce();
    expect(setUnderlayStatus).toHaveBeenCalledWith("Measure: click first point.");
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("keeps worktop tool read-only rows and justification change behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const scheduleKitchenWorktopPreviewUpdate = vi.fn();
    const kitchenWorktopDraw = { justification: "back" as const };

    mountKitchenWorktopToolPropsPanel({
      props,
      S: {
        kitchenCtx: {
          worktopDepthMm: 620,
          worktopThicknessMm: 38,
          heightMm: 910,
          worktopMaterialId: "mat-oak"
        }
      } as AppState,
      kitchenWorktopDraw,
      scheduleKitchenWorktopPreviewUpdate,
      getMaterialDefinitionById: (id) => (id === "mat-oak" ? { displayName: "Oak laminate" } : null)
    });

    expect(props.setTitle).toHaveBeenCalledWith("Worktop");
    expect(rows.map((row) => [row.label, row.control.textContent])).toEqual([
      ["Justification", ""],
      ["Depth", "620 mm"],
      ["Thickness", "38 mm"],
      ["Top Height", "910 mm"],
      ["Material", "Oak laminate"]
    ]);
    expect(rows[0]!.control.value).toBe("back");
    expect(rows[0]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["center", "Center"],
      ["back", "Back edge"],
      ["front", "Front edge"]
    ]);
    expect(section.children.at(-1)?.className).toBe("muted");

    rows[0]!.control.value = "front";
    rows[0]!.control.dispatch("change");

    expect(kitchenWorktopDraw.justification).toBe("front");
    expect(scheduleKitchenWorktopPreviewUpdate).toHaveBeenCalledOnce();
  });
});
