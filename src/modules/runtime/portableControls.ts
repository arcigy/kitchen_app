type PortableJsonValue =
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

function createFieldShell(container: HTMLElement, key: string, label: string, description: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const title = document.createElement("label");
  title.textContent = label;
  title.htmlFor = `portable_${key}`;

  const help = document.createElement("small");
  help.textContent = description;
  help.style.opacity = "0.75";

  wrapper.appendChild(title);
  wrapper.appendChild(help);
  container.appendChild(wrapper);
  return { wrapper, title };
}

export function createPortableModuleControls<T extends Record<string, unknown>>(args: {
  container: HTMLElement;
  params: T;
  catalog: PortableParameterCatalog;
  controlArgs: PortableModuleControlsArgs;
}): PortableModuleControlsApi {
  const { container, params, catalog, controlArgs } = args;
  const explicitCommitMode = controlArgs.textInputCommitMode === "explicit";
  void controlArgs.getWorktopThicknessMm;
  void controlArgs.commitBoundary;

  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  container.appendChild(grid);

  const fieldByKey = new Map<string, HTMLElement>();
  const controls: PortableFieldControl[] = [];

  const catalogGroups = new Map(catalog.groups.map((group) => [group.key, group]));
  const groupedParameters = new Map<string, typeof catalog.parameters>();
  for (const parameter of catalog.parameters) {
    if (parameter.key === "type") continue;
    const bucket = groupedParameters.get(parameter.group) ?? [];
    bucket.push(parameter);
    groupedParameters.set(parameter.group, bucket);
  }

  for (const [groupKey, parameters] of groupedParameters) {
    const group = catalogGroups.get(groupKey);
    if (group) {
      const heading = document.createElement("div");
      heading.style.gridColumn = "1 / -1";
      heading.innerHTML = `<strong>${group.label}</strong><div style="opacity:.75">${group.description}</div>`;
      grid.appendChild(heading);
    }

    for (const parameter of parameters) {
      const { wrapper, title } = createFieldShell(grid, parameter.key, parameter.key, parameter.description);
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
      input.rows = 4;
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
