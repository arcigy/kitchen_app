import { describe, expect, it, vi } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { createProjectStateCodec } from "./projectStateCodec";

const appState = {
  layout: {},
  kitchen: {},
  modules: [],
  materialAssignments: createEmptyProjectMaterialAssignmentsState(),
  scene: {}
} satisfies ProjectSaveFile["appState"];

describe("project state codec", () => {
  it("keeps server capture side effects separate from fast local recovery", async () => {
    const captureAppState = vi.fn(() => appState);
    const restoreAppState = vi.fn();
    const clear = vi.fn();
    const restoreInteraction = vi.fn();
    const interaction = { kind: "wall-draw", capturedAt: "2026-08-10T10:00:00.000Z", payload: { a: { x: 1, z: 2 } } } as const;
    const codec = createProjectStateCodec({
      captureAppState,
      restoreAppState,
      interaction: {
        capture: () => interaction,
        validate: (value): value is typeof interaction => !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "wall-draw",
        restore: restoreInteraction,
        clear
      },
      captureHistoryTail: () => [{ revision: 1 }]
    });

    codec.captureServer();
    expect(captureAppState).toHaveBeenLastCalledWith({ commitDraft: true, syncActivity: true, includePreview: true });
    expect(codec.captureRecovery()).toMatchObject({ interaction, historyTail: [{ revision: 1 }] });
    expect(captureAppState).toHaveBeenLastCalledWith({ commitDraft: false, syncActivity: false, includePreview: false });

    await codec.restoreServer(appState);
    expect(clear).toHaveBeenCalledOnce();
    expect(restoreAppState).toHaveBeenLastCalledWith(appState, { recovery: false, historyTail: [] });
    await codec.restoreRecovery({ appState, interaction, historyTail: [{ revision: 1 }] });
    expect(restoreAppState).toHaveBeenLastCalledWith(appState, { recovery: true, historyTail: [{ revision: 1 }] });
    expect(restoreInteraction).toHaveBeenCalledWith(interaction);
  });
});
