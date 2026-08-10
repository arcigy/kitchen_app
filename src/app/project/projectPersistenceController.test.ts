import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectActions } from "./projectActions";
import { ProjectApiError } from "./projectApi";
import { createProjectPersistenceController } from "./projectPersistenceController";
import type { ProjectRecoveryLease } from "./projectRecoveryLease";
import type { ProjectRecoveryStore } from "./projectRecoveryStore";
import type { ProjectStateCodec } from "./projectStateCodec";

const scope = { clientId: "client_1", userId: "user_1", workspaceId: "project:project_1", projectId: "project_1" };

function harness(saveImplementation: () => Promise<unknown> = async () => ({})) {
  const writeActive = vi.fn(async () => undefined);
  const archiveActive = vi.fn(async () => null);
  const save = vi.fn(saveImplementation);
  const actions = {
    getState: () => ({
      currentProject: { projectId: "project_1", name: "Test" },
      saveRevision: 4,
      lastSavedAt: null,
      editingSessionId: "edit_1"
    }),
    save
  } as unknown as ProjectActions;
  const codec = {
    captureRecovery: () => ({ appState: {}, interaction: null, historyTail: [] })
  } as unknown as ProjectStateCodec;
  const store = {
    writeActive,
    archiveActive
  } as unknown as ProjectRecoveryStore;
  const lease = {
    ownerId: "test-writer",
    fencingToken: () => 1,
    isOwner: () => true,
    start: vi.fn(),
    stop: vi.fn(),
    release: vi.fn(),
    acquire: vi.fn(() => true)
  } as unknown as ProjectRecoveryLease;
  const controller = createProjectPersistenceController({
    actions,
    codec,
    store,
    lease,
    scope,
    getWorkspace: () => ({ kind: "project", project: actions.getState().currentProject }),
    writeWorkspacePointer: vi.fn(),
    localDelayMs: 250,
    interactionDelayMs: 150,
    interactionMaxMs: 500,
    serverIdleMs: 30_000,
    serverMaxMs: 120_000
  });
  return { controller, save, writeActive, archiveActive, lease };
}

describe("project persistence controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("coalesces continuous interaction checkpoints to at most two local writes per second", async () => {
    const { controller, writeActive } = harness();
    controller.start();
    for (let index = 0; index < 20; index += 1) {
      controller.checkpointInteraction({ kind: "transform", capturedAt: new Date().toISOString(), payload: { index } });
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(writeActive.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(writeActive.mock.calls.length).toBeLessThanOrEqual(2);
    await controller.stop({ flush: false });
  });

  it("writes the initial recovery checkpoint without autosaving an unchanged server project", async () => {
    const { controller, save, writeActive } = harness();
    controller.start();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(writeActive).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    controller.markDomainChanged();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledOnce();
    await controller.stop({ flush: false });
  });

  it("does not autosave a loaded scope but does persist a newly created scope", async () => {
    const { controller, save, lease } = harness();
    const loadedScope = { ...scope, workspaceId: "project:project_2", projectId: "project_2" };
    const createdScope = { ...scope, workspaceId: "project:project_3", projectId: "project_3" };
    controller.start();

    await controller.switchScope(loadedScope, { ...lease, ownerId: "loaded-writer" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).not.toHaveBeenCalled();

    await controller.switchScope(createdScope, { ...lease, ownerId: "created-writer" }, { saveInitialState: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledOnce();
    await controller.stop({ flush: false });
  });

  it("waits for the previous scope server write before activating the next lease", async () => {
    let releaseSave: (() => void) | undefined;
    const { controller, lease } = harness(() => new Promise<void>((resolve) => { releaseSave = resolve; }));
    const nextLease = {
      ...lease,
      ownerId: "next-writer",
      start: vi.fn(),
      stop: vi.fn(),
      release: vi.fn()
    };
    controller.start();
    const saving = controller.saveServer();
    await vi.advanceTimersByTimeAsync(0);

    const switching = controller.switchScope(
      { ...scope, workspaceId: "project:project_2", projectId: "project_2" },
      nextLease
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(nextLease.start).not.toHaveBeenCalled();

    releaseSave!();
    await Promise.all([saving, switching]);
    expect(nextLease.start).toHaveBeenCalledOnce();
    await controller.stop({ flush: false });
  });

  it("allows one server write in flight and schedules exactly one follow-up for newer changes", async () => {
    let release: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => { release = resolve; });
    const { controller, save } = harness(vi.fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue({}));
    controller.start();
    const first = controller.saveServer();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ background: true });

    controller.markDomainChanged();
    const whileSaving = controller.saveServer();
    release!();
    await Promise.all([first, whileSaving]);
    await vi.advanceTimersByTimeAsync(0);

    expect(save).toHaveBeenCalledTimes(2);
    await controller.stop({ flush: false });
  });

  it("archives a 409 conflict and never retries it", async () => {
    const conflict = new ProjectApiError("conflict", 409, "PROJECT_SAVE_REVISION_CONFLICT", 5, 4);
    const { controller, save, archiveActive } = harness(async () => { throw conflict; });
    controller.start();

    await controller.saveServer();
    expect(archiveActive).toHaveBeenCalledWith(scope, "revision-conflict", {
      ownerId: "test-writer",
      fencingToken: 1
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(save).toHaveBeenCalledOnce();
    await controller.stop({ flush: false });
  });

  it("retries transient server errors with the fixed 5s then 15s backoff", async () => {
    const { controller, save } = harness(vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue({}));
    controller.start();
    await controller.saveServer();
    expect(save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    await controller.stop({ flush: false });
  });
});
