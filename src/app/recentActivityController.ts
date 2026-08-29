import type { AppState, LayoutSnapshot } from "../layout/appState";
import {
  captureLayoutSnapshot,
  restoreLayoutSnapshot,
  updateUndoRedoUi,
  type HistoryHelpers
} from "../layout/historyManager";
import { getModuleDescriptors } from "../modules/registry";
import { createButtonElement } from "./propsPanelElements";

export type RecentActivityTarget = {
  kind: "wall" | "module" | "floor" | "column" | "section" | null;
  id: string | null;
};

type ActivityEntry = {
  id: number;
  label: string;
  createdAt: number;
  snapshot: LayoutSnapshot | null;
  target: RecentActivityTarget;
};

export type RecentActivitySaveState = {
  entries: ActivityEntry[];
  idCounter: number;
};

type RecentActivityControllerContext = {
  S: AppState;
  getHelpers: () => HistoryHelpers;
  selectTarget: (target: RecentActivityTarget) => void;
  onRestore: () => void;
};

const createRow = (label: string, value: string) => {
  const row = document.createElement("p");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("b");
  labelEl.textContent = label;
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
};

const displayId = (id: string) => id.replace(/^dbg_/, "").replace(/^([a-z])/, (letter) => letter.toUpperCase());

const labelFor = (kind: string, id: string) => `${kind} ${displayId(id)}`;

const moduleLabel = (snapshot: LayoutSnapshot, id: string) => {
  const inst = snapshot.instances.find((item) => item.id === id);
  const descriptor = inst ? getModuleDescriptors().find((item) => item.type === inst.params.type) : null;
  return descriptor?.label ?? inst?.params.type ?? "Module";
};

type ActivityDiff = {
  id: string;
  label: string;
  plural: string;
  targetKind: RecentActivityTarget["kind"];
};

const stableStringify = (value: unknown) => JSON.stringify(value);

const byId = <T extends { id: string }>(items: T[] | undefined) => new Map((items ?? []).map((item) => [item.id, item]));

const addedItems = <T extends { id: string }>(
  prev: T[] | undefined,
  next: T[] | undefined,
  describe: (item: T) => ActivityDiff
) => {
  const previous = byId(prev);
  return (next ?? []).filter((item) => !previous.has(item.id)).map(describe);
};

const removedItems = <T extends { id: string }>(
  prev: T[] | undefined,
  next: T[] | undefined,
  describe: (item: T) => ActivityDiff
) => {
  const current = byId(next);
  return (prev ?? []).filter((item) => !current.has(item.id)).map(describe);
};

const changedItems = <T extends { id: string }>(
  prev: T[] | undefined,
  next: T[] | undefined,
  signature: (item: T) => string,
  describe: (item: T) => ActivityDiff
) => {
  const previous = byId(prev);
  return (next ?? [])
    .filter((item) => {
      const old = previous.get(item.id);
      return old ? signature(old) !== signature(item) : false;
    })
    .map(describe);
};

const summarizeDiffs = (items: ActivityDiff[], action: "added" | "deleted" | "updated") => {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const item = items[0]!;
    return {
      label: `${item.label} ${action}`,
      target: { kind: item.targetKind, id: item.targetKind ? item.id : null }
    };
  }

  const firstPlural = items[0]!.plural;
  const sameKind = items.every((item) => item.plural === firstPlural);
  return {
    label: `${items.length} ${sameKind ? firstPlural : "objects"} ${action}`,
    target: { kind: null, id: null }
  };
};

const describeWall = (id: string): ActivityDiff => ({ id, label: labelFor("Wall", id), plural: "walls", targetKind: "wall" });
const describeModule = (snapshot: LayoutSnapshot, id: string): ActivityDiff => ({
  id,
  label: moduleLabel(snapshot, id),
  plural: "modules",
  targetKind: "module"
});
const describeFloor = (id: string): ActivityDiff => ({ id, label: labelFor("Floor", id), plural: "floors", targetKind: "floor" });
const describeColumn = (id: string): ActivityDiff => ({ id, label: labelFor("Column", id), plural: "columns", targetKind: "column" });
const describeSection = (id: string): ActivityDiff => ({ id, label: labelFor("Section", id), plural: "sections", targetKind: "section" });
const describeWorktop = (id: string): ActivityDiff => ({ id, label: labelFor("Worktop", id), plural: "worktops", targetKind: null });

const moduleSignature = (item: LayoutSnapshot["instances"][number]) =>
  stableStringify({
    params: item.params,
    kitchenGroupId: item.kitchenGroupId ?? null,
    kitchenPlacement: item.kitchenPlacement ?? null,
    positionMm: item.positionMm,
    rotationYDeg: item.rotationYDeg ?? 0
  });

const simpleSignature = <T>(item: T) => stableStringify(item);

const collectAdded = (prev: LayoutSnapshot, next: LayoutSnapshot) => [
  ...addedItems(prev.walls, next.walls, (item) => describeWall(item.id)),
  ...addedItems(prev.instances, next.instances, (item) => describeModule(next, item.id)),
  ...addedItems(prev.worktops, next.worktops, (item) => describeWorktop(item.id)),
  ...addedItems(prev.floors, next.floors, (item) => describeFloor(item.id)),
  ...addedItems(prev.columns, next.columns, (item) => describeColumn(item.id)),
  ...addedItems(prev.sections, next.sections, (item) => describeSection(item.id))
];

const collectRemoved = (prev: LayoutSnapshot, next: LayoutSnapshot) => [
  ...removedItems(prev.walls, next.walls, (item) => describeWall(item.id)),
  ...removedItems(prev.instances, next.instances, (item) => describeModule(prev, item.id)),
  ...removedItems(prev.worktops, next.worktops, (item) => describeWorktop(item.id)),
  ...removedItems(prev.floors, next.floors, (item) => describeFloor(item.id)),
  ...removedItems(prev.columns, next.columns, (item) => describeColumn(item.id)),
  ...removedItems(prev.sections, next.sections, (item) => describeSection(item.id))
];

const collectChanged = (prev: LayoutSnapshot, next: LayoutSnapshot) => [
  ...changedItems(prev.walls, next.walls, (item) => stableStringify(item.params), (item) => describeWall(item.id)),
  ...changedItems(prev.instances, next.instances, moduleSignature, (item) => describeModule(next, item.id)),
  ...changedItems(prev.worktops, next.worktops, simpleSignature, (item) => describeWorktop(item.id)),
  ...changedItems(prev.floors, next.floors, simpleSignature, (item) => describeFloor(item.id)),
  ...changedItems(prev.columns, next.columns, simpleSignature, (item) => describeColumn(item.id)),
  ...changedItems(prev.sections, next.sections, simpleSignature, (item) => describeSection(item.id))
];

const combineSummaries = (
  added: ActivityDiff[],
  removed: ActivityDiff[],
  changed: ActivityDiff[]
) => {
  const activeGroups = [
    { items: added, action: "added" as const },
    { items: removed, action: "deleted" as const },
    { items: changed, action: "updated" as const }
  ].filter((group) => group.items.length > 0);

  if (activeGroups.length === 1) return summarizeDiffs(activeGroups[0]!.items, activeGroups[0]!.action);

  const total = added.length + removed.length + changed.length;
  return total > 0 ? { label: `${total} objects changed`, target: { kind: null, id: null } } : null;
};

export const describeSnapshotActivity = (prev: LayoutSnapshot, next: LayoutSnapshot) => {
  return combineSummaries(collectAdded(prev, next), collectRemoved(prev, next), collectChanged(prev, next)) ?? {
    label: "Project updated",
    target: { kind: null, id: null }
  };
};

const relativeTime = (createdAt: number) => {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

export function createRecentActivityController(ctx: RecentActivityControllerContext) {
  const listEl = document.querySelector<HTMLElement>("[data-recent-activity]");
  const countEl = document.querySelector<HTMLButtonElement>("[data-recent-activity-count]");
  const entries: ActivityEntry[] = [];
  let idCounter = 1;
  let lastSnapshot = ctx.S.history.current;
  let nextRenderAt = 0;
  let previewReturnSnapshot: LayoutSnapshot | null = null;

  const renderCompact = (force = false) => {
    if (!listEl || !countEl) return;
    const now = performance.now();
    if (!force && now < nextRenderAt) return;
    nextRenderAt = now + 1000;
    listEl.replaceChildren(
      ...(entries.length > 0
        ? entries.slice(0, 4).map((entry) => createRow(entry.label, relativeTime(entry.createdAt)))
        : [createRow("No recent changes", "now")])
    );
    countEl.textContent = `${entries.length} ${entries.length === 1 ? "change" : "changes"}`;
  };

  const record = (
    label: string,
    snapshot: LayoutSnapshot | null = ctx.S.history.current ?? null,
    target: RecentActivityTarget = { kind: null, id: null }
  ) => {
    const last = entries[0];
    if (last?.label === label && Date.now() - last.createdAt < 1200) return;
    entries.unshift({ id: idCounter++, label, createdAt: Date.now(), snapshot, target });
    entries.splice(100);
    renderCompact(true);
  };

  const closePopover = () => document.querySelector<HTMLElement>(".archux-activity-history-popover")?.remove();
  const closePreviewBanner = () => document.querySelector<HTMLElement>(".archux-activity-preview-banner")?.remove();

  const clearPreviewState = () => {
    previewReturnSnapshot = null;
    document.body.classList.remove("archux-activity-previewing");
    closePreviewBanner();
  };

  const showPreviewBanner = (entry: ActivityEntry) => {
    closePreviewBanner();
    const banner = document.createElement("div");
    banner.className = "archux-activity-preview-banner";
    const text = document.createElement("span");
    text.textContent = `Ukazujem stav: ${entry.label}`;
    const escape = document.createElement("b");
    escape.textContent = "ESC pre navrat";
    const back = createButtonElement("Spat na aktualnu verziu");
    back.addEventListener("click", () => exitPreview());
    banner.append(text, escape, back);
    document.body.appendChild(banner);
  };

  const enterPreview = (entry: ActivityEntry) => {
    if (!entry.snapshot) return;
    if (!previewReturnSnapshot) previewReturnSnapshot = captureLayoutSnapshot(ctx.S);
    restoreLayoutSnapshot(ctx.S, ctx.getHelpers(), structuredClone(entry.snapshot));
    ctx.selectTarget(entry.target);
    ctx.onRestore();
    document.body.classList.add("archux-activity-previewing");
    showPreviewBanner(entry);
    closePopover();
  };

  function exitPreview() {
    if (!previewReturnSnapshot) return;
    const snapshot = structuredClone(previewReturnSnapshot);
    restoreLayoutSnapshot(ctx.S, ctx.getHelpers(), snapshot);
    ctx.onRestore();
    clearPreviewState();
  }

  const restoreTo = (entry: ActivityEntry) => {
    if (!entry.snapshot) return;
    const snapshot = structuredClone(entry.snapshot);
    restoreLayoutSnapshot(ctx.S, ctx.getHelpers(), snapshot);
    ctx.S.history.current = snapshot;
    ctx.S.history.past = [];
    ctx.S.history.future = [];
    updateUndoRedoUi(ctx.S);
    lastSnapshot = snapshot;
    ctx.selectTarget(entry.target);
    ctx.onRestore();
    const selectedIndex = entries.findIndex((item) => item.id === entry.id);
    if (selectedIndex > 0) entries.splice(0, selectedIndex);
    renderCompact(true);
    clearPreviewState();
  };

  const open = () => {
    const existing = document.querySelector<HTMLElement>(".archux-activity-history-popover");
    if (existing) {
      existing.remove();
      return;
    }

    document.body.classList.remove("button-magnet-capturing");
    document.querySelectorAll<HTMLButtonElement>(".button-magnet-active").forEach((button) => {
      button.classList.remove("button-magnet-active");
      button.style.removeProperty("--button-magnet-x");
      button.style.removeProperty("--button-magnet-y");
      button.style.removeProperty("--button-magnet-scale");
    });

    const popover = document.createElement("section");
    popover.className = "archux-activity-history-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Activity history");

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "Activity History";
    const close = createButtonElement("Close");
    close.addEventListener("click", closePopover);
    header.append(title, close);

    const confirmBox = document.createElement("div");
    const fullList = document.createElement("div");
    fullList.className = "archux-activity-list-full";

    const showConfirm = (entry: ActivityEntry) => {
      confirmBox.className = "archux-activity-confirm";
      confirmBox.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = "Vratit projekt do tohto bodu?";
      const copy = document.createElement("p");
      copy.textContent = `Projekt sa obnovi do stavu po zmene "${entry.label}". Novsie aktivity sa vymazu z logu.`;
      const actions = document.createElement("div");
      actions.className = "archux-activity-confirm-actions";
      const no = createButtonElement("Nie");
      no.addEventListener("click", () => {
        confirmBox.className = "";
        confirmBox.replaceChildren();
      });
      const preview = createButtonElement("Ukazat stav");
      preview.dataset.activityPreview = "true";
      preview.disabled = !entry.snapshot;
      preview.addEventListener("click", () => enterPreview(entry));
      const yes = createButtonElement("Ano, obnovit");
      yes.dataset.activityConfirmYes = "true";
      yes.disabled = !entry.snapshot;
      yes.addEventListener("click", () => {
        restoreTo(entry);
        closePopover();
      });
      actions.append(no, preview, yes);
      confirmBox.append(heading, copy, actions);
    };

    if (entries.length === 0) {
      fullList.appendChild(createRow("No recent changes", "now"));
    } else {
      for (const entry of entries) {
        const button = createButtonElement("");
        const label = document.createElement("span");
        label.textContent = entry.label;
        const time = document.createElement("b");
        time.textContent = relativeTime(entry.createdAt);
        button.append(label, time);
        button.addEventListener("click", () => showConfirm(entry));
        fullList.appendChild(button);
      }
    }

    popover.append(header, confirmBox, fullList);
    document.body.appendChild(popover);
  };

  const syncFromHistory = () => {
    const current = ctx.S.history.current;
    if (!current) return;
    if (current === lastSnapshot) {
      renderCompact();
      return;
    }
    if (lastSnapshot) {
      const activity = describeSnapshotActivity(lastSnapshot, current);
      record(activity.label, current, activity.target);
    }
    lastSnapshot = current;
    renderCompact(true);
  };

  const restoreSaveState = (state: unknown) => {
    const saved = state as Partial<RecentActivitySaveState> | null | undefined;
    entries.splice(0, entries.length);
    if (saved && Array.isArray(saved.entries)) {
      for (const entry of saved.entries) {
        if (typeof entry?.id !== "number" || typeof entry.label !== "string" || typeof entry.createdAt !== "number") continue;
        entries.push({
          id: entry.id,
          label: entry.label,
          createdAt: entry.createdAt,
          snapshot: entry.snapshot ? structuredClone(entry.snapshot) : null,
          target: entry.target?.kind && entry.target.id ? { kind: entry.target.kind, id: entry.target.id } : { kind: null, id: null }
        });
      }
    }
    idCounter = Math.max(saved?.idCounter ?? 1, ...entries.map((entry) => entry.id + 1), 1);
    lastSnapshot = ctx.S.history.current;
    clearPreviewState();
    renderCompact(true);
  };

  const getSaveState = (): RecentActivitySaveState => ({
    entries: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      createdAt: entry.createdAt,
      snapshot: entry.snapshot ? structuredClone(entry.snapshot) : null,
      target: { ...entry.target }
    })),
    idCounter
  });

  countEl?.addEventListener("click", open);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !previewReturnSnapshot) return;
    event.preventDefault();
    event.stopPropagation();
    exitPreview();
  }, true);
  renderCompact(true);

  return {
    record,
    syncFromHistory,
    getSaveState,
    restoreSaveState
  };
}
