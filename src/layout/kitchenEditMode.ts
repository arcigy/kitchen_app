import type { AppState } from "./appState";
import { getAllMaterials } from "../data/materials";
import { resolveContext } from "./kitchenContext";
import { mountKitchenToolbar } from "../ui/kitchenToolbar";
import { showKitchenOverlay } from "../ui/kitchenOverlay";

export interface KitchenModeHelpers {
  ribbonEl: HTMLElement;
  onModuleAdd: (type: string) => void;
  cancelPlacement: () => void;
  setToolSelect: () => void;
  mountProps: () => void;
  applyKitchenContextToAllInstances: () => void;
}

type Session = {
  cleanupToolbar: (() => void) | null;
  cleanupOverlay: (() => void) | null;
  cleanupKey: (() => void) | null;
  kitchenCtxBefore: AppState["kitchenCtx"];
};

const sessions = new WeakMap<AppState, Session>();

export function enterKitchenMode(S: AppState, helpers: KitchenModeHelpers): void {
  if (S.kitchenEditMode) return;

  const kitchenCtxBefore = structuredClone(S.kitchenCtx);

  S.kitchenEditMode = true;
  helpers.setToolSelect();

  const cleanupOverlay = showKitchenOverlay();
  const cleanupToolbar = mountKitchenToolbar(helpers.ribbonEl, {
    onModuleAdd: helpers.onModuleAdd,
    onFinish: () => exitKitchenMode(S, helpers, "finish"),
    onDiscard: () => exitKitchenMode(S, helpers, "discard")
  });

  const onKeyDown = (ev: KeyboardEvent) => {
    if (!S.kitchenEditMode) return;
    if (ev.key !== "Escape") return;
    if (isTypingTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    exitKitchenMode(S, helpers, "discard");
  };
  window.addEventListener("keydown", onKeyDown, true);
  const cleanupKey = () => window.removeEventListener("keydown", onKeyDown, true);

  sessions.set(S, { cleanupOverlay, cleanupToolbar, cleanupKey, kitchenCtxBefore });
  helpers.mountProps();
}

export function exitKitchenMode(S: AppState, helpers: KitchenModeHelpers, action: "finish" | "discard"): void {
  const session = sessions.get(S) ?? null;
  if (!session) {
    S.kitchenEditMode = false;
    helpers.mountProps();
    return;
  }

  if (S.placement.active) helpers.cancelPlacement();

  if (action === "discard") {
    S.kitchenCtx = resolveContext(structuredClone(session.kitchenCtxBefore));
    helpers.applyKitchenContextToAllInstances();
  }

  S.kitchenEditMode = false;

  session.cleanupKey?.();
  session.cleanupToolbar?.();
  session.cleanupOverlay?.();
  sessions.delete(S);

  helpers.mountProps();
}

export function mountKitchenContextPanel(container: HTMLElement, S: AppState, onChange: () => void): void {
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "props-title";
  title.textContent = "Kuchynský kontext";
  container.appendChild(title);

  const s = document.createElement("div");
  s.className = "props-section";
  container.appendChild(s);

  const row = (label: string, inputEl: HTMLElement) => {
    const r = document.createElement("div");
    r.className = "props-row";
    const l = document.createElement("label");
    l.textContent = label;
    r.appendChild(l);
    r.appendChild(inputEl);
    s.appendChild(r);
  };

  const mkNum = (value: number) => {
    const el = document.createElement("input");
    el.type = "number";
    el.step = "1";
    el.value = String(value);
    return el;
  };

  const heightMmEl = mkNum(S.kitchenCtx.heightMm);
  row("Výška (mm)", heightMmEl);
  const worktopDepthMmEl = mkNum(S.kitchenCtx.worktopDepthMm);
  row("Doska hĺbka (mm)", worktopDepthMmEl);
  const frontEl = mkNum(S.kitchenCtx.worktopFrontOffsetMm);
  row("Presah vpredu (mm)", frontEl);
  const backEl = mkNum(S.kitchenCtx.worktopBackOffsetMm);
  row("Medzera vzadu (mm)", backEl);
  const thickEl = mkNum(S.kitchenCtx.worktopThicknessMm);
  row("Hrúbka dosky (mm)", thickEl);

  const mats = getAllMaterials();
  const matSelect = (selectedId: string) => {
    const sel = document.createElement("select");
    sel.innerHTML = mats.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    sel.value = selectedId;
    return sel;
  };

  const faceEl = matSelect(S.kitchenCtx.faceMaterialId);
  row("Materiál dvierka", faceEl);
  const corpusEl = matSelect(S.kitchenCtx.corpusMaterialId);
  row("Materiál korpus", corpusEl);

  const readMm = (el: HTMLInputElement, prev: number) => {
    const v = Math.round(Number(el.value));
    return Number.isFinite(v) ? v : prev;
  };

  const update = () => {
    if (!S.kitchenEditMode) return;
    S.kitchenCtx = resolveContext({
      ...S.kitchenCtx,
      heightMm: readMm(heightMmEl, S.kitchenCtx.heightMm),
      worktopDepthMm: readMm(worktopDepthMmEl, S.kitchenCtx.worktopDepthMm),
      worktopFrontOffsetMm: readMm(frontEl, S.kitchenCtx.worktopFrontOffsetMm),
      worktopBackOffsetMm: readMm(backEl, S.kitchenCtx.worktopBackOffsetMm),
      worktopThicknessMm: readMm(thickEl, S.kitchenCtx.worktopThicknessMm),
      faceMaterialId: faceEl.value || S.kitchenCtx.faceMaterialId,
      corpusMaterialId: corpusEl.value || S.kitchenCtx.corpusMaterialId
    });
    onChange();
  };

  heightMmEl.addEventListener("change", update);
  worktopDepthMmEl.addEventListener("change", update);
  frontEl.addEventListener("change", update);
  backEl.addEventListener("change", update);
  thickEl.addEventListener("change", update);
  faceEl.addEventListener("change", update);
  corpusEl.addEventListener("change", update);
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!t) return false;
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}
