// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId
} from "../core/project-margins/project-margin-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import { createMarginsPhaseController } from "./marginsPhaseController";

const target = { scopeId: "module:base-1", itemId: "left-side", category: "corpus" as const };
const targetId = projectMarginTargetId(target);

function view(revision: number, overrides: Partial<ProjectMarginsView> = {}): ProjectMarginsView {
  const settings = {
    ...createDefaultProjectMarginSettingsState(),
    initialized: true,
    revision
  };
  return {
    revision,
    editable: true,
    currency: "EUR",
    priceAuthority: "BOM",
    settings,
    summary: {
      baseCost: 100,
      marginAmount: 20,
      combinedMarginPercent: 20,
      finalPrice: 120,
      overrideCount: 0,
      missingPriceCount: 0
    },
    groups: [{
      category: "corpus",
      label: "Korpus",
      description: "Korpusové dosky",
      baseCost: 100,
      marginPercent: 20,
      combinedMarginPercent: 20,
      marginAmount: 20,
      finalPrice: 120,
      overrideCount: 0,
      missingPriceCount: 0,
      items: [{
        ...target,
        targetId,
        label: "Ľavý bok",
        scopeLabel: "Spodná skrinka",
        resourceLabel: "DTDL",
        quantity: 1,
        unit: "m2",
        baseCost: 100,
        marginPercent: 20,
        marginAmount: 20,
        finalPrice: 120,
        source: "fallback",
        missingPrice: false
      }]
    }],
    warnings: [],
    ...overrides
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("margins phase controller", () => {
  it("loads one authoritative project view and commits a group with its current revision", async () => {
    const container = document.createElement("section");
    document.body.appendChild(container);
    const initial = view(4);
    const updated = view(5);
    const loadProjectMargins = vi.fn(async () => initial);
    const applyProjectMarginGroup = vi.fn(async () => updated);
    const onViewChanged = vi.fn();
    const controller = createMarginsPhaseController({
      container,
      getProjectId: () => "project-1",
      onViewChanged,
      api: { loadProjectMargins, applyProjectMarginGroup }
    });

    await expect(controller.open()).resolves.toMatchObject({ revision: 4 });
    const result = await controller.commitGroup({ groupId: "corpus", marginPercent: 15, committedValue: 20 });

    expect(result).toEqual({ ok: true });
    expect(applyProjectMarginGroup).toHaveBeenCalledWith(
      "project-1",
      { revision: 4, category: "corpus", marginPercent: 15 },
      expect.any(AbortSignal)
    );
    expect(controller.getView()).toMatchObject({ revision: 5 });
    expect(onViewChanged).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 5 }));
    await controller.close();
  });

  it("commits project defaults and resets group overrides with authoritative revisions", async () => {
    const updateProjectMarginDefault = vi.fn(async () => view(5));
    const setProjectAdditionalLabor = vi.fn(async () => view(6));
    const resetProjectMarginGroup = vi.fn(async () => view(7));
    const controller = createMarginsPhaseController({
      container: document.createElement("section"),
      getProjectId: () => "project-1",
      api: {
        loadProjectMargins: vi.fn(async () => view(4)),
        updateProjectMarginDefault,
        setProjectAdditionalLabor,
        resetProjectMarginGroup
      }
    });
    await controller.open();

    await expect(controller.commitDefault({ marginPercent: 17.5, committedValue: 20 }))
      .resolves.toEqual({ ok: true });
    expect(updateProjectMarginDefault).toHaveBeenCalledWith(
      "project-1",
      { revision: 4, marginPercent: 17.5 },
      expect.any(AbortSignal)
    );

    await expect(controller.commitAdditionalLabor({ additionalLaborCost: 125.75, committedValue: 0 }))
      .resolves.toEqual({ ok: true });
    expect(setProjectAdditionalLabor).toHaveBeenCalledWith(
      "project-1",
      { revision: 5, additionalLaborCost: 125.75 },
      expect.any(AbortSignal)
    );

    await expect(controller.resetGroup("corpus")).resolves.toEqual({ ok: true });
    expect(resetProjectMarginGroup).toHaveBeenCalledWith(
      "project-1",
      { revision: 6, category: "corpus" },
      expect.any(AbortSignal)
    );
    expect(controller.getView()).toMatchObject({ revision: 7 });
    await controller.close();
  });

  it("blocks every mutation for a read-only server view", async () => {
    const applyProjectMarginGroup = vi.fn();
    const controller = createMarginsPhaseController({
      container: document.createElement("section"),
      getProjectId: () => "project-1",
      api: {
        loadProjectMargins: vi.fn(async () => view(2, { editable: false })),
        applyProjectMarginGroup
      }
    });
    await controller.open();

    await expect(controller.commitGroup({ groupId: "corpus", marginPercent: 15, committedValue: 20 }))
      .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/opr.*vnenie/i) });
    expect(applyProjectMarginGroup).not.toHaveBeenCalled();
    await controller.close();
  });

  it("reloads the authoritative state after a revision conflict", async () => {
    const loadProjectMargins = vi.fn()
      .mockResolvedValueOnce(view(3))
      .mockResolvedValueOnce(view(7));
    const conflict = Object.assign(new Error("stale"), { status: 409, code: "PROJECT_MARGIN_REVISION_CONFLICT" });
    const controller = createMarginsPhaseController({
      container: document.createElement("section"),
      getProjectId: () => "project-1",
      api: {
        loadProjectMargins,
        applyProjectMarginGroup: vi.fn(async () => { throw conflict; })
      }
    });
    await controller.open();

    const result = await controller.commitGroup({ groupId: "corpus", marginPercent: 15, committedValue: 20 });

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/medzi.*asom/i) });
    expect(loadProjectMargins).toHaveBeenCalledTimes(2);
    expect(controller.getView()).toMatchObject({ revision: 7 });
    await controller.close();
  });

  it("resolves an item by stable target id and rejects stale rows before calling the API", async () => {
    const updateProjectMarginItem = vi.fn(async () => view(2));
    const controller = createMarginsPhaseController({
      container: document.createElement("section"),
      getProjectId: () => "project-1",
      api: {
        loadProjectMargins: vi.fn(async () => view(1)),
        updateProjectMarginItem
      }
    });
    await controller.open();

    await expect(controller.commitItem({ itemId: "missing-target", marginPercent: 30, committedValue: 20 }))
      .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/neexistuje/i) });
    expect(updateProjectMarginItem).not.toHaveBeenCalled();

    await expect(controller.commitItem({ itemId: targetId, marginPercent: 30, committedValue: 20 }))
      .resolves.toEqual({ ok: true });
    expect(updateProjectMarginItem).toHaveBeenCalledWith(
      "project-1",
      { revision: 1, target, marginPercent: 30 },
      expect.any(AbortSignal)
    );
    await controller.close();
  });
});
