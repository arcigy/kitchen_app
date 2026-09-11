import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createResolvedModuleControls } from "../core/module-package/runtime/module-package-controls";
import { buildModulePackageGeometryFromPackage } from "../core/module-package/runtime/module-runtime-adapter";
import type { ModuleControlsApi } from "../modules/registry";
import type { ModuleParams } from "../model/cabinetTypes";
import { resolveModuleParameterDimensions, type ModuleParameterDimension } from "../modules/runtime/parameterDimensions";
import { describeFwmModuleHeight } from "../modules/fwmFurniture/heightPresentation";
import { createModuleSettingsSession, replaceModuleSettings } from "./moduleSettingsSession";
import { prepareModuleSettings } from "./moduleSettingsValidation";
import { ownModulePreviewResources } from "./moduleSettingsResources";
import { createModuleSettingsViewport } from "./moduleSettingsViewport";
import { createModuleParameterPresetSaver } from "./moduleParameterPresetService";
import { t, translateParamLabel } from "../i18n";
import "./moduleSettings.css";

export function openModuleSettings(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: ModuleParams;
  clientCatalog: ClientCatalog;
  commit: (candidate: ModuleParams, baseline: ModuleParams) => ModuleParams;
  onClose: () => void;
}) {
  const existing = document.querySelector<HTMLDialogElement>("dialog[data-module-settings]");
  if (existing) { existing.focus(); return; }
  const previousFocus = document.activeElement;
  const modulePackage = structuredClone(args.modulePackage);
  const draft = structuredClone(args.parameters);
  const dialog = document.createElement("dialog");
  dialog.className = "module-settings";
  dialog.dataset.moduleSettings = "true";
  dialog.setAttribute("aria-labelledby", "module-settings-title");
  dialog.dataset.i18nSkip = "true";
  const shell = document.createElement("div"); shell.className = "module-settings-shell";
  const header = document.createElement("header"); header.className = "module-settings-header";
  const heading = document.createElement("h2"); heading.id = "module-settings-title";
  heading.textContent = `${t("Advanced settings")} · ${modulePackage.module.displayName}`;
  const help = document.createElement("p"); help.textContent = t("Changes affect only this preview until you save the module.");
  const presets = document.createElement("div"); presets.className = "module-settings-presets";
  const presetHelp = document.createElement("small"); presetHelp.textContent = t("New presets are saved to your company separately, without dimensions or materials.");
  header.append(heading, help, presets, presetHelp);
  const body = document.createElement("div"); body.className = "module-settings-body";
  const preview = document.createElement("section"); preview.className = "module-settings-preview";
  preview.setAttribute("aria-label", t("Module preview"));
  const tools = document.createElement("div"); tools.className = "module-settings-view-tools";
  const viewer = document.createElement("div"); viewer.className = "module-settings-viewport";
  const side = document.createElement("section"); side.className = "module-settings-side";
  side.setAttribute("aria-label", t("Parameters"));
  const summary = document.createElement("p"); summary.className = "module-settings-height";
  const form = document.createElement("div"); form.className = "module-settings-fields";
  side.append(summary, form); preview.append(tools, viewer); body.append(preview, side);
  const footer = document.createElement("footer"); footer.className = "module-settings-footer";
  const status = document.createElement("div"); status.setAttribute("role", "status"); status.className = "module-settings-status";
  const error = document.createElement("div"); error.setAttribute("role", "alert"); error.className = "module-settings-error";
  const actions = document.createElement("div"); actions.className = "module-settings-actions";
  footer.append(status, error, actions); shell.append(header, body, footer); dialog.append(shell);
  document.body.appendChild(dialog); dialog.showModal();
  let closed = false;
  let previewDispose: (() => void) | undefined;
  let controls: ModuleControlsApi | undefined;
  let confirmation: HTMLDialogElement | null = null;
  let pendingForm = false;
  let dimensions: ModuleParameterDimension[] = [];
  const unitScale = (key: string) => {
    const unit = modulePackage.parameters.parameters.find((p) => p.key === key)?.unit;
    return unit === "m" ? 1000 : unit === "cm" ? 10 : 1;
  };
  const needsDisplayConversion = (dimension: ModuleParameterDimension) => Math.abs(dimension.parameterValue * unitScale(dimension.parameterKey) - dimension.valueMm) > .001 || dimension.id.startsWith("fwm:drawer");
  const makeViewport = () => createModuleSettingsViewport(viewer, {
    labelFor: (key) => key === "height" ? describeFwmModuleHeight(draft)?.label ?? translateParamLabel(key)
      : translateParamLabel(key) || modulePackage.parameters.parameters.find((parameter) => parameter.key === key)?.label || key,
    onFocus: (key) => { controls?.highlightParamKeys([key]); },
    onEdit: (key, value) => {
      const candidate = structuredClone(draft); candidate[key] = value;
      return change(candidate, key);
    }
  });
  let viewport: ReturnType<typeof createModuleSettingsViewport>;
  try { viewport = makeViewport(); }
  catch (failure) { dialog.close(); dialog.remove(); throw failure; }
  const updatePreview = (parameters: ModuleParams) => {
    const model = buildModulePackageGeometryFromPackage({ modulePackage, parameters: structuredClone(parameters), catalog: args.clientCatalog });
    const dispose = ownModulePreviewResources(model);
    try {
      const nextDimensions = resolveModuleParameterDimensions({ root: model, modulePackage, parameters });
      viewport.setModel(model, nextDimensions); dimensions = nextDimensions;
    } catch (failure) { dispose(); throw failure; }
    previewDispose?.(); previewDispose = dispose;
  };
  const session = createModuleSettingsSession(draft, {
    prepare(candidate, sourceKey) {
      const normalized = prepareModuleSettings(modulePackage, candidate, sourceKey);
      updatePreview(normalized);
      return normalized;
    },
    commit(candidate, baseline) {
      const normalized = prepareModuleSettings(modulePackage, candidate);
      normalized.packageHash = modulePackage.integrity.packageHash;
      return args.commit(normalized, baseline);
    }
  });
  const button = (host: HTMLElement, label: string, action: () => void) => {
    const element = document.createElement("button"); element.type = "button"; element.textContent = t(label);
    element.addEventListener("click", action); host.append(element); return element;
  };
  const sync = () => {
    pendingForm = false;
    controls?.syncFromParams();
    for (const dimension of dimensions) {
      if (!needsDisplayConversion(dimension)) continue;
      const row = [...form.querySelectorAll<HTMLElement>("[data-parameter-key]")].find((row) => row.dataset.parameterKey === dimension.parameterKey);
      const input = row?.querySelector<HTMLInputElement>("input[type=number]");
      if (input) { input.value = String(Number((dimension.valueMm / unitScale(dimension.parameterKey)).toFixed(3))); input.step = "any"; }
    }
    summary.textContent = describeFwmModuleHeight(draft)?.summary ?? "";
    status.textContent = t(session.dirty ? "Unsaved module changes" : "Module settings saved");
    undo.disabled = !session.canUndo; redo.disabled = !session.canRedo;
  };
  const showError = (failure: unknown) => { error.textContent = failure instanceof Error ? t(failure.message) : t("The module could not be updated."); };
  const change = (candidate: ModuleParams, key?: string) => {
    try {
      replaceModuleSettings(draft, session.change(candidate, key));
      error.textContent = ""; sync(); return true;
    } catch (failure) { replaceModuleSettings(draft, session.current()); showError(failure); sync(); return false; }
  };
  const restore = (direction: "undo" | "redo") => {
    const next = session[direction](); replaceModuleSettings(draft, next);
    try { updatePreview(next); error.textContent = ""; } catch (failure) { showError(failure); }
    sync();
  };
  button(tools, "Reset view", () => viewport.reset());
  const undo = button(tools, "Undo", () => restore("undo"));
  const redo = button(tools, "Redo", () => restore("redo"));
  const close = () => {
    if (closed) return; closed = true;
    window.removeEventListener("beforeunload", guardUnload);
    confirmation?.close(); confirmation?.remove();
    viewport.dispose(); previewDispose?.(); dialog.close(); dialog.remove(); args.onClose();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    else document.querySelector<HTMLButtonElement>("[data-open-module-settings]")?.focus();
  };
  const save = (andClose: boolean) => {
    const invalid = [...form.querySelectorAll<HTMLInputElement>("input")].find((input) => !input.disabled && input.getClientRects().length > 0 && !validInput(input));
    if (invalid) {
      confirmation?.close(); confirmation?.remove(); confirmation = null;
      error.textContent = t("Enter a value within the allowed range."); invalid.focus(); return;
    }
    if (!viewport.commitEdit()) {
      confirmation?.close(); confirmation?.remove(); confirmation = null; return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && form.contains(active)) {
      active.dispatchEvent(new Event("change", { bubbles: true })); active.blur();
    }
    if (error.textContent) return;
    try {
      replaceModuleSettings(draft, session.save()); updatePreview(draft); error.textContent = ""; sync();
      if (andClose) close();
    } catch (failure) { showError(failure); confirmation?.close(); confirmation?.remove(); confirmation = null; }
  };
  const requestClose = () => {
    if (!session.dirty && !pendingForm && !viewport.hasPendingEdit()) { close(); return; }
    if (confirmation) return;
    confirmation = document.createElement("dialog"); confirmation.className = "module-settings-confirm";
    confirmation.setAttribute("aria-label", t("Unsaved module changes"));
    const copy = document.createElement("p"); copy.textContent = t("Save the module before closing?"); confirmation.append(copy);
    const dismiss = () => { confirmation?.close(); confirmation?.remove(); confirmation = null; };
    button(confirmation, "Continue editing", dismiss);
    button(confirmation, "Discard changes", close);
    button(confirmation, "Save and close", () => save(true));
    confirmation.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
    confirmation.addEventListener("keydown", (event) => event.stopPropagation());
    dialog.append(confirmation); confirmation.showModal();
  };
  button(actions, "Cancel", requestClose);
  button(actions, "Save", () => save(false));
  const saveClose = button(actions, "Save and close", () => save(true)); saveClose.className = "primary";
  const guardUnload = (event: BeforeUnloadEvent) => { if (session.dirty || pendingForm || viewport.hasPendingEdit()) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", guardUnload);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });
  for (const name of ["pointerdown", "pointerup", "click", "dblclick", "wheel"]) dialog.addEventListener(name, (event) => event.stopPropagation());
  // Existing window-level editor shortcuts must never receive keys from this scope.
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(false); }
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault(); restore(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && form.contains(event.target)) {
      event.preventDefault(); event.target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  form.addEventListener("focusin", (event) => {
    const key = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-parameter-key]")?.dataset.parameterKey : undefined;
    if (key) { controls?.highlightParamKeys([key]); viewport.setActiveParameter(key); }
  });
  form.addEventListener("input", () => { pendingForm = true; status.textContent = t("Unsaved module changes"); });
  const validInput = (input: HTMLInputElement) => input.checkValidity() && (input.type !== "number" || input.value.trim() !== "");
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && !validInput(event.target)) {
      event.stopImmediatePropagation(); error.textContent = t("Enter a value within the allowed range.");
      return;
    }
    if (event.target instanceof HTMLInputElement) {
      const key = event.target.closest<HTMLElement>("[data-parameter-key]")?.dataset.parameterKey;
      const dimension = dimensions.find((d) => d.parameterKey === key && needsDisplayConversion(d));
      if (dimension) {
        event.stopImmediatePropagation();
        change({ ...draft, [dimension.parameterKey]: dimension.toParameterValue(Number(event.target.value) * unitScale(dimension.parameterKey)) }, dimension.parameterKey);
      }
    }
  }, true);
  const savePreset = createModuleParameterPresetSaver(args.clientCatalog);
  try { controls = createResolvedModuleControls(form, modulePackage, draft, {
    clientCatalog: args.clientCatalog, getWorktopThicknessMm: () => Number(draft.worktopThicknessMm) || 0,
    textInputCommitMode: "explicit", commitBoundary: dialog, presetHost: presets, presetDialogHost: dialog, userParametersOnly: true,
    onChange: (_previous?: ModuleParams, key?: string) => change(draft, key),
    createParameterPreset: async (input) => {
      const result = await savePreset(input);
      if (result) Object.assign(args.modulePackage, result.modulePackage);
      return result;
    }
  }); } catch (failure) { close(); throw failure; }
  try { updatePreview(draft); } catch (failure) { showError(failure); }
  sync();
  return { dialog, close: requestClose };
}
