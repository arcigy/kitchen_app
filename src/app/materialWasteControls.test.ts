// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectMarginSettingsState } from "../core/project-margins/project-margin-types";
import { buildProjectMarginsView, type ProjectMarginsView } from "../layout/bom/projectMargins";
import { createMarginsPhaseController } from "./marginsPhaseController";
import { ProjectMarginsApiError, type SetProjectManufacturingRequest } from "./projectMarginsApi";
import { createMaterialsPhaseController } from "./materialsPhaseController";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
import { EMPTY_SUPPLIER_BRIDGE_PANEL_STATE } from "../ui/materialsPhasePanel";

function initialView(editable = true) {
  const state = createDefaultProjectMarginSettingsState(); state.initialized = true; state.revision = 4;
  state.manufacturing = { ...state.manufacturing, pricingMode: "configured", boardWastePercent: 12, edgeWastePercent: 5,
    boardWasteByMaterialId: { "board-special": 7 }, edgeWasteByMaterialId: { "edge-special": 8 },
    preassemblyByModuleType: { base: 22 }, preassemblyByPreset: { preset: 11 }, preassemblyByInstanceId: { cabinet: 0 },
    recipeSnapshots: { recipe: { id: "recipe", version: 1, name: "Recipe", layers: [{ id: "a", materialId: "board-special", thicknessMm: 18, unitPrice: 70 }], operations: [] } }
  };
  return buildProjectMarginsView([], state, { editable });
}
function host() { const el = document.createElement("section"); document.body.append(el); return el; }
function fill(container: HTMLElement, selector: string, value: string) { container.querySelector<HTMLInputElement>(selector)!.value = value; }
function submit(container: HTMLElement) { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
const board = "[data-material-board-waste]", edge = "[data-material-edge-waste]";
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("material waste controls through the existing pricing owner", () => {
  it("loads without mutation and changes only waste rates, accepting decimal comma and explicit zero", async () => {
    const container = host(), original = initialView(), onViewChanged = vi.fn();
    const save = vi.fn(async (_id: string, request: SetProjectManufacturingRequest) =>
      buildProjectMarginsView([], { ...original.settings, revision: 5, manufacturing: request.manufacturing }, { editable: true }));
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p", onViewChanged,
      api: { loadProjectMargins: vi.fn(async () => original), setProjectManufacturing: save } });
    await controller.open();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>(board)!.value).toBe("12");
    fill(container, board, "30,5"); fill(container, edge, "0"); submit(container);
    await vi.waitFor(() => expect(onViewChanged).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 5 })));
    await controller.close();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toEqual({ revision: 4, manufacturing: { ...original.settings.manufacturing, boardWastePercent: 30.5, edgeWastePercent: 0 } });
    expect(onViewChanged).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 5 }));
  });

  it.each(["-1", "abc", "Infinity", "1e999", "30%", "1,2,3"])("blocks invalid percentage %s before sending it", async value => {
    const container = host(), save = vi.fn();
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p",
      api: { loadProjectMargins: vi.fn(async () => initialView()), setProjectManufacturing: save } });
    await controller.open(); fill(container, board, value); submit(container); await controller.close();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector(board)?.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nezáporné percento");
  });

  it("preserves missing rates as null and switching the existing mode preserves all other settings", async () => {
    const container = host(), original = initialView();
    const save = vi.fn(async (_id: string, request: SetProjectManufacturingRequest) =>
      buildProjectMarginsView([], { ...original.settings, revision: 5, manufacturing: request.manufacturing }));
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p",
      api: { loadProjectMargins: vi.fn(async () => original), setProjectManufacturing: save } });
    await controller.open(); fill(container, board, ""); fill(container, edge, "0");
    container.querySelector<HTMLInputElement>("[data-material-waste-enabled]")!.checked = false;
    submit(container); await vi.waitFor(() => expect(save).toHaveBeenCalledOnce()); await controller.close();
    expect(save.mock.calls[0]![1].manufacturing).toEqual({ ...original.settings.manufacturing, pricingMode: "legacy", boardWastePercent: null, edgeWastePercent: 0 });
  });

  it("blocks writes for a read-only project", async () => {
    const container = host(), save = vi.fn();
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p",
      api: { loadProjectMargins: vi.fn(async () => initialView(false)), setProjectManufacturing: save } });
    await controller.open();
    expect(container.querySelector<HTMLInputElement>(board)!.disabled).toBe(true);
    fill(container, board, "99"); submit(container); await controller.close();
    expect(save).not.toHaveBeenCalled();
  });

  it("reloads authoritative rates after a conflict and uses the fresh revision on retry", async () => {
    const container = host(), original = initialView(), newer = initialView(); newer.revision = newer.settings.revision = 9;
    newer.settings.manufacturing.boardWastePercent = 44; newer.settings.manufacturing.preassemblyByInstanceId.cabinet = 19;
    const load = vi.fn().mockResolvedValueOnce(original).mockResolvedValue(newer);
    const save = vi.fn().mockRejectedValueOnce(new ProjectMarginsApiError("Conflict", 409, "REVISION_CONFLICT", 9))
      .mockImplementationOnce(async (_id: string, request: SetProjectManufacturingRequest) =>
        buildProjectMarginsView([], { ...newer.settings, revision: 10, manufacturing: request.manufacturing }));
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p", api: { loadProjectMargins: load, setProjectManufacturing: save } });
    await controller.open(); fill(container, board, "30"); submit(container);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("medzičasom zmenil"));
    expect(container.querySelector<HTMLInputElement>(board)!.value).toBe("30");
    expect(controller.getView()?.revision).toBe(9);
    fill(container, board, "31"); submit(container); await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2)); await controller.close();
    expect(save.mock.calls[1]![1]).toEqual({ revision: 9, manufacturing: { ...newer.settings.manufacturing, boardWastePercent: 31 } });
  });

  it("leaves during saving immediately and ignores duplicate submits", async () => {
    const container = host(); let finish!: (view: ProjectMarginsView) => void;
    const save = vi.fn(() => new Promise<ProjectMarginsView>(resolve => { finish = resolve; }));
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p",
      api: { loadProjectMargins: vi.fn(async () => initialView()), setProjectManufacturing: save } });
    await controller.open(); submit(container); submit(container);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const startedAt = performance.now();
    await controller.close();
    expect(performance.now() - startedAt).toBeLessThan(250);
    finish(initialView());
    controller.destroy();
  });

  it("retains the draft after a failed request and verifies authoritative settings", async () => {
    const container = host(), onViewChanged = vi.fn();
    const controller = createMarginsPhaseController({ container, presentation: "material-waste", getProjectId: () => "p", onViewChanged,
      api: { loadProjectMargins: vi.fn(async () => initialView()), setProjectManufacturing: vi.fn().mockRejectedValue(new Error("Offline")) } });
    await controller.open(); fill(container, board, "90"); submit(container);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Offline"));
    await controller.close();
    expect(container.querySelector<HTMLInputElement>(board)!.value).toBe("90");
    expect(onViewChanged).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Offline");
  });

  it("keeps an edited waste value and its focus through supplier/material panel rerenders", async () => {
    const container = host(), catalog = { clientId: "test", ...createSystemCatalogSeed() };
    const materials = createProjectMaterialsView(createDefaultProjectMaterialAssignments(catalog), [], catalog);
    const controller = createMaterialsPhaseController({ container, catalog, getProjectId: () => "p", getQuantities: () => [], onPricingChanged: vi.fn(),
      api: { loadProjectMaterials: vi.fn(async () => materials) }, pricingApi: { loadProjectMargins: vi.fn(async () => initialView()) } });
    await controller.open();
    await vi.waitFor(() => expect(container.querySelector(board)).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>(board)!; input.value = "37,5"; input.focus();
    controller.setSupplierBridgeState({ ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE, connection: "connected" });
    expect(container.querySelector(board)).toBe(input); expect(input.value).toBe("37,5"); expect(document.activeElement).toBe(input);
    await controller.close();
  });
});
