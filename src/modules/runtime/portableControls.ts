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
  onChange: () => void | boolean;
  getWorktopThicknessMm: () => number;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
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
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function createSection(container: HTMLElement, title: string, description: string, modifier?: string) {
  const section = document.createElement("section");
  section.className = `portable-section${modifier ? ` portable-section--${modifier}` : ""}`;

  const header = document.createElement("div");
  header.className = "portable-section__header";

  const heading = document.createElement("div");
  heading.className = "portable-section__title";
  heading.textContent = title;

  const help = document.createElement("div");
  help.className = "portable-section__description";
  help.textContent = description;

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
    badgeEl.textContent = badge.label;
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
  if (tooltip) wrapper.title = tooltip;

  const meta = document.createElement("div");
  meta.className = "portable-field__meta";

  const head = document.createElement("div");
  head.className = "portable-field__head";

  const title = document.createElement("label");
  title.textContent = args.label;
  title.htmlFor = `portable_${args.key}`;
  if (tooltip) title.title = tooltip;

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

function createReadonlySystemControl(
  definition: PortableSystemParameterCatalog["definitions"][number],
  value: string | number | boolean | string[] | null
) {
  const controlId = `portable_${definition.key}`;

  if (definition.key === "priceSource") {
    const select = document.createElement("select");
    select.id = controlId;
    select.disabled = true;
    for (const optionValue of ["calculated", "override", "manual", "catalog"]) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
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
    input.disabled = true;

    const text = document.createElement("span");
    text.textContent = input.checked ? "Enabled" : "Disabled";

    toggle.append(input, text);
    return toggle;
  }

  if (definition.type === "string[]") {
    const textarea = document.createElement("textarea");
    textarea.id = controlId;
    textarea.rows = 2;
    textarea.readOnly = true;
    textarea.value = Array.isArray(value) ? value.join(", ") : value === null ? "null" : "";
    return textarea;
  }

  if (definition.key === "notes" || definition.key === "ifcDescription") {
    const textarea = document.createElement("textarea");
    textarea.id = controlId;
    textarea.rows = 3;
    textarea.readOnly = true;
    textarea.value = typeof value === "string" ? value : value === null ? "null" : "";
    return textarea;
  }

  const input = document.createElement("input");
  input.id = controlId;
  input.type = definition.type === "number" ? "number" : "text";
  input.readOnly = true;
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

export function createPortableModuleControls<T extends Record<string, unknown>>(args: {
  container: HTMLElement;
  params: T;
  catalog: PortableParameterCatalog;
  controlArgs: PortableModuleControlsArgs;
  systemCatalog?: PortableSystemParameterCatalog;
  systemValues?: PortableSystemParameterValues;
}): PortableModuleControlsApi {
  const { container, params, catalog, controlArgs, systemCatalog, systemValues } = args;
  const explicitCommitMode = controlArgs.textInputCommitMode === "explicit";
  void controlArgs.getWorktopThicknessMm;
  void controlArgs.commitBoundary;

  container.innerHTML = "";

  const fieldByKey = new Map<string, HTMLElement>();
  const controls: PortableFieldControl[] = [];

  const editableRoot = document.createElement("div");
  editableRoot.className = "portable-controls";
  container.appendChild(editableRoot);

  const catalogGroups = new Map(catalog.groups.map((group) => [group.key, group]));
  const groupedParameters = new Map<string, typeof catalog.parameters>();
  for (const parameter of catalog.parameters) {
    if (parameter.key === "type") continue;
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
        description: parameter.description
      });
      fieldByKey.set(parameter.key, wrapper);

      if (parameter.type === "boolean") {
        const input = document.createElement("input");
        input.id = `portable_${parameter.key}`;
        input.type = "checkbox";
        input.style.justifySelf = "start";
        wrapper.appendChild(input);

        const apply = () => {
          setTopLevelValue(params, parameter.key, input.checked);
          controlArgs.onChange();
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
          setTopLevelValue(params, parameter.key, next);
          controlArgs.onChange();
        };

        input.addEventListener(explicitCommitMode ? "change" : "input", apply);
        controls.push({
          key: parameter.key,
          wrapper,
          readFromParams: () => {
            const value = params[parameter.key];
            input.value = typeof value === "number" ? String(value) : "";
          }
        });
        continue;
      }

      if (parameter.type === "string" || parameter.type === "null" || parameter.type === "unknown") {
        const input = document.createElement("input");
        input.id = `portable_${parameter.key}`;
        input.type = "text";
        wrapper.appendChild(input);

        const apply = () => {
          setTopLevelValue(params, parameter.key, input.value);
          controlArgs.onChange();
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

      const input = document.createElement("textarea");
      input.id = `portable_${parameter.key}`;
      input.rows = 2;
      wrapper.appendChild(input);
      title.htmlFor = input.id;

      const apply = () => {
        const parsed = parseJsonValue(input.value);
        if (parsed === undefined) {
          wrapper.classList.add("error");
          return;
        }
        wrapper.classList.remove("error");
        setTopLevelValue(params, parameter.key, cloneValue(parsed));
        controlArgs.onChange();
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
          input.value = JSON.stringify(params[parameter.key] ?? parameter.defaultValue, null, 2);
          wrapper.classList.remove("error");
        }
      });
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
    introHint.textContent = `Module ${systemValues.moduleType} exposes ${systemCatalog.definitions.length} system parameter(s).`;
    systemIntro.appendChild(introHint);

    for (const groupKey of getOrderedGroupKeys(systemCatalog.definitions, systemCatalog.groups)) {
      const definitions = systemDefinitionsByGroup.get(groupKey);
      if (!definitions || definitions.length === 0) continue;

      const group = systemGroups.get(groupKey);
      const groupLabel = group?.label ?? formatKeyLabel(groupKey);
      const groupDescription = group?.description ?? "Imported system parameters.";
      const sectionBody = createSection(systemRoot, groupLabel, groupDescription, "system");

      for (const definition of definitions) {
        const locked = LOCKED_SYSTEM_PARAMETER_KEYS.has(definition.key);
        const value = systemValues.values[definition.key] ?? null;
        const control = createReadonlySystemControl(definition, value);
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
          description: definition.description,
          badges,
          readOnly: true
        });
        wrapper.appendChild(control);
      }
    }
  }

  const syncFromParams = () => {
    for (const control of controls) control.readFromParams();
  };

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
