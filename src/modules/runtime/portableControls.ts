import {
  getBoardMaterialFamilyOptions,
  getPortableMaterialsSnapshotSelections,
  resolveBoardMaterialVariant,
  type PortableMaterialSlotAssignment,
  type PortableMaterialsSnapshot,
  updateCommercialSelections
} from "./portableCommercial";
import {
  applyCornerClipComponentToParams,
  applyCornerHingeComponentToParams,
  applyDrawerLowHandleComponentToParams,
  applyDrawerLowLegComponentToParams,
  applyDrawerLowRunnerComponentToParams,
  applyFlapHangingBracketComponentToParams,
  applyFlapLiftUpComponentToParams,
  applyFlapShelfSupportComponentToParams,
  getCornerClipComponentOptions,
  getCornerHingeComponentOptions,
  getDrawerLowHandleComponentOptions,
  getDrawerLowLegComponentOptions,
  getDrawerLowRunnerComponentOptions,
  getFlapHangingBracketComponentOptions,
  getFlapLiftUpComponentOptions,
  getFlapShelfSupportComponentOptions
} from "../../data/pricing/handleComponentPresets";
import { t, translateEnumLabel, translateParamDescription, translateParamLabel } from "../../i18n";

export type PortableJsonValue =
  | string
  | number
  | boolean
  | null
  | PortableJsonValue[]
  | { [key: string]: PortableJsonValue };

export type PortableParameterCatalog = {
  groups: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  parameters: Array<{
    key: string;
    group: string;
    type: string;
    required: boolean;
    defaultValue: PortableJsonValue;
    description: string;
  }>;
};

export type PortableSystemParameterCatalog = {
  schemaVersion: "module-system-parameters.v1";
  groups: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  definitions: Array<{
    key: string;
    group: string;
    type: string;
    description: string;
    required: boolean;
  }>;
};

export type PortableSystemParameterValues = {
  moduleType: string;
  values: Record<string, string | number | boolean | string[] | null>;
};

export type PortableModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type PortableModuleControlsArgs = {
  onChange: (previousParams?: Record<string, unknown>, sourceKey?: string) => void | boolean;
  getWorktopThicknessMm: () => number;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
};

export type PortableFieldOption = {
  value: string;
  label: string;
};

export type PortableFieldState = {
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

type PortableFieldControl = {
  key: string;
  wrapper: HTMLElement;
  readFromParams: () => void;
};

type PortableBadgeTone = "group" | "system" | "locked";

const LOCKED_SYSTEM_PARAMETER_KEYS = new Set<string>([
  "typeId",
  "type",
  "family",
  "version",
  "widthMm",
  "heightMm",
  "depthMm",
  "positionXmm",
  "positionYmm",
  "positionZmm",
  "rotationZDeg",
  "isValid",
  "validationErrors",
  "createdAt",
  "updatedAt",
  "ifcClass",
  "ifcPredefinedType",
  "ifcObjectType",
  "ifcTag",
  "classificationSystem"
]);

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function replaceRecordValues(target: Record<string, unknown>, next: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) delete target[key];
  }
  for (const [key, value] of Object.entries(next)) {
    target[key] = cloneValue(value);
  }
}

function parseJsonValue(raw: string): PortableJsonValue | undefined {
  try {
    return JSON.parse(raw) as PortableJsonValue;
  } catch {
    return undefined;
  }
}

function setTopLevelValue(params: Record<string, unknown>, key: string, value: PortableJsonValue) {
  params[key] = value;
}

function formatKeyLabel(key: string) {
  return translateParamLabel(key);
}

function createSection(container: HTMLElement, title: string, description: string, modifier?: string) {
  const section = document.createElement("section");
  section.className = `portable-section${modifier ? ` portable-section--${modifier}` : ""}`;

  const header = document.createElement("div");
  header.className = "portable-section__header";

  const heading = document.createElement("div");
  heading.className = "portable-section__title";
  heading.textContent = t(title);

  const help = document.createElement("div");
  help.className = "portable-section__description";
  help.textContent = translateParamDescription(description);

  header.append(heading, help);

  const body = document.createElement("div");
  body.className = "grid portable-section__body";

  section.append(header, body);
  container.appendChild(section);
  return body;
}

function appendBadges(
  container: HTMLElement,
  badges: Array<{
    label: string;
    tone: PortableBadgeTone;
  }>
) {
  if (badges.length === 0) return;

  const badgesEl = document.createElement("div");
  badgesEl.className = "portable-field__badges";

  for (const badge of badges) {
    const badgeEl = document.createElement("span");
    badgeEl.className = `portable-badge portable-badge--${badge.tone}`;
    badgeEl.textContent = t(badge.label);
    badgesEl.appendChild(badgeEl);
  }

  container.appendChild(badgesEl);
}

function createFieldShell(args: {
  container: HTMLElement;
  key: string;
  label: string;
  description: string;
  badges?: Array<{
    label: string;
    tone: PortableBadgeTone;
  }>;
  readOnly?: boolean;
}) {
  const wrapper = document.createElement("div");
  wrapper.className = `field portable-field${args.readOnly ? " portable-field--readonly" : ""}`;
  const tooltip = args.description.trim();
  if (tooltip) wrapper.title = translateParamDescription(tooltip);

  const meta = document.createElement("div");
  meta.className = "portable-field__meta";

  const head = document.createElement("div");
  head.className = "portable-field__head";

  const title = document.createElement("label");
  title.textContent = translateParamLabel(args.key);
  title.htmlFor = `portable_${args.key}`;
  if (tooltip) title.title = translateParamDescription(tooltip);

  head.appendChild(title);
  appendBadges(head, args.badges ?? []);
  meta.appendChild(head);
  wrapper.appendChild(meta);
  args.container.appendChild(wrapper);

  return { wrapper, title };
}

function getOrderedGroupKeys<T extends { group: string }>(
  entries: T[],
  groups: Array<{
    key: string;
  }>
) {
  const known = groups.map((group) => group.key);
  const extra = [...new Set(entries.map((entry) => entry.group).filter((group) => !known.includes(group)))];
  return [...known, ...extra];
}

function createSystemFieldControl(
  definition: PortableSystemParameterCatalog["definitions"][number],
  value: string | number | boolean | string[] | null,
  locked: boolean
) {
  const controlId = `portable_${definition.key}`;

  if (definition.key === "priceSource" || definition.key === "assemblyContext" || definition.key === "kitchenModuleRole") {
    const select = document.createElement("select");
    select.id = controlId;
    select.disabled = locked;
    const options =
      definition.key === "priceSource"
        ? ["calculated", "override", "manual", "catalog"]
        : definition.key === "assemblyContext"
          ? ["kitchen", "generic", "wardrobe", "bathroom", "laundry"]
          : ["base", "wall", "top", "tall"];
    for (const optionValue of options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = translateEnumLabel(optionValue);
      option.selected = value === optionValue;
      select.appendChild(option);
    }
    return select;
  }

  if (definition.type === "boolean") {
    const toggle = document.createElement("label");
    toggle.className = "portable-readonly-toggle";

    const input = document.createElement("input");
    input.id = controlId;
    input.type = "checkbox";
    input.checked = value === true;
    input.disabled = locked;

    const text = document.createElement("span");
    text.textContent = input.checked ? t("Enabled") : t("Disabled");

    toggle.append(input, text);
    return toggle;
  }

  if (definition.type === "string[]") {
    const textarea = document.createElement("textarea");
    textarea.id = controlId;
    textarea.rows = 2;
    textarea.readOnly = locked;
    textarea.value = Array.isArray(value) ? value.join(", ") : value === null ? "null" : "";
    return textarea;
  }

  if (definition.key === "notes" || definition.key === "ifcDescription") {
    const textarea = document.createElement("textarea");
    textarea.id = controlId;
    textarea.rows = 3;
    textarea.readOnly = locked;
    textarea.value = typeof value === "string" ? value : value === null ? "null" : "";
    return textarea;
  }

  const input = document.createElement("input");
  input.id = controlId;
  input.type = definition.type === "number" ? "number" : "text";
  input.readOnly = locked;
  input.value =
    value === null
      ? "null"
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? JSON.stringify(value)
          : "";
  return input;
}

function parseSystemFieldValue(
  definition: PortableSystemParameterCatalog["definitions"][number],
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): string | number | boolean | string[] | null {
  if (definition.type === "boolean" && control instanceof HTMLInputElement) {
    return control.checked;
  }

  if (definition.type === "number") {
    const raw = control.value.trim();
    return raw.length === 0 ? 0 : Number(raw);
  }

  if (definition.type === "string[]") {
    return control.value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  const raw = control.value.trim();
  return raw.length === 0 ? null : raw;
}

function shouldRenderSystemField(
  definition: PortableSystemParameterCatalog["definitions"][number],
  values: Record<string, string | number | boolean | string[] | null>
) {
  if (definition.key === "kitchenModuleRole" || definition.key === "requiresWorktop") {
    return values.assemblyContext === "kitchen";
  }
  return true;
}

function deriveComponentOptions(parameterKey: string): PortableFieldOption[] | null {
  if (parameterKey === "handleComponentId") {
    return getDrawerLowHandleComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "legComponentId") {
    return getDrawerLowLegComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "runnerComponentId") {
    return getDrawerLowRunnerComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "hingeComponentId") {
    return getCornerHingeComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "clipComponentId") {
    return getCornerClipComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "liftUpComponentId") {
    return getFlapLiftUpComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "hangingBracketComponentId") {
    return getFlapHangingBracketComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  if (parameterKey === "shelfSupportComponentId") {
    return getFlapShelfSupportComponentOptions().map((option) => ({
      value: option.componentId,
      label: option.displayName
    }));
  }
  return null;
}

function deriveScalarOptions(parameterKey: string): PortableFieldOption[] | null {
  if (parameterKey === "assemblyContext") {
    return ["kitchen", "generic", "wardrobe", "bathroom", "laundry"].map((value) => ({
      value,
      label: translateEnumLabel(value)
    }));
  }
  if (parameterKey === "kitchenModuleRole") {
    return ["base", "wall", "top", "tall"].map((value) => ({
      value,
      label: translateEnumLabel(value)
    }));
  }
  return null;
}

function shouldRenderPortableParameter(
  parameter: PortableParameterCatalog["parameters"][number],
  params: Record<string, unknown>
) {
  if (parameter.key === "kitchenModuleRole" || parameter.key === "requiresWorktop") {
    return params.assemblyContext === "kitchen";
  }
  return true;
}

function syncPortableSystemValues(
  systemValues: PortableSystemParameterValues | undefined,
  params: Record<string, unknown>
) {
  if (!systemValues) return;
  for (const key of ["assemblyContext", "kitchenModuleRole", "requiresWorktop"] as const) {
    if (key in params) {
      systemValues.values[key] = (params[key] as string | number | boolean | string[] | null) ?? null;
    }
  }
}

function formatThicknessLabel(thickness: number) {
  return Number.isInteger(thickness) ? `${thickness} mm` : `${String(thickness).replace(".", ",")} mm`;
}

function normalizeBaseMaterialId(materialId: string) {
  const match = materialId.match(/^(.*)\.(\d+(?:_\d+)?)$/);
  return match ? match[1]! : materialId;
}

function groupLabelForBoardFamily(family: string | undefined) {
  switch (family) {
    case "body":
      return t("Cabinet Panels");
    case "front":
      return t("Fronts");
    case "back":
      return t("Back Panels");
    case "drawer_box":
      return t("Drawer Box Panels");
    case "drawer_bottom":
      return t("Drawer Box Bottoms");
    case "shelf":
      return t("Shelves");
    case "worktop":
      return t("Worktops");
    default:
      return t("Board Parts");
  }
}

function matchesBoardFamily(
  requestedFamily: string | undefined,
  family: ReturnType<typeof getBoardMaterialFamilyOptions>[number]
) {
  const variantFamilies = new Set(family.variants.map((variant) => variant.boardFamily));
  if (requestedFamily === "shelf") {
    return variantFamilies.has("shelf") || variantFamilies.has("body");
  }
  return requestedFamily ? variantFamilies.has(requestedFamily as typeof family.variants[number]["boardFamily"]) : true;
}

export function createPortableModuleControls<T extends Record<string, unknown>>(args: {
  container: HTMLElement;
  params: T;
  catalog: PortableParameterCatalog;
  controlArgs: PortableModuleControlsArgs;
  paramChangeHook?: (params: T, key: string) => void;
  fieldOptions?: Record<string, PortableFieldOption[]>;
  fieldState?: Partial<Record<string, (params: T) => PortableFieldState>>;
  materialsSnapshot?: PortableMaterialsSnapshot;
  systemCatalog?: PortableSystemParameterCatalog;
  systemValues?: PortableSystemParameterValues;
}): PortableModuleControlsApi {
  const { container, params, catalog, controlArgs, paramChangeHook, fieldOptions, fieldState, materialsSnapshot, systemCatalog, systemValues } = args;
  const explicitCommitMode = controlArgs.textInputCommitMode === "explicit";
  void controlArgs.getWorktopThicknessMm;
  void controlArgs.commitBoundary;

  container.innerHTML = "";

  const fieldByKey = new Map<string, HTMLElement>();
  const controls: PortableFieldControl[] = [];
  const syncFromParams = () => {
    for (const control of controls) control.readFromParams();
  };
  const applyParamMutation = (sourceKey: string, mutate: () => void) => {
    const previous = cloneValue(params);
    mutate();
    const accepted = controlArgs.onChange(previous as Record<string, unknown>, sourceKey);
    if (accepted === false) {
      replaceRecordValues(params, previous);
      syncFromParams();
      return false;
    }
    syncFromParams();
    return true;
  };
  const getFieldState = (key: string) => fieldState?.[key]?.(params) ?? {};

  const editableRoot = document.createElement("div");
  editableRoot.className = "portable-controls";
  container.appendChild(editableRoot);

  const hiddenParameterKeys = new Set<string>();
  if (materialsSnapshot?.slotAssignments?.length) {
    hiddenParameterKeys.add("materials");
    hiddenParameterKeys.add("boardThickness");
    hiddenParameterKeys.add("backThickness");
    hiddenParameterKeys.add("frontThicknessMm");
    hiddenParameterKeys.add("drawerBoxThickness");
    hiddenParameterKeys.add("drawerBottomThickness");
    hiddenParameterKeys.add("worktopThicknessMm");
    for (const slot of materialsSnapshot.slotAssignments) {
      if (slot.thicknessParameterKey) hiddenParameterKeys.add(slot.thicknessParameterKey);
    }
  }

  const catalogGroups = new Map(catalog.groups.map((group) => [group.key, group]));
  const groupedParameters = new Map<string, typeof catalog.parameters>();
  for (const parameter of catalog.parameters) {
    if (parameter.key === "type") continue;
    if (hiddenParameterKeys.has(parameter.key)) continue;
    if (!shouldRenderPortableParameter(parameter, params)) continue;
    const bucket = groupedParameters.get(parameter.group) ?? [];
    bucket.push(parameter);
    groupedParameters.set(parameter.group, bucket);
  }

  for (const groupKey of getOrderedGroupKeys(catalog.parameters, catalog.groups)) {
    const parameters = groupedParameters.get(groupKey);
    if (!parameters || parameters.length === 0) continue;

    const group = catalogGroups.get(groupKey);
    const groupLabel = group?.label ?? formatKeyLabel(groupKey);
    const groupDescription = group?.description ?? "Imported module parameters.";
    const sectionBody = createSection(editableRoot, groupLabel, groupDescription, "editable");

    for (const parameter of parameters) {
      const { wrapper, title } = createFieldShell({
        container: sectionBody,
        key: parameter.key,
        label: formatKeyLabel(parameter.key),
        description: translateParamDescription(parameter.description)
      });
      fieldByKey.set(parameter.key, wrapper);

      if (parameter.type === "boolean") {
        const input = document.createElement("input");
        input.id = `portable_${parameter.key}`;
        input.type = "checkbox";
        input.style.justifySelf = "start";
        wrapper.appendChild(input);

        const apply = () => {
          applyParamMutation(parameter.key, () => {
            setTopLevelValue(params, parameter.key, input.checked);
            if (parameter.key === "requiresWorktop") {
              syncPortableSystemValues(systemValues, params);
            }
            paramChangeHook?.(params, parameter.key);
          });
        };

        input.addEventListener("change", apply);
        controls.push({
          key: parameter.key,
          wrapper,
          readFromParams: () => {
            input.checked = Boolean(params[parameter.key]);
          }
        });
        continue;
      }

      if (parameter.type === "number") {
        const input = document.createElement("input");
        input.id = `portable_${parameter.key}`;
        input.type = "number";
        input.inputMode = "decimal";
        input.step = "1";
        wrapper.appendChild(input);

        const apply = () => {
          const next = Number(input.value);
          if (!Number.isFinite(next)) return;
          applyParamMutation(parameter.key, () => {
            setTopLevelValue(params, parameter.key, next);
            paramChangeHook?.(params, parameter.key);
          });
        };

        input.addEventListener(explicitCommitMode ? "change" : "input", apply);
        if (explicitCommitMode) {
          input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            apply();
          });
        }
        controls.push({
          key: parameter.key,
          wrapper,
          readFromParams: () => {
            const value = params[parameter.key];
            input.value = typeof value === "number" ? String(value) : "";
            const state = getFieldState(parameter.key);
            input.disabled = state.disabled === true;
            input.step = String(state.step ?? 1);
            if (typeof state.min === "number" && Number.isFinite(state.min)) input.min = String(state.min);
            else input.removeAttribute("min");
            if (typeof state.max === "number" && Number.isFinite(state.max)) input.max = String(state.max);
            else input.removeAttribute("max");
          }
        });
        continue;
      }

      if (parameter.type === "string" || parameter.type === "null" || parameter.type === "unknown") {
        const options =
          fieldOptions?.[parameter.key] ??
          deriveComponentOptions(parameter.key) ??
          deriveScalarOptions(parameter.key) ??
          undefined;
        if (options && options.length > 0) {
          const select = document.createElement("select");
          select.id = `portable_${parameter.key}`;
          for (const optionDef of options) {
            const option = document.createElement("option");
            option.value = optionDef.value;
            option.textContent = translateEnumLabel(optionDef.label);
            select.appendChild(option);
          }
          wrapper.appendChild(select);

          const apply = () => {
            applyParamMutation(parameter.key, () => {
              if (parameter.key === "handleComponentId") {
                Object.assign(params, applyDrawerLowHandleComponentToParams(params, select.value));
              } else if (parameter.key === "legComponentId") {
                Object.assign(params, applyDrawerLowLegComponentToParams(params, select.value));
              } else if (parameter.key === "runnerComponentId") {
                Object.assign(params, applyDrawerLowRunnerComponentToParams(params, select.value));
              } else if (parameter.key === "hingeComponentId") {
                Object.assign(params, applyCornerHingeComponentToParams(params, select.value));
              } else if (parameter.key === "clipComponentId") {
                Object.assign(params, applyCornerClipComponentToParams(params, select.value));
              } else if (parameter.key === "liftUpComponentId") {
                Object.assign(params, applyFlapLiftUpComponentToParams(params, select.value));
              } else if (parameter.key === "hangingBracketComponentId") {
                Object.assign(params, applyFlapHangingBracketComponentToParams(params, select.value));
              } else if (parameter.key === "shelfSupportComponentId") {
                Object.assign(params, applyFlapShelfSupportComponentToParams(params, select.value));
              } else if (parameter.key === "assemblyContext") {
                setTopLevelValue(params, parameter.key, select.value);
                if (select.value !== "kitchen") {
                  setTopLevelValue(params, "kitchenModuleRole", null);
                  setTopLevelValue(params, "requiresWorktop", false);
                } else {
                  const resolvedRole =
                    typeof params.kitchenModuleRole === "string" && params.kitchenModuleRole.trim().length > 0
                      ? params.kitchenModuleRole
                      : "base";
                  setTopLevelValue(params, "kitchenModuleRole", resolvedRole);
                  setTopLevelValue(params, "requiresWorktop", resolvedRole === "base");
                }
                syncPortableSystemValues(systemValues, params);
              } else if (parameter.key === "kitchenModuleRole") {
                setTopLevelValue(params, parameter.key, select.value);
                setTopLevelValue(params, "requiresWorktop", select.value === "base");
                syncPortableSystemValues(systemValues, params);
              } else {
                setTopLevelValue(params, parameter.key, select.value);
              }
              paramChangeHook?.(params, parameter.key);
            });
          };

          select.addEventListener("change", apply);
          controls.push({
            key: parameter.key,
            wrapper,
            readFromParams: () => {
              const value = params[parameter.key];
              const stringValue =
                typeof value === "string" ? value : value == null ? String(parameter.defaultValue ?? "") : String(value);
              const hasOption = options.some((option) => option.value === stringValue);
              select.value = hasOption ? stringValue : options[0]?.value ?? "";
            }
          });
          continue;
        }

        const input = document.createElement("input");
        input.id = `portable_${parameter.key}`;
        input.type = "text";
        wrapper.appendChild(input);

        const apply = () => {
          applyParamMutation(parameter.key, () => {
            setTopLevelValue(params, parameter.key, input.value);
            paramChangeHook?.(params, parameter.key);
          });
        };

        input.addEventListener(explicitCommitMode ? "change" : "input", apply);
        if (explicitCommitMode) {
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") apply();
          });
        }

        controls.push({
          key: parameter.key,
          wrapper,
          readFromParams: () => {
            const value = params[parameter.key];
            input.value = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
          }
        });
        continue;
      }

      const isNumberArray = parameter.type === "number[]";
      const input = isNumberArray ? document.createElement("input") : document.createElement("textarea");
      input.id = `portable_${parameter.key}`;
      if (input instanceof HTMLInputElement) {
        input.type = "text";
        input.placeholder = "napr. 120, 180, 160";
      } else {
        input.rows = 2;
      }
      wrapper.appendChild(input);
      title.htmlFor = input.id;

      const apply = () => {
        let parsed: PortableJsonValue | undefined;
        if (isNumberArray && input instanceof HTMLInputElement) {
          const raw = input.value.trim();
          if (raw.length === 0) {
            parsed = [];
          } else {
            const normalized = raw.startsWith("[") ? raw : `[${raw}]`;
            const jsonParsed = parseJsonValue(normalized);
            parsed =
              Array.isArray(jsonParsed) &&
              jsonParsed.every((value) => typeof value === "number" && Number.isFinite(value))
                ? jsonParsed
                : undefined;
          }
        } else {
          parsed = parseJsonValue(input.value);
        }
        if (parsed === undefined) {
          wrapper.classList.add("error");
          return;
        }
        wrapper.classList.remove("error");
        applyParamMutation(parameter.key, () => {
          setTopLevelValue(params, parameter.key, cloneValue(parsed));
          paramChangeHook?.(params, parameter.key);
        });
      };

      input.addEventListener(explicitCommitMode ? "change" : "input", apply);
      if (explicitCommitMode) {
        input.addEventListener("keydown", (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") apply();
        });
      }

      controls.push({
        key: parameter.key,
        wrapper,
        readFromParams: () => {
          const current = params[parameter.key] ?? parameter.defaultValue;
          if (isNumberArray && input instanceof HTMLInputElement) {
            const values = Array.isArray(current) ? current : [];
            input.value = values.join(", ");
          } else {
            input.value = JSON.stringify(current, null, 2);
          }
          input.disabled = getFieldState(parameter.key).disabled === true;
          wrapper.classList.remove("error");
        }
      });
    }
  }

  if (materialsSnapshot?.slotAssignments?.length) {
    const sectionBody = createSection(
      editableRoot,
      "Part Parameters",
      "Board material and thickness per slot. Thickness options follow the selected catalog material.",
      "editable"
    );
    const materialFamilies = getBoardMaterialFamilyOptions();
    const familyByBaseId = new Map(materialFamilies.map((family) => [family.baseId, family]));
    const slotsByFamily = new Map<string, PortableMaterialSlotAssignment[]>();

    for (const slot of materialsSnapshot.slotAssignments) {
      const familyKey = slot.boardFamily ?? "other";
      const bucket = slotsByFamily.get(familyKey) ?? [];
      bucket.push(slot);
      slotsByFamily.set(familyKey, bucket);
    }

    const syncSlotControlState = (
      materialSelect: HTMLSelectElement,
      thicknessSelect: HTMLSelectElement,
      slotId: string,
      fallbackCatalogId: string,
      allowedFamilies: ReturnType<typeof getBoardMaterialFamilyOptions>
    ) => {
      const { slotMaterialCatalogIds, slotThicknesses } = getPortableMaterialsSnapshotSelections(materialsSnapshot, params);
      const selectedCatalogId = slotMaterialCatalogIds[slotId] ?? fallbackCatalogId;
      const selectedBaseId = normalizeBaseMaterialId(selectedCatalogId);
      const family =
        familyByBaseId.get(selectedBaseId) ??
        allowedFamilies.find((entry) => entry.variants.some((variant) => variant.id === selectedCatalogId)) ??
        materialFamilies.find((entry) => entry.variants.some((variant) => variant.id === selectedCatalogId));
      if (!family) return;

      materialSelect.value = family.baseId;
      const currentThickness = slotThicknesses[slotId] ?? family.variants[0]?.defaultThicknessMm ?? 18;
      thicknessSelect.innerHTML = "";
      const availableThicknesses = family.variants.map((variant) => variant.defaultThicknessMm);
      const nearestThickness = availableThicknesses.includes(currentThickness)
        ? currentThickness
        : (availableThicknesses.sort((left, right) => Math.abs(left - currentThickness) - Math.abs(right - currentThickness))[0] ?? currentThickness);
      for (const thickness of availableThicknesses) {
        const option = document.createElement("option");
        option.value = String(thickness);
        option.textContent = formatThicknessLabel(thickness);
        option.selected = thickness === nearestThickness;
        thicknessSelect.appendChild(option);
      }
    };

    const createBoardSelectors = (
      slotIds: string[],
      fallbackCatalogId: string,
      thicknessParameterKey?: string | null,
      boardFamily?: string
    ) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(0, 1.25fr) minmax(0, 0.75fr)";
      row.style.gap = "8px";

      const materialSelect = document.createElement("select");
      const thicknessSelect = document.createElement("select");
      const allowedFamilies = materialFamilies.filter((family) => matchesBoardFamily(boardFamily, family));
      for (const family of allowedFamilies.length > 0 ? allowedFamilies : materialFamilies) {
        const option = document.createElement("option");
        option.value = family.baseId;
        option.textContent = t(family.displayName);
        materialSelect.appendChild(option);
      }

      const applyMaterialChange = () => {
        const targetFamily = familyByBaseId.get(materialSelect.value);
        if (!targetFamily) return;
        applyParamMutation(thicknessParameterKey ?? "materials", () => {
          const { slotThicknesses } = getPortableMaterialsSnapshotSelections(materialsSnapshot, params);
          for (const slotId of slotIds) {
            const currentThickness = slotThicknesses[slotId] ?? targetFamily.variants[0]?.defaultThicknessMm ?? 18;
            const nextVariant = resolveBoardMaterialVariant(targetFamily.baseId, currentThickness) ?? targetFamily.variants[0];
            if (!nextVariant) continue;
            updateCommercialSelections(params, (current) => {
              current.boardMaterials[slotId] = nextVariant.id;
              current.boardThicknesses[slotId] = nextVariant.defaultThicknessMm;
              return current;
            });
            if (thicknessParameterKey) {
              setTopLevelValue(params, thicknessParameterKey, nextVariant.defaultThicknessMm);
            }
          }
          paramChangeHook?.(params, thicknessParameterKey ?? "materials");
        });
      };

      const applyThicknessChange = () => {
        const targetFamily = familyByBaseId.get(materialSelect.value);
        const nextThickness = Number(thicknessSelect.value);
        if (!targetFamily || !Number.isFinite(nextThickness)) return;
        const nextVariant = resolveBoardMaterialVariant(targetFamily.baseId, nextThickness) ?? targetFamily.variants[0];
        if (!nextVariant) return;
        applyParamMutation(thicknessParameterKey ?? "materials", () => {
          for (const slotId of slotIds) {
            updateCommercialSelections(params, (current) => {
              current.boardMaterials[slotId] = nextVariant.id;
              current.boardThicknesses[slotId] = nextThickness;
              return current;
            });
          }
          if (thicknessParameterKey) {
            setTopLevelValue(params, thicknessParameterKey, nextThickness);
          }
          paramChangeHook?.(params, thicknessParameterKey ?? "materials");
        });
      };

      materialSelect.addEventListener("change", applyMaterialChange);
      thicknessSelect.addEventListener("change", applyThicknessChange);
      row.append(materialSelect, thicknessSelect);

      controls.push({
        key: `slot:${slotIds.join(",")}`,
        wrapper: row,
        readFromParams: () => syncSlotControlState(materialSelect, thicknessSelect, slotIds[0]!, fallbackCatalogId, allowedFamilies)
      });

      syncSlotControlState(materialSelect, thicknessSelect, slotIds[0]!, fallbackCatalogId, allowedFamilies);
      return row;
    };

    for (const [familyKey, slots] of [...slotsByFamily.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
      const groupWrapper = document.createElement("div");
      groupWrapper.className = "portable-field";
      groupWrapper.style.display = "grid";
      groupWrapper.style.gap = "8px";

      const heading = document.createElement("div");
      heading.className = "portable-field__meta";
      heading.textContent = groupLabelForBoardFamily(familyKey);
      groupWrapper.appendChild(heading);

      groupWrapper.appendChild(
        createBoardSelectors(
          slots.map((slot) => slot.slotId),
          slots[0]!.assignedMaterial.catalogId,
          slots[0]!.thicknessParameterKey ?? null,
          familyKey
        )
      );

      for (const slot of slots) {
        const slotMeta = document.createElement("div");
        slotMeta.style.color = "#9aa5ba";
        slotMeta.style.fontSize = "12px";
        slotMeta.textContent = slot.label;
        groupWrapper.appendChild(slotMeta);
        groupWrapper.appendChild(
          createBoardSelectors([slot.slotId], slot.assignedMaterial.catalogId, slot.thicknessParameterKey ?? null, slot.boardFamily)
        );
      }

      sectionBody.appendChild(groupWrapper);
    }
  }

  if (systemCatalog && systemValues) {
    const systemGroups = new Map(systemCatalog.groups.map((group) => [group.key, group]));
    const systemDefinitionsByGroup = new Map<string, typeof systemCatalog.definitions>();
    for (const definition of systemCatalog.definitions) {
      const bucket = systemDefinitionsByGroup.get(definition.group) ?? [];
      bucket.push(definition);
      systemDefinitionsByGroup.set(definition.group, bucket);
    }

    const systemRoot = document.createElement("div");
    systemRoot.className = "portable-controls";
    container.appendChild(systemRoot);

    const systemIntro = createSection(
      systemRoot,
      "System Parameters",
      "Imported package snapshot. Locked fields are derived from the reference importer rules.",
      "system"
    );
    systemIntro.classList.add("portable-section__body--compact");

    const introHint = document.createElement("p");
    introHint.className = "muted portable-system-summary";
    introHint.textContent = t(
      `Module ${systemValues.moduleType} exposes ${systemCatalog.definitions.length} system parameter(s).`
    );
    systemIntro.appendChild(introHint);

    for (const groupKey of getOrderedGroupKeys(systemCatalog.definitions, systemCatalog.groups)) {
      const definitions = systemDefinitionsByGroup.get(groupKey);
      if (!definitions || definitions.length === 0) continue;

      const group = systemGroups.get(groupKey);
      const groupLabel = group?.label ?? formatKeyLabel(groupKey);
      const groupDescription = group?.description ?? "Imported system parameters.";
      const sectionBody = createSection(systemRoot, groupLabel, groupDescription, "system");

      for (const definition of definitions) {
        if (!shouldRenderSystemField(definition, systemValues.values)) continue;
        const locked = LOCKED_SYSTEM_PARAMETER_KEYS.has(definition.key);
        const value = systemValues.values[definition.key] ?? null;
        const control = createSystemFieldControl(definition, value, locked);
        const badges = [
          { label: "System", tone: "system" as const }
        ];
        if (locked) {
          badges.push({ label: "Locked", tone: "locked" as const });
        }

        const { wrapper } = createFieldShell({
          container: sectionBody,
          key: definition.key,
          label: formatKeyLabel(definition.key),
          description: translateParamDescription(definition.description),
          badges,
          readOnly: true
        });
        wrapper.appendChild(control);

        if (!locked) {
          const apply = () => {
            applyParamMutation(() => {
              const nextValue = parseSystemFieldValue(definition, control);
              params[definition.key] = cloneValue(nextValue);
              systemValues.values[definition.key] = nextValue;

              if (definition.key === "assemblyContext" && nextValue !== "kitchen") {
                params.kitchenModuleRole = null;
                params.requiresWorktop = false;
                systemValues.values.kitchenModuleRole = null;
                systemValues.values.requiresWorktop = false;
              } else if (definition.key === "assemblyContext" && nextValue === "kitchen") {
                const resolvedRole =
                  typeof params.kitchenModuleRole === "string" && params.kitchenModuleRole.trim().length > 0
                    ? params.kitchenModuleRole
                    : "base";
                params.kitchenModuleRole = resolvedRole;
                params.requiresWorktop = resolvedRole === "base";
                systemValues.values.kitchenModuleRole = resolvedRole;
                systemValues.values.requiresWorktop = resolvedRole === "base";
              }

              if (definition.key === "kitchenModuleRole") {
                const requiresWorktop = nextValue === "base";
                params.requiresWorktop = requiresWorktop;
                systemValues.values.requiresWorktop = requiresWorktop;
              }
              paramChangeHook?.(params, definition.key);
            });
          };

          control.addEventListener("change", apply);
          controls.push({
            key: `system:${definition.key}`,
            wrapper,
            readFromParams: () => {
              const nextValue =
                params[definition.key] !== undefined
                  ? (params[definition.key] as string | number | boolean | string[] | null)
                  : (systemValues.values[definition.key] ?? null);
              systemValues.values[definition.key] = nextValue;
              const refreshed = createSystemFieldControl(definition, nextValue, locked);
              if (control instanceof HTMLInputElement && refreshed instanceof HTMLInputElement) {
                if (control.type === "checkbox") control.checked = refreshed.checked;
                else control.value = refreshed.value;
              } else if (
                (control instanceof HTMLSelectElement && refreshed instanceof HTMLSelectElement) ||
                (control instanceof HTMLTextAreaElement && refreshed instanceof HTMLTextAreaElement)
              ) {
                control.value = refreshed.value;
              }
            }
          });
        }
      }
    }
  }

  const clearHighlights = () => {
    for (const element of fieldByKey.values()) element.classList.remove("is-related");
  };

  const highlightParamKeys = (keys: string[]) => {
    clearHighlights();
    let first: HTMLElement | null = null;
    for (const key of keys) {
      const field = fieldByKey.get(key);
      if (!field) continue;
      field.classList.add("is-related");
      if (!first) first = field;
    }
    first?.scrollIntoView({ block: "nearest" });
  };

  syncFromParams();

  return {
    syncFromParams,
    isAutoFitEnabled: () => false,
    highlightParamKeys,
    clearHighlights
  };
}
