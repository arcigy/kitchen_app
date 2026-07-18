import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSystemSeedCatalog } from "../catalog/catalog-repository";
import type { ClientContext } from "../client/client-context";
import { createFileProjectRepository } from "../project/project-repository";
import { createProjectService } from "../project/project-service";
import { assembleProjectSaveFile } from "./project-save-assembler";
import {
  decryptProjectExportPayload,
  decryptProjectSaveFile,
  encryptProjectSaveFile,
} from "./project-save-crypto";
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_MAGIC,
  toSafeProjectFileName,
} from "./project-save-file";
import { migrateProjectSaveFile } from "./project-save-migrations";
import {
  auditProjectSaveSerializers,
  PROJECT_SAVE_SERIALIZERS,
} from "./project-save-serializers";
import type {
  EncryptedProjectFileEnvelope,
  ProjectSaveFile,
} from "./project-save-types";
import {
  createEmptyProjectMaterialAssignmentsState,
  type ProjectMaterialAssignmentsState,
} from "../project-materials/project-material-types";
import type { ClientCatalog } from "../catalog/catalog-types";
import { loadProjectSaveFile } from "./project-save-loader";
import { patchProjectSaveMaterialAssignments } from "../project-materials/project-material-save-patch";
import { ProjectMaterialRevisionConflictError } from "../project-materials/project-material-errors";
import {
  createProjectWriteIdempotency,
  createProjectWriteIdempotencyForText,
  ProjectIdempotencyConflictError,
  ProjectSaveRevisionConflictError,
} from "../project/project-write-consistency";
import {
  deterministicProjectId,
  type ProjectOperationReceipt,
} from "../project/project-operation-idempotency";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId,
} from "../project-margins/project-margin-types";

const ctxA: ClientContext = {
  userId: "user_a",
  clientId: "client_a",
  role: "owner",
};
const ctxB: ClientContext = {
  userId: "user_b",
  clientId: "client_b",
  role: "owner",
};

const createInput = {
  name: "Secret Kitchen",
  location: { address: "Main 1", city: "Bratislava" },
  contact: { name: "Jane Client", email: "jane@example.com" },
};

const assignmentTimestamp = "2026-07-09T12:00:00.000Z";

function createMaterialAssignments(
  catalog: ClientCatalog,
): ProjectMaterialAssignmentsState {
  const material =
    catalog.materials.find((item) => item.materialType === "board") ??
    catalog.materials[0];
  const edge =
    catalog.materials.find((item) => item.materialType === "edge") ??
    catalog.materials[0];
  const component = catalog.components[0];
  if (!material || !edge || !component)
    throw new Error(
      "System catalog must include material, edge and component fixtures.",
    );
  const snapshot = <T extends typeof material | typeof component>(
    definition: T,
  ) => ({
    definition,
    unitPrice: catalog.priceList.prices[definition.id] ?? null,
    currency: catalog.priceList.currency,
    priceListId: catalog.priceList.id,
    capturedAt: assignmentTimestamp,
  });
  return {
    schemaVersion: 1,
    initialized: true,
    revision: 3,
    updatedAt: assignmentTimestamp,
    assignments: [
      {
        assignmentId: "assignment-corpus",
        category: "corpus",
        kind: "material",
        materialId: material.id,
        edgeFrontId: edge.id,
        edgeOtherId: edge.id,
        thicknessMm: 18,
        customValues: {
          wastePercent: 7.5,
          note: "project override",
          nested: { enabled: true },
        },
        source: "user",
        snapshots: {
          material: snapshot(material),
          edgeFront: snapshot(edge),
          edgeOther: snapshot(edge),
        },
        updatedAt: assignmentTimestamp,
      },
      {
        assignmentId: "assignment-handle",
        category: "handle",
        kind: "component",
        componentId: component.id,
        customValues: { finish: "black" },
        source: "auto",
        snapshots: { component: snapshot(component) },
        updatedAt: assignmentTimestamp,
      },
    ],
  };
}

function encryptLegacyProjectSave(
  save: unknown,
  secret: string,
): EncryptedProjectFileEnvelope {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret, "utf-8").digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = {
    payloadType: "furnquote-project-export",
    payloadVersion: 1,
    exportedAt: assignmentTimestamp,
    save,
    bundledAssets: [],
  };
  const ciphertext = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(JSON.stringify(payload), "utf-8"))),
    cipher.final(),
  ]);
  return {
    magic: PROJECT_FILE_MAGIC,
    envelopeVersion: 1,
    algorithm: "AES-256-GCM",
    keyId: "legacy-test",
    createdAt: assignmentTimestamp,
    payloadEncoding: "base64",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function expectEncryptedEnvelopeMetadataToExclude(
  envelope: EncryptedProjectFileEnvelope,
  plaintextValues: string[],
): void {
  expect(Object.keys(envelope).sort()).toEqual([
    "algorithm",
    "authTag",
    "ciphertext",
    "createdAt",
    "envelopeVersion",
    "iv",
    "keyId",
    "magic",
    "payloadEncoding",
  ]);
  expect(envelope.ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  const { ciphertext: _ciphertext, ...metadata } = envelope;
  const metadataText = JSON.stringify(metadata);
  for (const value of plaintextValues)
    expect(metadataText).not.toContain(value);
}

describe("project create/save/encryption", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "kitchen-project-save-"));
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates tenant project metadata and default phase", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    expect(project.clientId).toBe("client_a");
    expect(project.name).toBe("Secret Kitchen");
    expect(project.activePhaseId).toBe("phase_1");
    const metaPath = path.join(
      root,
      "storage",
      "clients",
      "client_a",
      "projects",
      project.projectId,
      "project.meta.json",
    );
    const stored = JSON.parse(await readFile(metaPath, "utf-8")) as {
      contact: { name: string };
      phases: string[];
    };
    expect(stored.contact.name).toBe("Jane Client");
    expect(stored.phases).toEqual(["phase_1"]);
  });

  it("keeps client projects isolated", async () => {
    const repo = createFileProjectRepository(root);
    const projectA = await repo.createProject(ctxA, createInput);
    await expect(repo.getProject(ctxB, projectA.projectId)).rejects.toThrow(
      /metadata is missing|different client|does not belong/i,
    );
  });

  it("assembles a complete serializable save with catalog snapshot", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const save = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: { instances: [] }, windows: [], doors: [] },
      kitchenState: {
        context: {
          worktopMaterialId: catalog.kitchenDefaults.worktopMaterialId,
        },
      },
      moduleInstances: [
        {
          id: "m1",
          type: "drawer_low",
          params: {
            materialId: catalog.kitchenDefaults.carcassMaterialId,
            runnerComponentId: "component.runner.snapshot",
            liftUpComponentId: "component.lift-up.snapshot",
            legComponentId: "component.leg.snapshot",
            fastenerComponentId: "component.fastener.snapshot",
          },
        },
      ],
      materialAssignments: createMaterialAssignments(catalog),
      sceneState: { mode: "layout" },
      quoteSettings: { margin: 12 },
    });
    expect(save.saveFormatVersion).toBe(2);
    expect(save.project.contact.name).toBe("Jane Client");
    expect(save.phases[0].moduleInstances).toHaveLength(1);
    expect(save.catalogSnapshot.fullCatalog?.clientId).toBe("client_a");
    expect(save.appState.materialAssignments.assignments).toHaveLength(2);
    expect(save.phases[0].materialAssignments).toEqual(
      save.appState.materialAssignments,
    );
    expect(save.catalogSnapshot.usedMaterialIds).toEqual(
      expect.arrayContaining([
        save.appState.materialAssignments.assignments[0].materialId,
        save.appState.materialAssignments.assignments[0].edgeFrontId,
      ]),
    );
    expect(save.catalogSnapshot.usedComponentIds).toContain(
      save.appState.materialAssignments.assignments[1].componentId,
    );
    expect(save.catalogSnapshot.usedComponentIds).toEqual(
      expect.arrayContaining([
        "component.runner.snapshot",
        "component.lift-up.snapshot",
        "component.leg.snapshot",
        "component.fastener.snapshot",
      ]),
    );
    expect(JSON.stringify(save)).not.toContain("function");
  });

  it("saves and loads project snapshot under tenant storage", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const save = await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: {
        snapshot: {
          wallCounter: 1,
          walls: [],
          instanceCounter: 1,
          instances: [],
          pinnedWallIds: [],
          pinnedInstanceIds: [],
          underlayPinned: false,
          selected: {
            kind: null,
            wallId: null,
            wallIds: [],
            instId: null,
            instIds: [],
          },
        },
        windows: [],
        doors: [],
      },
      kitchenState: { groups: [] },
      moduleInstances: [
        {
          id: "m-secret",
          type: "drawer_low",
          params: { materialId: "mat.board.body.dtd.grey.18", width: 1234 },
        },
      ],
      materialAssignments: createMaterialAssignments(catalog),
      sceneState: { viewMode: "3d" },
      recentActivity: {
        entries: [
          {
            id: 1,
            label: "Wall W1 added",
            createdAt: 1779650000000,
            snapshot: null,
            target: { kind: "wall", id: "w1" },
          },
        ],
        idCounter: 2,
      },
    });
    const loaded = await service.loadProject(ctxA, project.projectId);
    expect(loaded.projectId).toBe(save.projectId);
    expect(loaded.catalogSnapshot.fullCatalog?.clientId).toBe("client_a");
    expect(loaded.appState.recentActivity).toEqual(
      save.appState.recentActivity,
    );
    expect(loaded.appState.materialAssignments).toEqual(
      save.appState.materialAssignments,
    );
    expect(save.integrity.saveRevision).toBe(1);
  });

  it("creates one durable project for an exact retried create request", async () => {
    const repoA = createFileProjectRepository(root);
    const repoB = createFileProjectRepository(root);
    const idempotency = createProjectWriteIdempotency({
      clientId: ctxA.clientId,
      scope: "project-create",
      key: "create-request-0001",
      request: createInput,
    });
    const receipt: ProjectOperationReceipt = {
      operation: "create",
      ...idempotency,
    };
    const projectId = deterministicProjectId("project", receipt);

    const first = await repoA.createProject(ctxA, createInput, {
      projectId,
      receipt,
    });
    const replay = await repoB.createProject(ctxA, createInput, {
      projectId,
      receipt,
    });
    expect(replay).toEqual(first);
    expect(JSON.stringify(first)).not.toContain("arcigyOperationReceipt");
    expect(await repoA.listProjects(ctxA)).toHaveLength(1);

    await expect(
      repoB.createProject(
        ctxA,
        { ...createInput, name: "Different" },
        {
          projectId,
          receipt: { ...receipt, requestHash: "c".repeat(64) },
        },
      ),
    ).rejects.toBeInstanceOf(ProjectIdempotencyConflictError);
  });

  it("replays identical saves and rejects stale concurrent writes", async () => {
    const repoA = createFileProjectRepository(root);
    const repoB = createFileProjectRepository(root);
    const project = await repoA.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const makeSave = (marker: string) =>
      assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: { marker, windows: [], doors: [] },
        kitchenState: {},
        moduleInstances: [],
        sceneState: {},
      });
    const firstRequest = { marker: "first" };
    const firstIdempotency = createProjectWriteIdempotency({
      clientId: ctxA.clientId,
      scope: `project-save:${project.projectId}`,
      key: "save-request-first",
      request: firstRequest,
    });

    const first = await repoA.saveProjectSnapshot(
      ctxA,
      project.projectId,
      project.activePhaseId,
      makeSave("first"),
      {
        expectedRevision: 0,
        idempotency: firstIdempotency,
      },
    );
    const replay = await repoB.saveProjectSnapshot(
      ctxA,
      project.projectId,
      project.activePhaseId,
      makeSave("first"),
      {
        expectedRevision: 0,
        idempotency: firstIdempotency,
      },
    );
    expect(first.integrity.saveRevision).toBe(1);
    expect(replay).toEqual(first);

    await expect(
      repoB.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        makeSave("different"),
        {
          expectedRevision: 0,
          idempotency: { ...firstIdempotency, requestHash: "b".repeat(64) },
        },
      ),
    ).rejects.toBeInstanceOf(ProjectIdempotencyConflictError);

    const concurrent = await Promise.allSettled([
      repoA.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        makeSave("writer-a"),
        {
          expectedRevision: 1,
          idempotency: createProjectWriteIdempotency({
            clientId: ctxA.clientId,
            scope: `project-save:${project.projectId}`,
            key: "save-request-writer-a",
            request: { marker: "writer-a" },
          }),
        },
      ),
      repoB.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        makeSave("writer-b"),
        {
          expectedRevision: 1,
          idempotency: createProjectWriteIdempotency({
            clientId: ctxA.clientId,
            scope: `project-save:${project.projectId}`,
            key: "save-request-writer-b",
            request: { marker: "writer-b" },
          }),
        },
      ),
    ]);
    expect(
      concurrent.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const stale = concurrent.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(stale?.reason).toBeInstanceOf(ProjectSaveRevisionConflictError);
    const loaded = await repoA.loadProjectSave(
      ctxA,
      project.projectId,
      project.activePhaseId,
    );
    expect(loaded.integrity.saveRevision).toBe(2);
  });

  it("preserves project material and margin settings through encrypted FQP export and import", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const materialAssignments = createMaterialAssignments(catalog);
    const marginTarget = {
      scopeId: "module:base-1",
      itemId: "left-side",
      category: "corpus" as const,
    };
    const quoteSettings = {
      ...createDefaultProjectMarginSettingsState(),
      initialized: true,
      groupMargins: { corpus: 15, front: 25 },
      itemOverrides: [{
        ...marginTarget,
        targetId: projectMarginTargetId(marginTarget),
        marginPercent: 33.25,
      }],
      updatedAt: "2026-07-18T19:00:00.000Z",
    };
    const saved = await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      materialAssignments,
      sceneState: {},
      quoteSettings,
    }, { marginSettingsMode: "initialize" });

    const envelope = await service.exportEncryptedProjectFile(
      ctxA,
      project.projectId,
      { secret: "test-project-file-secret" },
    );
    const imported = await service.importEncryptedProjectFile(ctxA, envelope, {
      secret: "test-project-file-secret",
    });
    expect(imported.projectId).not.toBe(saved.projectId);
    expect(imported.appState.materialAssignments).toEqual(materialAssignments);
    expect(imported.phases[0].materialAssignments).toEqual(materialAssignments);
    expect(imported.appState.quoteSettings).toEqual(quoteSettings);
    expect(imported.phases[0].quoteSettings).toEqual(quoteSettings);
    expect(
      imported.appState.materialAssignments.assignments[0].customValues,
    ).toEqual({
      wastePercent: 7.5,
      note: "project override",
      nested: { enabled: true },
    });
  });

  it("patches project materials without dropping unrelated save data", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const base = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
      assets: {
        bundled: [],
        external: [
          {
            assetId: "system-texture",
            originalPath: "/system/texture.jpg",
            reason: "system_asset",
          },
        ],
        missing: [],
        generated: [
          {
            assetId: "render-keep",
            originalPath: "/renders/keep.png",
            kind: "render",
            reason: "regeneratable",
          },
        ],
      },
    });
    base.catalogSnapshot.modules.push({
      id: "module-snapshot-keep",
      marker: "preserve",
    });
    const nextState = createMaterialAssignments(catalog);
    nextState.revision = 1;
    nextState.updatedAt = assignmentTimestamp;

    const patched = patchProjectSaveMaterialAssignments({
      save: base,
      phaseId: project.activePhaseId,
      nextState,
      updatedByUserId: "material-editor",
      updatedAt: assignmentTimestamp,
    });

    expect(patched.assets).toEqual(base.assets);
    expect(patched.catalogSnapshot.modules).toEqual(
      base.catalogSnapshot.modules,
    );
    expect(patched.appState.materialAssignments).toEqual(nextState);
    expect(patched.phases[0].materialAssignments).toEqual(nextState);
    expect(patched.project.updatedByUserId).toBe("material-editor");
    expect(patched.integrity.savedAt).toBe(assignmentTimestamp);
    const materialSnapshot = nextState.assignments[0].snapshots.material!;
    const componentSnapshot = nextState.assignments[1].snapshots.component!;
    expect(patched.catalogSnapshot.materials).toContainEqual(
      materialSnapshot.definition,
    );
    expect(patched.catalogSnapshot.components).toContainEqual(
      componentSnapshot.definition,
    );
    expect(patched.catalogSnapshot.usedMaterialIds).toContain(
      materialSnapshot.definition.id,
    );
    expect(patched.catalogSnapshot.usedComponentIds).toContain(
      componentSnapshot.definition.id,
    );
    if (materialSnapshot.unitPrice !== null) {
      expect(
        (
          patched.catalogSnapshot.priceListSnapshot as {
            prices: Record<string, number>;
          }
        ).prices[materialSnapshot.definition.id],
      ).toBe(materialSnapshot.unitPrice);
      expect(
        patched.catalogSnapshot.fullCatalog?.priceList.prices[
          materialSnapshot.definition.id
        ],
      ).toBe(materialSnapshot.unitPrice);
    }
  });

  it("serializes file material CAS updates and rejects stale full saves", async () => {
    const repoA = createFileProjectRepository(root);
    const repoB = createFileProjectRepository(root);
    const project = await repoA.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const staleSave = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
      assets: {
        bundled: [],
        external: [
          {
            assetId: "keep-external",
            originalPath: "/system/keep",
            reason: "system_asset",
          },
        ],
        missing: [],
        generated: [],
      },
    });
    await repoA.saveProjectSnapshot(
      ctxA,
      project.projectId,
      project.activePhaseId,
      staleSave,
    );

    const nextA = createMaterialAssignments(catalog);
    nextA.revision = 1;
    nextA.updatedAt = "2026-07-09T12:01:00.000Z";
    const nextB = structuredClone(nextA);
    nextB.updatedAt = "2026-07-09T12:02:00.000Z";
    nextB.assignments[0].customValues = { winner: "second-request" };
    const results = await Promise.allSettled([
      repoA.updateProjectMaterialAssignments(
        ctxA,
        project.projectId,
        project.activePhaseId,
        0,
        nextA,
      ),
      repoB.updateProjectMaterialAssignments(
        ctxA,
        project.projectId,
        project.activePhaseId,
        0,
        nextB,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(
      ProjectMaterialRevisionConflictError,
    );
    const loaded = await repoA.loadProjectSave(
      ctxA,
      project.projectId,
      project.activePhaseId,
    );
    expect(loaded.appState.materialAssignments.revision).toBe(1);
    expect(loaded.phases[0].materialAssignments).toEqual(
      loaded.appState.materialAssignments,
    );
    expect(loaded.assets).toEqual(staleSave.assets);
    expect(loaded.catalogSnapshot.modules).toEqual(
      staleSave.catalogSnapshot.modules,
    );
    await expect(
      repoB.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        staleSave,
      ),
    ).rejects.toBeInstanceOf(ProjectMaterialRevisionConflictError);

    const sameRevisionForgery = structuredClone(loaded);
    sameRevisionForgery.appState.materialAssignments.assignments[0].customValues =
      { forged: "same-revision" };
    sameRevisionForgery.phases[0].materialAssignments = structuredClone(
      sameRevisionForgery.appState.materialAssignments,
    );
    await expect(
      repoB.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        sameRevisionForgery,
      ),
    ).rejects.toBeInstanceOf(ProjectMaterialRevisionConflictError);

    const higherRevisionForgery = structuredClone(loaded);
    higherRevisionForgery.appState.materialAssignments.revision = 2;
    higherRevisionForgery.appState.materialAssignments.assignments[0].customValues =
      { forged: "higher-revision" };
    higherRevisionForgery.phases[0].materialAssignments = structuredClone(
      higherRevisionForgery.appState.materialAssignments,
    );
    await expect(
      repoB.saveProjectSnapshot(
        ctxA,
        project.projectId,
        project.activePhaseId,
        higherRevisionForgery,
      ),
    ).rejects.toBeInstanceOf(ProjectMaterialRevisionConflictError);
  });

  it("restores an older material assignment revision through the explicit version restore path", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const initialAssignments = createMaterialAssignments(catalog);
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { marker: "version-one", windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      materialAssignments: initialAssignments,
      sceneState: {},
      editingSessionId: "materials-version-one",
    });

    const newerAssignments = structuredClone(initialAssignments);
    newerAssignments.revision = initialAssignments.revision + 1;
    newerAssignments.updatedAt = "2026-07-10T08:10:00.000Z";
    newerAssignments.assignments[0].customValues = { version: "newer" };
    newerAssignments.assignments[0].updatedAt = "2026-07-10T08:10:00.000Z";
    await repo.updateProjectMaterialAssignments(
      ctxA,
      project.projectId,
      project.activePhaseId,
      initialAssignments.revision,
      newerAssignments,
    );
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { marker: "version-two", windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      materialAssignments: newerAssignments,
      sceneState: {},
      editingSessionId: "materials-version-two",
    });

    const restored = await service.restoreProjectVersion(
      ctxA,
      project.projectId,
      1,
    );
    expect(restored.appState.materialAssignments).toEqual(initialAssignments);
    expect(restored.phases[0].materialAssignments).toEqual(initialAssignments);
    expect((restored.appState.layout as { marker: string }).marker).toBe(
      "version-one",
    );
    const loaded = await service.loadProject(ctxA, project.projectId);
    expect(loaded.appState.materialAssignments.revision).toBe(
      initialAssignments.revision,
    );
  });

  it("encrypts project download without leaking plaintext and rejects tampering", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const save = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
    });
    const envelope = encryptProjectSaveFile(save, {
      secret: "test-project-file-secret",
    });
    expect(envelope.magic).toBe(PROJECT_FILE_MAGIC);
    expectEncryptedEnvelopeMetadataToExclude(envelope, [
      "Secret Kitchen",
      "Jane Client",
      "drawer_low",
      "mat.board.body.dtd.grey.18",
      "1234",
    ]);
    expect(
      decryptProjectSaveFile(envelope, { secret: "test-project-file-secret" })
        .project.name,
    ).toBe("Secret Kitchen");
    await expect(() =>
      decryptProjectSaveFile(envelope, { secret: "wrong-project-file-secret" }),
    ).toThrow();
    const tamperedAuthTag = `${envelope.authTag[0] === "A" ? "B" : "A"}${envelope.authTag.slice(1)}`;
    await expect(() =>
      decryptProjectSaveFile(
        { ...envelope, authTag: tamperedAuthTag },
        { secret: "test-project-file-secret" },
      ),
    ).toThrow();
    await expect(() =>
      decryptProjectSaveFile(
        { ...envelope, magic: "KITCHEN_APP_ENCRYPTED_PROJECT" },
        { secret: "test-project-file-secret" },
      ),
    ).toThrow();
  });

  it("uses the FurnQuote project file extension and safe filenames", () => {
    expect(PROJECT_FILE_EXTENSION).toBe(".fqp");
    expect(toSafeProjectFileName("../Secret Kitchen")).toBe(
      "Secret_Kitchen.fqp",
    );
    expect(toSafeProjectFileName("")).toBe("project.fqp");
  });

  it("bundles project uploads into the encrypted export payload and restores them on import", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [
        { id: "m-secret", type: "drawer_low", params: { width: 1234 } },
      ],
      sceneState: {},
    });
    const uploadPath = path.join(
      root,
      "storage",
      "clients",
      ctxA.clientId,
      "projects",
      project.projectId,
      "phases",
      project.activePhaseId,
      "uploads",
      "underlay-secret.png",
    );
    await mkdir(path.dirname(uploadPath), { recursive: true });
    await writeFile(
      uploadPath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    );

    const envelopeText = await service.exportEncryptedProjectFile(
      ctxA,
      project.projectId,
      { secret: "test-project-file-secret" },
    );
    expect(envelopeText).toContain(PROJECT_FILE_MAGIC);
    const envelope = JSON.parse(envelopeText) as EncryptedProjectFileEnvelope;
    expectEncryptedEnvelopeMetadataToExclude(envelope, [
      "underlay-secret.png",
      "Secret Kitchen",
      "1234",
    ]);
    const payload = decryptProjectExportPayload(envelope, {
      secret: "test-project-file-secret",
    });
    expect(payload.payloadType).toBe("furnquote-project-export");
    expect(payload.bundledAssets).toHaveLength(1);
    expect(payload.bundledAssets[0]).toMatchObject({
      fileName: "underlay-secret.png",
      mimeType: "image/png",
      encoding: "base64",
    });

    const importRoot = await mkdtemp(
      path.join(os.tmpdir(), "kitchen-project-import-"),
    );
    try {
      const importService = createProjectService(
        createFileProjectRepository(importRoot),
      );
      const imported = await importService.importEncryptedProjectFile(
        ctxA,
        envelopeText,
        { secret: "test-project-file-secret" },
      );
      expect(imported.assets.bundled[0].fileName).toBe("underlay-secret.png");
      await access(
        path.join(
          importRoot,
          "storage",
          "clients",
          ctxA.clientId,
          "projects",
          project.projectId,
          "phases",
          project.activePhaseId,
          "uploads",
          "underlay-secret.png",
        ),
      );
    } finally {
      await rm(importRoot, { recursive: true, force: true });
    }
  });

  it("imports an exported project as a full copy when the original already exists", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: {
        snapshot: {
          wallCounter: 2,
          walls: [
            {
              id: "w1",
              params: {
                thicknessMm: 120,
                heightMm: 2600,
                materialId: "mat.wall",
                aMm: { x: 0, z: 0 },
                bMm: { x: 2400, z: 0 },
              },
            },
          ],
          instanceCounter: 1,
          instances: [],
          pinnedWallIds: [],
          pinnedInstanceIds: [],
          underlayPinned: false,
          selected: {
            kind: null,
            wallId: null,
            wallIds: [],
            instId: null,
            instIds: [],
          },
        },
        windows: [],
        doors: [],
      },
      kitchenState: { groups: [] },
      moduleInstances: [],
      sceneState: { viewMode: "3d" },
      recentActivity: {
        entries: [
          {
            id: 1,
            label: "Wall added",
            createdAt: 1779650000000,
            snapshot: null,
            target: { kind: "wall", id: "w1" },
          },
        ],
        idCounter: 2,
      },
    });

    const envelopeText = await service.exportEncryptedProjectFile(
      ctxA,
      project.projectId,
      { secret: "test-project-file-secret" },
    );
    const importIdempotency = createProjectWriteIdempotencyForText({
      clientId: ctxA.clientId,
      scope: "project-import",
      key: "import-request-0001",
      requestText: envelopeText,
    });
    const imported = await service.importEncryptedProjectFile(
      ctxA,
      envelopeText,
      { secret: "test-project-file-secret" },
      importIdempotency,
    );
    expect(imported.projectId).not.toBe(project.projectId);
    expect(imported.project.importedFrom?.projectId).toBe(project.projectId);
    expect(
      (imported.appState.layout as { snapshot: { walls: unknown[] } }).snapshot
        .walls,
    ).toHaveLength(1);
    expect(imported.appState.recentActivity).toBeTruthy();

    const loadedCopy = await service.loadProject(ctxA, imported.projectId);
    expect(
      (loadedCopy.appState.layout as { snapshot: { walls: unknown[] } })
        .snapshot.walls,
    ).toHaveLength(1);
    const replay = await service.importEncryptedProjectFile(
      ctxA,
      envelopeText,
      { secret: "test-project-file-secret" },
      importIdempotency,
    );
    expect(replay).toEqual(imported);
    expect(await service.listProjects(ctxA)).toHaveLength(2);
    await expect(
      service.importEncryptedProjectFile(
        ctxA,
        envelopeText,
        { secret: "test-project-file-secret" },
        { ...importIdempotency, requestHash: "d".repeat(64) },
      ),
    ).rejects.toBeInstanceOf(ProjectIdempotencyConflictError);
  });

  it("bundles and restores uploads for every saved phase, not only the active phase", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await repo.createProject(ctxA, createInput);
    const phase2 = {
      phaseId: "phase_2",
      phaseName: "Phase 2",
      phaseNumber: 2,
      status: "draft" as const,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const projectWithPhase2 = {
      ...project,
      phases: ["phase_1", "phase_2"],
      phaseDetails: [...project.phaseDetails, phase2],
    };
    await repo.saveProjectMetadata(ctxA, projectWithPhase2);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const savePhase1 = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: "phase_1",
      project: projectWithPhase2,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [
        { id: "m-secret", type: "drawer_low", params: { width: 1234 } },
      ],
      sceneState: {},
    });
    const save = {
      ...savePhase1,
      project: projectWithPhase2,
      phases: [
        savePhase1.phases[0],
        {
          phaseId: "phase_2",
          phaseName: "Phase 2",
          phaseNumber: 2,
          status: "draft" as const,
          layoutState: { snapshot: {}, windows: [], doors: [] },
          kitchenState: {},
          moduleInstances: [],
          materialAssignments: createEmptyProjectMaterialAssignmentsState(),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      ],
    };
    await repo.saveProjectSnapshot(ctxA, project.projectId, "phase_1", save);
    const phase1Upload = path.join(
      root,
      "storage",
      "clients",
      ctxA.clientId,
      "projects",
      project.projectId,
      "phases",
      "phase_1",
      "uploads",
      "phase-one.png",
    );
    const phase2Upload = path.join(
      root,
      "storage",
      "clients",
      ctxA.clientId,
      "projects",
      project.projectId,
      "phases",
      "phase_2",
      "uploads",
      "phase-two.png",
    );
    await mkdir(path.dirname(phase1Upload), { recursive: true });
    await mkdir(path.dirname(phase2Upload), { recursive: true });
    await writeFile(phase1Upload, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]));
    await writeFile(phase2Upload, Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]));

    const envelopeText = await service.exportEncryptedProjectFile(
      ctxA,
      project.projectId,
      { secret: "test-project-file-secret" },
    );
    const envelope = JSON.parse(envelopeText) as EncryptedProjectFileEnvelope;
    expectEncryptedEnvelopeMetadataToExclude(envelope, [
      "phase-one.png",
      "phase-two.png",
      "1234",
    ]);
    const payload = decryptProjectExportPayload(envelope, {
      secret: "test-project-file-secret",
    });
    expect(
      payload.bundledAssets
        .map((asset) => `${asset.phaseId}/${asset.fileName}`)
        .sort(),
    ).toEqual(["phase_1/phase-one.png", "phase_2/phase-two.png"]);

    const importRoot = await mkdtemp(
      path.join(os.tmpdir(), "kitchen-project-import-multiphase-"),
    );
    try {
      const imported = await createProjectService(
        createFileProjectRepository(importRoot),
      ).importEncryptedProjectFile(ctxA, envelopeText, {
        secret: "test-project-file-secret",
      });
      expect(
        imported.assets.bundled
          .map((asset) => `${asset.phaseId}/${asset.fileName}`)
          .sort(),
      ).toEqual(["phase_1/phase-one.png", "phase_2/phase-two.png"]);
      await access(
        path.join(
          importRoot,
          "storage",
          "clients",
          ctxA.clientId,
          "projects",
          project.projectId,
          "phases",
          "phase_1",
          "uploads",
          "phase-one.png",
        ),
      );
      await access(
        path.join(
          importRoot,
          "storage",
          "clients",
          ctxA.clientId,
          "projects",
          project.projectId,
          "phases",
          "phase_2",
          "uploads",
          "phase-two.png",
        ),
      );
    } finally {
      await rm(importRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe or invalid bundled assets", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
      assets: {
        bundled: [
          {
            assetId: "bad",
            phaseId: project.activePhaseId,
            originalPath: "../bad.png",
            storageBucket: "uploads",
            fileName: "../bad.png",
            mimeType: "image/png",
            sizeBytes: 1,
            sha256: "0".repeat(64),
          },
        ],
        external: [],
        missing: [],
        generated: [],
      },
    });
    await expect(
      service.exportEncryptedProjectFile(ctxA, project.projectId, {
        secret: "test-project-file-secret",
      }),
    ).rejects.toThrow(/unsafe|unsupported|missing/i);
  });

  it("fails when a critical manifest upload is missing in an inactive phase", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await repo.createProject(ctxA, createInput);
    const phase2 = {
      phaseId: "phase_2",
      phaseName: "Phase 2",
      phaseNumber: 2,
      status: "draft" as const,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const projectWithPhase2 = {
      ...project,
      phases: ["phase_1", "phase_2"],
      phaseDetails: [...project.phaseDetails, phase2],
    };
    await repo.saveProjectMetadata(ctxA, projectWithPhase2);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const baseSave = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: "phase_1",
      project: projectWithPhase2,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
    });
    await repo.saveProjectSnapshot(ctxA, project.projectId, "phase_1", {
      ...baseSave,
      project: projectWithPhase2,
      phases: [
        baseSave.phases[0],
        {
          phaseId: "phase_2",
          phaseName: "Phase 2",
          phaseNumber: 2,
          status: "draft",
          layoutState: { snapshot: {}, windows: [], doors: [] },
          kitchenState: {},
          moduleInstances: [],
          materialAssignments: createEmptyProjectMaterialAssignmentsState(),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      ],
      assets: {
        bundled: [
          {
            assetId: "upload:phase_2:missing.png",
            phaseId: "phase_2",
            originalPath:
              "/storage/clients/client_a/projects/project/phases/phase_2/uploads/missing.png",
            storageBucket: "uploads",
            fileName: "missing.png",
            mimeType: "image/png",
            sizeBytes: 1,
            sha256: "0".repeat(64),
          },
        ],
        external: [],
        missing: [],
        generated: [],
      },
    });
    await expect(
      service.exportEncryptedProjectFile(ctxA, project.projectId, {
        secret: "test-project-file-secret",
      }),
    ).rejects.toThrow(/phase_2\/missing\.png/);
  });

  it("enforces bundled asset size and MIME limits", async () => {
    const repo = createFileProjectRepository(root);
    const service = createProjectService(repo);
    const project = await service.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    await service.saveCurrentProject(ctxA, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
    });
    const uploadsDir = path.join(
      root,
      "storage",
      "clients",
      ctxA.clientId,
      "projects",
      project.projectId,
      "phases",
      project.activePhaseId,
      "uploads",
    );
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(
      path.join(uploadsDir, "not-allowed.txt"),
      "plain text",
      "utf-8",
    );
    await expect(
      service.exportEncryptedProjectFile(ctxA, project.projectId, {
        secret: "test-project-file-secret",
      }),
    ).rejects.toThrow(/MIME type/i);

    await rm(path.join(uploadsDir, "not-allowed.txt"), { force: true });
    await writeFile(
      path.join(uploadsDir, "large.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    );
    const previous = process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB;
    process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB = "0.000001";
    try {
      await expect(
        service.exportEncryptedProjectFile(ctxA, project.projectId, {
          secret: "test-project-file-secret",
        }),
      ).rejects.toThrow(/single asset size limit/i);
    } finally {
      if (previous === undefined)
        delete process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB;
      else process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB = previous;
    }
  });

  it("rejects unsupported future save versions", async () => {
    expect(() =>
      migrateProjectSaveFile({ saveFormatVersion: 999 } as ProjectSaveFile),
    ).toThrow(/newer/);
  });

  it("migrates version 1 saves before repository validation", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const current = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      sceneState: {},
    });
    const legacy = JSON.parse(JSON.stringify(current)) as Record<
      string,
      unknown
    >;
    legacy.saveFormatVersion = 1;
    delete (legacy.appState as Record<string, unknown>).materialAssignments;
    for (const phase of legacy.phases as Array<Record<string, unknown>>)
      delete phase.materialAssignments;

    const migrated = loadProjectSaveFile(legacy, {
      clientId: ctxA.clientId,
      projectId: project.projectId,
    });
    expect(migrated.saveFormatVersion).toBe(2);
    expect(migrated.appState.materialAssignments).toEqual(
      createEmptyProjectMaterialAssignmentsState(),
    );
    expect(migrated.phases[0].materialAssignments).toEqual(
      createEmptyProjectMaterialAssignmentsState(),
    );

    const savePath = path.join(
      root,
      "storage",
      "clients",
      ctxA.clientId,
      "projects",
      project.projectId,
      "phases",
      project.activePhaseId,
      "saves",
      "save.json",
    );
    await mkdir(path.dirname(savePath), { recursive: true });
    await writeFile(savePath, JSON.stringify(legacy), "utf-8");
    const loaded = await repo.loadProjectSave(
      ctxA,
      project.projectId,
      project.activePhaseId,
    );
    expect(loaded.saveFormatVersion).toBe(2);
    expect(loaded.appState.materialAssignments.initialized).toBe(false);

    const legacyEnvelope = encryptLegacyProjectSave(
      legacy,
      "test-project-file-secret",
    );
    const decrypted = decryptProjectSaveFile(legacyEnvelope, {
      secret: "test-project-file-secret",
    });
    expect(decrypted.saveFormatVersion).toBe(2);
    expect(decrypted.appState.materialAssignments).toEqual(
      createEmptyProjectMaterialAssignmentsState(),
    );
  });

  it("rejects invalid project material assignment state", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const assignments = createMaterialAssignments(catalog);
    assignments.assignments.push({ ...assignments.assignments[0] });
    expect(() =>
      assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: { snapshot: {}, windows: [], doors: [] },
        kitchenState: {},
        moduleInstances: [],
        materialAssignments: assignments,
        sceneState: {},
      }),
    ).toThrow(/duplicate assignmentId/i);

    const snapshotMismatch = createMaterialAssignments(catalog);
    snapshotMismatch.assignments[0].snapshots.material!.definition = {
      ...snapshotMismatch.assignments[0].snapshots.material!.definition,
      id: "different-material",
    };
    expect(() =>
      assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: { snapshot: {}, windows: [], doors: [] },
        kitchenState: {},
        moduleInstances: [],
        materialAssignments: snapshotMismatch,
        sceneState: {},
      }),
    ).toThrow(/definition\.id must match/i);

    const valid = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState: { snapshot: {}, windows: [], doors: [] },
      kitchenState: {},
      moduleInstances: [],
      materialAssignments: createMaterialAssignments(catalog),
      sceneState: {},
    });
    const phaseMismatch = structuredClone(valid);
    phaseMismatch.phases[0].materialAssignments.revision += 1;
    expect(() =>
      loadProjectSaveFile(phaseMismatch, {
        clientId: ctxA.clientId,
        projectId: project.projectId,
      }),
    ).toThrow(/active phase materialAssignments must match appState/i);
  });

  it("has no missing critical project save serializers", () => {
    const missing = PROJECT_SAVE_SERIALIZERS.filter(
      (item) =>
        item.critical &&
        (item.status === "missing_serializer" ||
          item.status === "serialized_but_not_restored"),
    );
    expect(missing).toEqual([]);
    expect(auditProjectSaveSerializers().covered).toContain("windows");
    expect(auditProjectSaveSerializers().covered).toContain("doors");
    expect(auditProjectSaveSerializers().covered).toContain(
      "projectMaterialAssignments",
    );
  });

  it("preserves windows and doors through save-load-save canonical roundtrip", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const layoutState = {
      snapshot: {
        wallCounter: 2,
        walls: [
          {
            id: "wall1",
            params: {
              thicknessMm: 120,
              heightMm: 2600,
              materialId: "mat.wall",
              aMm: { x: 0, z: 0 },
              bMm: { x: 3600, z: 0 },
            },
          },
        ],
        instanceCounter: 1,
        instances: [],
        pinnedWallIds: [],
        pinnedInstanceIds: [],
        underlayPinned: false,
        selected: {
          kind: null,
          wallId: null,
          wallIds: [],
          instId: null,
          instIds: [],
        },
      },
      windows: [
        {
          id: "win7",
          params: {
            wall: "back",
            wallId: "wall1",
            widthMm: 900,
            heightMm: 1000,
            sillHeightMm: 850,
            centerMm: 1200,
            frameWidthMm: 70,
            offsetFromInteriorMm: 20,
            sashWidthMm: 48,
            sashProfileDepthMm: 56,
            frameProfileDepthMm: 72,
            swingDirection: "right",
            swingSide: "outward",
            swingAngleDeg: 75,
            handleType: "lever",
            handleOffsetMm: 70,
            handleHeightMm: 450,
            materialId: "white",
          },
        },
      ],
      doors: [
        {
          id: "door3",
          params: {
            wall: "back",
            wallId: "wall1",
            widthMm: 880,
            heightMm: 2100,
            centerMm: 2400,
            frameWidthMm: 70,
            offsetFromInteriorMm: 20,
            panelThicknessMm: 42,
            swingDirection: "right",
            swingSide: "outward",
            swingAngleDeg: 92,
            handleType: "bar",
            handleOffsetMm: 85,
            handleHeightMm: 1050,
            materialId: "white",
          },
        },
      ],
    };
    const saveA = assembleProjectSaveFile({
      clientId: ctxA.clientId,
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      layoutState,
      kitchenState: { groups: [] },
      moduleInstances: [],
      sceneState: {},
    });
    const loaded = JSON.parse(JSON.stringify(saveA)) as ProjectSaveFile;
    const saveB = assembleProjectSaveFile({
      clientId: loaded.clientId,
      projectId: loaded.projectId,
      activePhaseId: loaded.activePhaseId,
      project: loaded.project,
      catalog,
      layoutState: loaded.appState.layout,
      kitchenState: loaded.appState.kitchen,
      moduleInstances: loaded.appState.modules,
      sceneState: loaded.appState.scene,
    });
    expect((saveB.appState.layout as typeof layoutState).windows).toEqual(
      layoutState.windows,
    );
    expect((saveB.appState.layout as typeof layoutState).doors).toEqual(
      layoutState.doors,
    );
  });

  it("rejects saved openings that point at a missing wall", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    expect(() =>
      assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: {
          snapshot: {
            wallCounter: 1,
            walls: [],
            instanceCounter: 1,
            instances: [],
            pinnedWallIds: [],
            pinnedInstanceIds: [],
            underlayPinned: false,
            selected: {
              kind: null,
              wallId: null,
              wallIds: [],
              instId: null,
              instIds: [],
            },
          },
          windows: [
            {
              id: "win7",
              params: {
                wall: "back",
                wallId: "wall1",
                widthMm: 900,
                heightMm: 1000,
                sillHeightMm: 850,
                centerMm: 1200,
                frameWidthMm: 70,
                offsetFromInteriorMm: 20,
                sashWidthMm: 48,
                sashProfileDepthMm: 56,
                frameProfileDepthMm: 72,
                swingDirection: "right",
                swingSide: "outward",
                swingAngleDeg: 75,
                handleType: "lever",
                handleOffsetMm: 70,
                handleHeightMm: 450,
                materialId: "white",
              },
            },
          ],
          doors: [],
        },
        kitchenState: { groups: [] },
        moduleInstances: [],
        sceneState: {},
      }),
    ).toThrow(/missing wall wall1/i);
  });
});
