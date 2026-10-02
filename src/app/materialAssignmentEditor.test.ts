// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
import { applyMaterialAssignmentChanges, clearMaterialAssignment, type MaterialAssignmentChange, type MaterialEditTarget } from "../core/project-materials/project-material-edits";
import { synchronizeRunnerHeightAssignments } from "../core/project-materials/runner-height-assignments";
import { validateProjectMaterialAssignmentsState } from "../core/project-materials/project-material-validation";
import { createMaterialAssignmentEditor } from "./materialAssignmentEditor";
import { mountProjectMaterialsPanel } from "../ui/materialsPhasePanel";

const NOW = "2026-10-02T10:00:00.000Z";
function fixture() {
  const catalog = { clientId: "clipboard-test", ...createSystemCatalogSeed() };
  let state = createDefaultProjectMaterialAssignments(catalog, NOW);
  let view = createProjectMaterialsView(state, [], catalog);
  const notify = vi.fn();
  const commit = vi.fn(async (changes: MaterialAssignmentChange[]) => {
    state = applyMaterialAssignmentChanges(state, changes, state.revision, NOW);
    view = { ...view, assignments: state };
  });
  const editor = createMaterialAssignmentEditor({ getView: () => view, commit, notify, now: () => NOW });
  const target = (category: string): MaterialEditTarget => ({ kind: "assignment", assignmentId: `material-assignment:${category}` });
  return { catalog, editor, commit, notify, target, getState: () => state, getView: () => view, setState: (next: typeof state) => { state = next; view = { ...view, assignments: state }; }, setView: (next: typeof view) => { view = next; state = view.assignments; } };
}

describe("material assignment transactions", () => {
  it("drops queued commands and history when another project is restored during a commit", async () => {
    const f = fixture();
    let finish: (() => void) | undefined;
    f.commit.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const cut = f.editor.execute("cut", f.target("corpus"));
    await vi.waitFor(() => expect(finish).toBeDefined());
    const paste = f.editor.execute("paste", f.target("drawer_bottom"));
    f.editor.reset(); finish!(); await Promise.all([cut, paste]);
    await f.editor.execute("undo", f.target("corpus"));
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.notify).not.toHaveBeenCalledWith("Materiál je vystrihnutý.", "success");
  });
  it("clears a product price while retaining destination demand and appliance classification", () => {
    const f = fixture();
    const component = f.getState().assignments.find(item => item.kind === "component")!;
    const target = { ...component, projectValues: { quantity: 3, unit: "set" as const, unitPrice: 10, currency: "EUR" as const, excludeFromConstructionLabor: true } };
    const cleared = clearMaterialAssignment(target, NOW);
    expect(cleared.projectValues).toEqual({ quantity: 3, unit: "set", excludeFromConstructionLabor: true });
    expect(cleared.componentId).toBeUndefined(); expect(cleared.snapshots).toEqual({});
  });
  it("copies a sheet board into drawer bottoms, preserves its price and supports undo/redo", async () => {
    const f = fixture(); const before = structuredClone(f.getState());
    await f.editor.execute("copy", f.target("corpus"));
    await f.editor.execute("paste", f.target("drawer_bottom"));
    const copied = f.getState().assignments.find(a => a.category === "drawer_bottom")!;
    const source = before.assignments.find(a => a.category === "corpus")!;
    expect(copied).toMatchObject({ materialId: source.materialId, snapshots: source.snapshots });
    expect(f.notify).toHaveBeenCalledWith("Materiál je skopírovaný.", "success");
    await f.editor.execute("undo", f.target("drawer_bottom"));
    expect(f.getState().assignments.find(a => a.category === "drawer_bottom")).toEqual(before.assignments.find(a => a.category === "drawer_bottom"));
    await f.editor.execute("redo", f.target("drawer_bottom"));
    expect(f.getState().assignments.find(a => a.category === "drawer_bottom")).toEqual(copied);
    // Existing save schema roundtrips the exact assignment, including snapshot prices.
    const restored: unknown = JSON.parse(JSON.stringify(f.getState()));
    validateProjectMaterialAssignmentsState(restored);
    expect(restored.assignments.find(a => a.category === "drawer_bottom")).toEqual(JSON.parse(JSON.stringify(copied)));
  });

  it("rejects edge to worktop and component to board without a mutation", async () => {
    const f = fixture(); const before = structuredClone(f.getState());
    for (const source of ["edge_other", "hinge"]) {
      await f.editor.execute("copy", f.target(source)); await f.editor.execute("paste", f.target("worktop"));
    }
    expect(f.getState()).toEqual(before); expect(f.commit).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("nie sú kompatibilné"), "error");
  });

  it("cuts and pastes a captured product after clearing its source, then reverses both transactions", async () => {
    const f = fixture(); const before = structuredClone(f.getState());
    await f.editor.execute("cut", f.target("corpus"));
    expect(f.getState().assignments.find(a => a.category === "corpus")?.snapshots).toEqual({});
    await f.editor.execute("paste", f.target("drawer_bottom"));
    await f.editor.execute("undo", f.target("drawer_bottom"));
    await f.editor.execute("undo", f.target("corpus"));
    expect(f.getState().assignments.find(a => a.category === "corpus")).toEqual(before.assignments.find(a => a.category === "corpus"));
    expect(f.getState().assignments.find(a => a.category === "drawer_bottom")).toEqual(before.assignments.find(a => a.category === "drawer_bottom"));
  });

  it("keeps all four drawer demand identities and quantities while copying a supplier runner", async () => {
    const f = fixture();
    const items = [100, 200, 300, 400].map(height => ({ id: `runner-${height}`, category: "runner" as const, variantKey: `front-height:${height}:corpus-thickness:18`, label: "Runner", description: "Runner", quantity: height / 100, pieces: 1, unit: "pcs" as const }));
    const scopes = [{ id: "module:m", kind: "module" as const, label: "Drawers", items }];
    const state = synchronizeRunnerHeightAssignments(f.getState(), scopes, NOW);
    const first = state.assignments.find(a => a.category === "runner")!;
    const definition = { ...f.catalog.components.find(a => a.componentType === "runner")!, id: "supplier-runner:only-in-project" };
    first.componentId = definition.id; first.snapshots.component = { definition, unitPrice: 12.34, currency: "CZK", priceListId: null, capturedAt: NOW };
    first.customValues.supplierBridge = { supplierProductCode: "R1", normalizedPriceBasis: "set" };
    f.setView({ ...f.getView(), assignments: state, scopes });
    await f.editor.execute("copy", { kind: "assignment", assignmentId: first.assignmentId });
    for (const item of items.slice(1)) await f.editor.execute("paste", { kind: "assignment", assignmentId: `material-assignment:runner:${item.variantKey}` });
    const runners = f.getState().assignments.filter(a => a.category === "runner");
    expect(runners).toHaveLength(4);
    for (const runner of runners) {
      expect(runner.snapshots.component?.unitPrice).toBe(12.34);
      expect(runner.customValues.drawerFrontHeightMm).toBe(Number(runner.variantKey?.split(":")[1]));
      expect(runner.projectValues?.quantity).toBeUndefined();
    }
    await f.editor.execute("delete", { kind: "assignment", assignmentId: first.assignmentId });
    expect(f.getState().assignments.filter(a => a.category === "runner")).toHaveLength(4);
    await f.editor.execute("undo", { kind: "assignment", assignmentId: first.assignmentId });
    expect(f.getState().assignments.find(a => a.assignmentId === first.assignmentId)?.componentId).toBe(definition.id);
  });

  it("creates an empty scoped override on delete and restores inheritance on undo", async () => {
    const f = fixture(); f.setView({ ...f.getView(), scopes: [{ id: "module:a", kind: "module", label: "A", items: [{ id: "side", category: "corpus", label: "Side", description: "", quantity: 1, unit: "m2", pieces: 1 }] }] });
    const target = { kind: "scope", scopeId: "module:a", itemId: "side", category: "corpus" } satisfies MaterialEditTarget;
    await f.editor.execute("delete", target);
    expect(f.getState().assignments.find(a => a.assignmentId === "material-assignment:module:a:corpus:side")?.snapshots).toEqual({});
    await f.editor.execute("undo", target);
    expect(f.getState().assignments.some(a => a.assignmentId === "material-assignment:module:a:corpus:side")).toBe(false);
  });

  it("does not add history after a failed remote commit or overwrite a concurrent change", async () => {
    const f = fixture(); const before = structuredClone(f.getState());
    f.commit.mockRejectedValueOnce(new Error("Offline"));
    await f.editor.execute("delete", f.target("corpus")); await f.editor.execute("undo", f.target("corpus"));
    expect(f.getState()).toEqual(before); expect(f.commit).toHaveBeenCalledTimes(1);
    await f.editor.execute("delete", f.target("corpus"));
    const changed = structuredClone(f.getState()); changed.assignments.find(a => a.category === "corpus")!.customValues.otherSession = true;
    f.setState(changed); await f.editor.execute("undo", f.target("corpus"));
    expect(f.getState()).toEqual(changed); expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("medzičasom"), "error");
  });

  it("routes Ctrl and Command shortcuts from selected rows, keeps focus after render and leaves text input shortcuts native", async () => {
    const f = fixture(); const host = document.createElement("div"); document.body.appendChild(host);
    const onMaterialCommand = vi.fn(async (_command: string) => {});
    const panel = mountProjectMaterialsPanel(host, f.getView(), { onCommitId: async () => ({ ok: true }), onMaterialCommand });
    const row = host.querySelector<HTMLElement>('[data-material-assignment-id="material-assignment:corpus"]')!;
    row.querySelector("strong")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(row.classList.contains("materials-assignment--selected")).toBe(true);
    for (const key of ["c", "v", "x", "z", "Delete"]) row.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: key !== "Delete", bubbles: true, cancelable: true }));
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "v", metaKey: true, bubbles: true, cancelable: true }));
    expect(onMaterialCommand.mock.calls.map(call => call[0])).toEqual(["copy", "paste", "cut", "undo", "delete", "paste"]);
    panel.update(f.getView());
    expect(document.activeElement?.getAttribute("data-material-assignment-id")).toBe("material-assignment:corpus");
    const input = document.createElement("input"); host.appendChild(input); input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onMaterialCommand).toHaveBeenCalledTimes(6);
    panel.destroy(); host.remove();
  });
});
