import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { GroupInstanceSnapshot, GroupWorktopSnapshot, KitchenActiveEditSaveState } from "../../layout/kitchenEditMode";
import type { ModuleParams } from "../../model/cabinetTypes";
import type { KitchenWorktopParams } from "../../layout/appState";
import type { KitchenContext } from "../../layout/kitchenContext";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const clone = <T>(value: T): T => structuredClone(value);

const currentGroupSnapshots = (snapshot: JsonRecord, groupId: string) => {
  const instances = Array.isArray(snapshot.instances) ? snapshot.instances : [];
  const worktops = Array.isArray(snapshot.worktops) ? snapshot.worktops : [];
  return {
    instanceSnapshots: instances
      .filter((item): item is JsonRecord => isRecord(item) && item.kitchenGroupId === groupId)
      .map((item) => ({
        id: String(item.id),
        params: clone(item.params) as ModuleParams,
        position: {
          x: Number((item.positionMm as JsonRecord | undefined)?.x ?? 0) / 1000,
          y: Number((item.positionMm as JsonRecord | undefined)?.y ?? 0) / 1000,
          z: Number((item.positionMm as JsonRecord | undefined)?.z ?? 0) / 1000
        },
        rotationY: Number(item.rotationYDeg ?? 0) * Math.PI / 180
      })),
    worktopSnapshots: worktops
      .filter((item): item is JsonRecord => isRecord(item) && item.kitchenGroupId === groupId)
      .map((item) => ({ id: String(item.id), params: clone(item.params) as KitchenWorktopParams }))
  };
};

const isActiveEdit = (value: unknown): value is KitchenActiveEditSaveState => {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.groupId === "string"
    && (value.origin === "new" || value.origin === "existing")
    && typeof value.activeName === "string"
    && typeof value.snapshotName === "string"
    && (value.editingExistingGroupId === null || typeof value.editingExistingGroupId === "string")
    && (value.moduleEditLayer === "base" || value.moduleEditLayer === "upper")
    && isRecord(value.kitchenCtxSnapshot)
    && Array.isArray(value.instanceSnapshots)
    && Array.isArray(value.worktopSnapshots);
};

export type PreparedKitchenProjectState = {
  appState: ProjectSaveFile["appState"];
  notice: string | null;
};

export function normalizeKitchenProjectAppState(input: ProjectSaveFile["appState"]): PreparedKitchenProjectState {
  const appState = clone(input) as unknown as JsonRecord;
  const kitchen = isRecord(appState.kitchen) ? appState.kitchen : {};
  const layout = isRecord(appState.layout) ? appState.layout : {};
  const snapshot = isRecord(layout.snapshot) ? layout.snapshot : {};
  const groups = Array.isArray(kitchen.groups) ? kitchen.groups.filter(isRecord) : [];
  const groupIds = new Set(groups.map((group) => typeof group.id === "string" ? group.id : "").filter(Boolean));
  const orphanIds = new Set<string>();
  for (const collection of [snapshot.instances, snapshot.worktops]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!isRecord(item) || typeof item.kitchenGroupId !== "string" || !item.kitchenGroupId) continue;
      if (!groupIds.has(item.kitchenGroupId)) orphanIds.add(item.kitchenGroupId);
    }
  }

  let activeEdit = isActiveEdit(kitchen.activeEdit) ? clone(kitchen.activeEdit) : null;
  const activeKitchenGroupId = typeof kitchen.activeKitchenGroupId === "string" ? kitchen.activeKitchenGroupId : null;
  if (activeEdit?.origin === "existing" && activeEdit.editingExistingGroupId && !groupIds.has(activeEdit.editingExistingGroupId)) {
    orphanIds.add(activeEdit.editingExistingGroupId);
  }

  let recoveredCount = 0;
  const context = isRecord(kitchen.context) ? clone(kitchen.context) : {};
  const addRecoveredGroup = (groupId: string) => {
    if (groupIds.has(groupId)) return;
    const name = `Obnovená kuchyňa ${++recoveredCount}`;
    const snapshots = currentGroupSnapshots(snapshot, groupId);
    groups.push({ id: groupId, name, ctx: clone(context), instanceIds: snapshots.instanceSnapshots.map((item) => item.id) });
    groupIds.add(groupId);
    if (!activeEdit && activeKitchenGroupId === groupId) {
      activeEdit = {
        version: 1,
        groupId,
        origin: "existing",
        activeName: name,
        snapshotName: name,
        editingExistingGroupId: groupId,
        moduleEditLayer: "base",
        activeTallEditorInstanceId: null,
        activeTallEditorSnapshot: null,
        selectedWorktopSegment: null,
        kitchenCtxSnapshot: clone(context) as unknown as KitchenContext,
        instanceSnapshots: clone(snapshots.instanceSnapshots) as GroupInstanceSnapshot[],
        worktopSnapshots: clone(snapshots.worktopSnapshots) as GroupWorktopSnapshot[]
      };
    }
  };

  for (const orphanId of orphanIds) {
    if (activeEdit?.origin === "new" && activeEdit.groupId === orphanId) continue;
    addRecoveredGroup(orphanId);
  }
  if (activeEdit?.origin === "existing" && activeEdit.editingExistingGroupId) addRecoveredGroup(activeEdit.editingExistingGroupId);
  if (!activeEdit && activeKitchenGroupId && groupIds.has(activeKitchenGroupId)) {
    const group = groups.find((item) => item.id === activeKitchenGroupId);
    const snapshots = currentGroupSnapshots(snapshot, activeKitchenGroupId);
    if (group) {
      activeEdit = {
        version: 1,
        groupId: activeKitchenGroupId,
        origin: "existing",
        activeName: typeof group.name === "string" ? group.name : "Kuchyňa",
        snapshotName: typeof group.name === "string" ? group.name : "Kuchyňa",
        editingExistingGroupId: activeKitchenGroupId,
        moduleEditLayer: "base",
        activeTallEditorInstanceId: null,
        activeTallEditorSnapshot: null,
        selectedWorktopSegment: null,
        kitchenCtxSnapshot: clone(group.ctx) as unknown as KitchenContext,
        instanceSnapshots: clone(snapshots.instanceSnapshots) as GroupInstanceSnapshot[],
        worktopSnapshots: clone(snapshots.worktopSnapshots) as GroupWorktopSnapshot[]
      };
    }
  }

  kitchen.groups = groups;
  kitchen.activeEdit = activeEdit;
  kitchen.activeKitchenGroupId = activeEdit?.groupId ?? null;
  appState.kitchen = kitchen;

  const selections = isRecord(appState.selections) ? appState.selections : {};
  if (typeof selections.selectedKitchenGroupId === "string" && !groupIds.has(selections.selectedKitchenGroupId)) {
    selections.selectedKitchenGroupId = null;
  }
  appState.selections = selections;

  return {
    appState: appState as unknown as ProjectSaveFile["appState"],
    notice: recoveredCount > 0 ? `Rozpracovaná kuchyňa bola obnovená (${recoveredCount}).` : null
  };
}
