import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import {
  firstMaterial,
  makeMeshMaterial,
  materialFor,
  materialSelect,
  numberInput,
  selectInput,
  textInput
} from "./customFurnitureUiControls";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

function makeMaterial(args: {
  id: string;
  displayName: string;
  materialType: "board" | "edge";
  isActive: boolean;
  colorHex?: string;
  roughness?: number;
  metalness?: number;
}): MaterialDefinition {
  return {
    id: args.id,
    displayName: args.displayName,
    materialType: args.materialType,
    isActive: args.isActive,
    preview: {
      colorHex: args.colorHex ?? "#112233",
      roughness: args.roughness ?? 0.5,
      metalness: args.metalness ?? 0.1
    }
  } as MaterialDefinition;
}

function makeCatalog(): ClientCatalog {
  return {
    clientId: "client",
    materials: [
      makeMaterial({ id: "board-b", displayName: "Beta board", materialType: "board", isActive: true, colorHex: "#00ff00", roughness: 0.6, metalness: 0.2 }),
      makeMaterial({ id: "board-a", displayName: "Alpha board", materialType: "board", isActive: true, colorHex: "#ff0000", roughness: 0.4, metalness: 0.05 }),
      makeMaterial({ id: "board-old", displayName: "Old board", materialType: "board", isActive: false, colorHex: "#0000ff" }),
      makeMaterial({ id: "edge-a", displayName: "Alpha edge", materialType: "edge", isActive: true, colorHex: "#111111" })
    ],
    hardware: [],
    legacyMaterials: [],
    components: [],
    componentGeometry: [],
    modules: [],
    priceList: { id: "prices", name: "Prices", currency: "EUR", isActive: true, prices: {} },
    kitchenDefaults: {},
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  } as ClientCatalog;
}

describe("custom furniture ui controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps number input rounded and ignores non-finite changes", () => {
    installFakeDocument();
    const onChange = vi.fn();

    const input = numberInput(1200.6, onChange) as unknown as FakeElement;

    expect(input.type).toBe("number");
    expect(input.value).toBe("1201");

    input.value = "999.5";
    input.dispatch("change");
    expect(onChange).toHaveBeenLastCalledWith(999.5);

    input.value = "not-a-number";
    input.dispatch("change");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps text input trimmed and falls back to the original value when empty", () => {
    installFakeDocument();
    const onChange = vi.fn();

    const input = textInput("Original", onChange) as unknown as FakeElement;

    input.value = "  Next name  ";
    input.dispatch("change");
    expect(onChange).toHaveBeenLastCalledWith("Next name");

    input.value = "   ";
    input.dispatch("change");
    expect(onChange).toHaveBeenLastCalledWith("Original");
  });

  it("keeps select options and routes the selected string value", () => {
    installFakeDocument();
    const onChange = vi.fn();

    const select = selectInput("one", [{ value: "one", label: "One" }, { value: "two", label: "Two" }], onChange) as unknown as FakeElement;

    expect(select.children.map((child) => child.textContent)).toEqual(["One", "Two"]);
    select.value = "two";
    select.dispatch("change");
    expect(onChange).toHaveBeenCalledWith("two");
  });

  it("keeps material select filtered to active materials of the requested type and sorted by display name", () => {
    installFakeDocument();
    const onChange = vi.fn();

    const select = materialSelect(makeCatalog(), "missing", "board", onChange) as unknown as FakeElement;

    expect(select.children.map((child) => child.value)).toEqual(["board-a", "board-b"]);
    expect(select.value).toBe("board-a");

    select.value = "board-b";
    select.dispatch("change");
    expect(onChange).toHaveBeenCalledWith("board-b");
  });

  it("keeps material fallback behavior for furniture defaults and inactive requested materials", () => {
    const catalog = makeCatalog();

    expect(firstMaterial(catalog, "board", "board-old")).toBe("board-old");
    expect(firstMaterial(catalog, "edge", "board-a")).toBe("edge-a");
    expect(materialFor(catalog, "board-old", "board")?.id).toBe("board-old");
    expect(materialFor(catalog, "missing", "board")?.id).toBe("board-b");
  });

  it("keeps mesh material preview values and selection emissive feedback", () => {
    const catalog = makeCatalog();

    const normal = makeMeshMaterial(catalog, "board-a", false);
    const selected = makeMeshMaterial(catalog, "board-a", true);

    expect(normal.color.getHexString()).toBe("ff0000");
    expect(normal.roughness).toBe(0.4);
    expect(normal.metalness).toBe(0.05);
    expect(normal.emissiveIntensity).toBe(0);
    expect(selected.emissive.getHexString()).toBe("5a4100");
    expect(selected.emissiveIntensity).toBe(0.18);

    normal.dispose();
    selected.dispose();
  });
});
