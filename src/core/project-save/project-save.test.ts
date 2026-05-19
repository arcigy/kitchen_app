import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSystemSeedCatalog } from "../catalog/catalog-repository";
import type { ClientContext } from "../client/client-context";
import { createFileProjectRepository } from "../project/project-repository";
import { createProjectService } from "../project/project-service";
import { assembleProjectSaveFile } from "./project-save-assembler";
import { decryptProjectExportPayload, decryptProjectSaveFile, encryptProjectSaveFile } from "./project-save-crypto";
import { PROJECT_FILE_EXTENSION, PROJECT_FILE_MAGIC, toSafeProjectFileName } from "./project-save-file";
import { migrateProjectSaveFile } from "./project-save-migrations";
import { auditProjectSaveSerializers, PROJECT_SAVE_SERIALIZERS } from "./project-save-serializers";
import type { ProjectSaveFile } from "./project-save-types";

const ctxA: ClientContext = { userId: "user_a", clientId: "client_a", role: "owner" };
const ctxB: ClientContext = { userId: "user_b", clientId: "client_b", role: "owner" };

const createInput = {
  name: "Secret Kitchen",
  location: { address: "Main 1", city: "Bratislava" },
  contact: { name: "Jane Client", email: "jane@example.com" }
};

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
    const metaPath = path.join(root, "storage", "clients", "client_a", "projects", project.projectId, "project.meta.json");
    const stored = JSON.parse(await readFile(metaPath, "utf-8")) as { contact: { name: string }; phases: string[] };
    expect(stored.contact.name).toBe("Jane Client");
    expect(stored.phases).toEqual(["phase_1"]);
  });

  it("keeps client projects isolated", async () => {
    const repo = createFileProjectRepository(root);
    const projectA = await repo.createProject(ctxA, createInput);
    await expect(repo.getProject(ctxB, projectA.projectId)).rejects.toThrow(/metadata is missing|different client|does not belong/i);
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
      kitchenState: { context: { worktopMaterialId: catalog.kitchenDefaults.worktopMaterialId } },
      moduleInstances: [{ id: "m1", type: "drawer_low", params: { materialId: catalog.kitchenDefaults.carcassMaterialId } }],
      sceneState: { mode: "layout" },
      quoteSettings: { margin: 12 }
    });
    expect(save.saveFormatVersion).toBe(1);
    expect(save.project.contact.name).toBe("Jane Client");
    expect(save.phases[0].moduleInstances).toHaveLength(1);
    expect(save.catalogSnapshot.fullCatalog?.clientId).toBe("client_a");
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
      layoutState: { snapshot: { wallCounter: 1, walls: [], instanceCounter: 1, instances: [], pinnedWallIds: [], pinnedInstanceIds: [], underlayPinned: false, selected: { kind: null, wallId: null, wallIds: [], instId: null, instIds: [] } }, windows: [], doors: [] },
      kitchenState: { groups: [] },
      moduleInstances: [{ id: "m-secret", type: "drawer_low", params: { materialId: "mat.board.body.dtd.grey.18", width: 1234 } }],
      sceneState: { viewMode: "3d" }
    });
    const loaded = await service.loadProject(ctxA, project.projectId);
    expect(loaded.projectId).toBe(save.projectId);
    expect(loaded.catalogSnapshot.fullCatalog?.clientId).toBe("client_a");
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
      sceneState: {}
    });
    const envelope = encryptProjectSaveFile(save, { secret: "test-project-file-secret" });
    const raw = JSON.stringify(envelope);
    expect(envelope.magic).toBe(PROJECT_FILE_MAGIC);
    expect(raw).not.toContain("Secret Kitchen");
    expect(raw).not.toContain("Jane Client");
    expect(raw).not.toContain("drawer_low");
    expect(raw).not.toContain("mat.board.body.dtd.grey.18");
    expect(raw).not.toContain("1234");
    expect(decryptProjectSaveFile(envelope, { secret: "test-project-file-secret" }).project.name).toBe("Secret Kitchen");
    await expect(() => decryptProjectSaveFile(envelope, { secret: "wrong-project-file-secret" })).toThrow();
    await expect(() => decryptProjectSaveFile({ ...envelope, authTag: `A${envelope.authTag.slice(1)}` }, { secret: "test-project-file-secret" })).toThrow();
    await expect(() => decryptProjectSaveFile({ ...envelope, magic: "KITCHEN_APP_ENCRYPTED_PROJECT" }, { secret: "test-project-file-secret" })).toThrow();
  });

  it("uses the FurnQuote project file extension and safe filenames", () => {
    expect(PROJECT_FILE_EXTENSION).toBe(".fqp");
    expect(toSafeProjectFileName("../Secret Kitchen")).toBe("Secret_Kitchen.fqp");
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
      moduleInstances: [{ id: "m-secret", type: "drawer_low", params: { width: 1234 } }],
      sceneState: {}
    });
    const uploadPath = path.join(root, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", project.activePhaseId, "uploads", "underlay-secret.png");
    await mkdir(path.dirname(uploadPath), { recursive: true });
    await writeFile(uploadPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));

    const envelopeText = await service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" });
    expect(envelopeText).toContain(PROJECT_FILE_MAGIC);
    expect(envelopeText).not.toContain("underlay-secret.png");
    expect(envelopeText).not.toContain("Secret Kitchen");
    expect(envelopeText).not.toContain("1234");
    const payload = decryptProjectExportPayload(JSON.parse(envelopeText) as unknown, { secret: "test-project-file-secret" });
    expect(payload.payloadType).toBe("furnquote-project-export");
    expect(payload.bundledAssets).toHaveLength(1);
    expect(payload.bundledAssets[0]).toMatchObject({ fileName: "underlay-secret.png", mimeType: "image/png", encoding: "base64" });

    const importRoot = await mkdtemp(path.join(os.tmpdir(), "kitchen-project-import-"));
    try {
      const importService = createProjectService(createFileProjectRepository(importRoot));
      const imported = await importService.importEncryptedProjectFile(ctxA, envelopeText, { secret: "test-project-file-secret" });
      expect(imported.assets.bundled[0].fileName).toBe("underlay-secret.png");
      await access(path.join(importRoot, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", project.activePhaseId, "uploads", "underlay-secret.png"));
    } finally {
      await rm(importRoot, { recursive: true, force: true });
    }
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
      updatedAt: project.updatedAt
    };
    const projectWithPhase2 = {
      ...project,
      phases: ["phase_1", "phase_2"],
      phaseDetails: [...project.phaseDetails, phase2]
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
      moduleInstances: [{ id: "m-secret", type: "drawer_low", params: { width: 1234 } }],
      sceneState: {}
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
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      ]
    };
    await repo.saveProjectSnapshot(ctxA, project.projectId, "phase_1", save);
    const phase1Upload = path.join(root, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", "phase_1", "uploads", "phase-one.png");
    const phase2Upload = path.join(root, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", "phase_2", "uploads", "phase-two.png");
    await mkdir(path.dirname(phase1Upload), { recursive: true });
    await mkdir(path.dirname(phase2Upload), { recursive: true });
    await writeFile(phase1Upload, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]));
    await writeFile(phase2Upload, Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]));

    const envelopeText = await service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" });
    expect(envelopeText).not.toContain("phase-one.png");
    expect(envelopeText).not.toContain("phase-two.png");
    expect(envelopeText).not.toContain("1234");
    const payload = decryptProjectExportPayload(JSON.parse(envelopeText) as unknown, { secret: "test-project-file-secret" });
    expect(payload.bundledAssets.map((asset) => `${asset.phaseId}/${asset.fileName}`).sort()).toEqual([
      "phase_1/phase-one.png",
      "phase_2/phase-two.png"
    ]);

    const importRoot = await mkdtemp(path.join(os.tmpdir(), "kitchen-project-import-multiphase-"));
    try {
      const imported = await createProjectService(createFileProjectRepository(importRoot)).importEncryptedProjectFile(ctxA, envelopeText, { secret: "test-project-file-secret" });
      expect(imported.assets.bundled.map((asset) => `${asset.phaseId}/${asset.fileName}`).sort()).toEqual([
        "phase_1/phase-one.png",
        "phase_2/phase-two.png"
      ]);
      await access(path.join(importRoot, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", "phase_1", "uploads", "phase-one.png"));
      await access(path.join(importRoot, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", "phase_2", "uploads", "phase-two.png"));
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
        bundled: [{ assetId: "bad", phaseId: project.activePhaseId, originalPath: "../bad.png", storageBucket: "uploads", fileName: "../bad.png", mimeType: "image/png", sizeBytes: 1, sha256: "0".repeat(64) }],
        external: [],
        missing: [],
        generated: []
      }
    });
    await expect(service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" })).rejects.toThrow(/unsafe|unsupported|missing/i);
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
      updatedAt: project.updatedAt
    };
    const projectWithPhase2 = {
      ...project,
      phases: ["phase_1", "phase_2"],
      phaseDetails: [...project.phaseDetails, phase2]
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
      sceneState: {}
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
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      ],
      assets: {
        bundled: [{
          assetId: "upload:phase_2:missing.png",
          phaseId: "phase_2",
          originalPath: "/storage/clients/client_a/projects/project/phases/phase_2/uploads/missing.png",
          storageBucket: "uploads",
          fileName: "missing.png",
          mimeType: "image/png",
          sizeBytes: 1,
          sha256: "0".repeat(64)
        }],
        external: [],
        missing: [],
        generated: []
      }
    });
    await expect(service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" })).rejects.toThrow(/phase_2\/missing\.png/);
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
      sceneState: {}
    });
    const uploadsDir = path.join(root, "storage", "clients", ctxA.clientId, "projects", project.projectId, "phases", project.activePhaseId, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, "not-allowed.txt"), "plain text", "utf-8");
    await expect(service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" })).rejects.toThrow(/MIME type/i);

    await rm(path.join(uploadsDir, "not-allowed.txt"), { force: true });
    await writeFile(path.join(uploadsDir, "large.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
    const previous = process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB;
    process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB = "0.000001";
    try {
      await expect(service.exportEncryptedProjectFile(ctxA, project.projectId, { secret: "test-project-file-secret" })).rejects.toThrow(/single asset size limit/i);
    } finally {
      if (previous === undefined) delete process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB;
      else process.env.PROJECT_FILE_MAX_SINGLE_ASSET_MB = previous;
    }
  });

  it("rejects unsupported future save versions", async () => {
    expect(() => migrateProjectSaveFile({ saveFormatVersion: 999 } as ProjectSaveFile)).toThrow(/newer/);
  });

  it("has no missing critical project save serializers", () => {
    const missing = PROJECT_SAVE_SERIALIZERS.filter(
      (item) => item.critical && (item.status === "missing_serializer" || item.status === "serialized_but_not_restored")
    );
    expect(missing).toEqual([]);
    expect(auditProjectSaveSerializers().covered).toContain("windows");
    expect(auditProjectSaveSerializers().covered).toContain("doors");
  });

  it("preserves windows and doors through save-load-save canonical roundtrip", async () => {
    const repo = createFileProjectRepository(root);
    const project = await repo.createProject(ctxA, createInput);
    const catalog = { ...getSystemSeedCatalog(), clientId: ctxA.clientId };
    const layoutState = {
      snapshot: { wallCounter: 1, walls: [], instanceCounter: 1, instances: [], pinnedWallIds: [], pinnedInstanceIds: [], underlayPinned: false, selected: { kind: null, wallId: null, wallIds: [], instId: null, instIds: [] } },
      windows: [{ id: "win7", params: { wall: "back", wallId: "wall1", widthMm: 900, heightMm: 1000, sillHeightMm: 850, centerMm: 1200, frameWidthMm: 70, offsetFromInteriorMm: 20, sashWidthMm: 48, sashProfileDepthMm: 56, frameProfileDepthMm: 72, materialId: "white" } }],
      doors: [{ id: "door3", params: { wall: "back", wallId: "wall1", widthMm: 880, heightMm: 2100, centerMm: 2400, frameWidthMm: 70, offsetFromInteriorMm: 20, panelThicknessMm: 42, swingDirection: "right", swingSide: "outward", swingAngleDeg: 92, materialId: "white" } }]
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
      sceneState: {}
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
      sceneState: loaded.appState.scene
    });
    expect((saveB.appState.layout as typeof layoutState).windows).toEqual(layoutState.windows);
    expect((saveB.appState.layout as typeof layoutState).doors).toEqual(layoutState.doors);
  });
});
