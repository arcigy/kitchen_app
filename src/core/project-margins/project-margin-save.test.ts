import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import type { ClientContext } from "../client/client-context";
import { createEmptyProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { assembleProjectSaveFile } from "../project-save/project-save-assembler";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { createFileProjectRepository } from "../project/project-repository";
import { ProjectMarginAuthorityError, ProjectMarginRevisionConflictError } from "./project-margin-errors";
import { assertFullSaveProjectMarginSettingsAllowed } from "./project-margin-save-authority";
import { patchProjectSaveMarginSettings } from "./project-margin-save-patch";
import {
  createDefaultProjectMarginSettingsState,
  normalizeProjectMarginSettingsState,
  type ProjectMarginSettingsState
} from "./project-margin-types";

const ctx: ClientContext = { clientId: "client_margin", userId: "user_margin", role: "owner" };
const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-project-margin-"));
  roots.push(root);
  const repository = createFileProjectRepository(root);
  const project = await repository.createProject(ctx, {
    name: "Margin project",
    location: { address: "Main 1", city: "Bratislava" },
    contact: { name: "Client" }
  });
  const catalog = { clientId: ctx.clientId, ...createSystemCatalogSeed() };
  const quoteSettings = createDefaultProjectMarginSettingsState();
  const save = assembleProjectSaveFile({
    clientId: ctx.clientId,
    projectId: project.projectId,
    activePhaseId: project.activePhaseId,
    project,
    catalog,
    layoutState: { snapshot: {}, windows: [], doors: [] },
    kitchenState: {},
    moduleInstances: [],
    materialAssignments: createEmptyProjectMaterialAssignmentsState(),
    sceneState: {},
    quoteSettings
  });
  await repository.saveProjectSnapshot(ctx, project.projectId, project.activePhaseId, save, {
    marginSettingsMode: "initialize"
  });
  return { repository, project, save };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project margin save authority", () => {
  it("keeps legacy or missing quote settings loadable while enforcing recognized typed state", async () => {
    const { save } = await fixture();
    const legacy = structuredClone(save);
    legacy.appState.quoteSettings = { marginPercent: 12 };
    legacy.phases[0]!.quoteSettings = { marginPercent: 12 };
    expect(() => validateProjectSaveFile(legacy)).not.toThrow();

    const mismatched = structuredClone(save);
    mismatched.phases[0]!.quoteSettings = null;
    expect(() => validateProjectSaveFile(mismatched)).toThrow(/quoteSettings must match/);

    const malformed = structuredClone(save);
    (malformed.appState.quoteSettings as ProjectMarginSettingsState).defaultMarginPercent = 1_001;
    (malformed.phases[0]!.quoteSettings as ProjectMarginSettingsState).defaultMarginPercent = 1_001;
    expect(() => validateProjectSaveFile(malformed)).toThrow(/defaultMarginPercent/);
  });

  it("allows equal state and rejects same-revision edits or legacy null overwrite", () => {
    const stored = { ...createDefaultProjectMarginSettingsState(), initialized: true, revision: 4 };
    expect(() => assertFullSaveProjectMarginSettingsAllowed(stored, structuredClone(stored))).not.toThrow();
    expect(() => assertFullSaveProjectMarginSettingsAllowed(stored, { ...stored, defaultMarginPercent: 99 }))
      .toThrow(ProjectMarginAuthorityError);
    expect(() => assertFullSaveProjectMarginSettingsAllowed(stored, null)).toThrow(ProjectMarginAuthorityError);
  });

  it("patches both active-phase and app-state copies without losing unrelated save data", async () => {
    const { save, project } = await fixture();
    const nextState: ProjectMarginSettingsState = {
      ...createDefaultProjectMarginSettingsState(),
      initialized: true,
      revision: 1,
      groupMargins: { corpus: 15 }
    };
    const patched = patchProjectSaveMarginSettings({
      save,
      phaseId: project.activePhaseId,
      nextState,
      updatedByUserId: ctx.userId,
      updatedAt: "2026-07-18T18:30:00.000Z"
    });
    expect(patched.appState.quoteSettings).toEqual(patched.phases[0]!.quoteSettings);
    expect(normalizeProjectMarginSettingsState(patched.appState.quoteSettings).groupMargins).toEqual({ corpus: 15 });
    expect(patched.appState.materialAssignments).toEqual(save.appState.materialAssignments);
    expect(() => validateProjectSaveFile(patched, { clientId: ctx.clientId, projectId: project.projectId })).not.toThrow();
  });

  it("atomically writes one revision and rejects a stale file-repository writer", async () => {
    const { repository, project } = await fixture();
    const nextState: ProjectMarginSettingsState = {
      ...createDefaultProjectMarginSettingsState(),
      initialized: true,
      revision: 1,
      groupMargins: { corpus: 15 }
    };
    const saved = await repository.updateProjectMarginSettings(
      ctx,
      project.projectId,
      project.activePhaseId,
      0,
      nextState
    );
    expect(saved.appState.quoteSettings).toMatchObject({ revision: 1, groupMargins: { corpus: 15 } });
    expect(saved.phases[0]!.quoteSettings).toEqual(saved.appState.quoteSettings);
    await expect(repository.updateProjectMarginSettings(
      ctx,
      project.projectId,
      project.activePhaseId,
      0,
      nextState
    )).rejects.toBeInstanceOf(ProjectMarginRevisionConflictError);
  });

  it("prevents a generic full save from replacing dedicated margin state", async () => {
    const { repository, project } = await fixture();
    const nextState: ProjectMarginSettingsState = {
      ...createDefaultProjectMarginSettingsState(),
      initialized: true,
      revision: 1,
      groupMargins: { corpus: 15 }
    };
    const saved = await repository.updateProjectMarginSettings(ctx, project.projectId, project.activePhaseId, 0, nextState);
    const stale = structuredClone(saved);
    stale.appState.quoteSettings = null;
    stale.phases[0]!.quoteSettings = null;
    await expect(repository.saveProjectSnapshot(ctx, project.projectId, project.activePhaseId, stale))
      .rejects.toBeInstanceOf(ProjectMarginAuthorityError);
  });
});
