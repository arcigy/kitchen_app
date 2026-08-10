// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
import { copyProjectMaterialAssignmentToScope } from "../core/project-materials/project-material-copy";
import { mountProjectMaterialsPanel } from "./materialsPhasePanel";

const NOW = "2026-08-10T08:00:00.000Z";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("materials phase context menu", () => {
  it("exposes assignment, scope override, and tenant-default actions without replacing native editable menus", async () => {
    const catalog = { clientId: "client_test", ...createSystemCatalogSeed() };
    const base = createDefaultProjectMaterialAssignments(catalog, NOW);
    const source = base.assignments.find((assignment) => assignment.category === "front")!;
    const scopeItem = {
      id: "door",
      category: "front" as const,
      label: "Door front",
      description: "Visible front",
      quantity: 1,
      unit: "m2" as const,
      pieces: 1
    };
    const scoped = copyProjectMaterialAssignmentToScope(source, "module:m1", scopeItem, NOW);
    const assignments = { ...base, assignments: [...base.assignments, scoped] };
    const view = createProjectMaterialsView(assignments, [], catalog);
    view.scopes = [{ id: "module:m1", kind: "module", label: "Base cabinet", items: [scopeItem] }];
    const host = document.createElement("section");
    document.body.append(host);
    const actions = {
      onCommitId: vi.fn(async () => ({ ok: true })),
      onResetCategory: vi.fn(async () => undefined),
      onCopyGeneralToScope: vi.fn(async () => undefined),
      onRemoveScopeOverride: vi.fn(async () => undefined)
    };
    const handle = mountProjectMaterialsPanel(host, view, actions);

    const group = host.querySelector<HTMLElement>('[data-material-assignment-category="front"]')!;
    group.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='material-properties']")).not.toBeNull();
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='material-reset-default']")?.click();
    await Promise.resolve();
    expect(actions.onResetCategory).toHaveBeenCalledWith("front");

    const search = host.querySelector<HTMLInputElement>(".materials-phase__search input, input[type='search']");
    if (search) {
      const nativeEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      search.dispatchEvent(nativeEvent);
      expect(nativeEvent.defaultPrevented).toBe(false);
    }

    host.querySelector<HTMLButtonElement>('[data-materials-settings-tab="modules"]')!.click();
    const scope = host.querySelector<HTMLElement>('[data-material-scope-item="door"]')!;
    scope.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='material-create-override']")).not.toBeNull();
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='material-remove-override']")?.click();
    await Promise.resolve();
    expect(actions.onRemoveScopeOverride).toHaveBeenCalledWith("module:m1", "door", "front");
    handle.destroy();
  });
});
