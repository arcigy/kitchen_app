import type { ClientCatalog } from "../core/catalog/catalog-types";
import type {
  ProjectMaterialQuantity,
  ProjectMaterialWarning
} from "../core/project-materials/project-material-types";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import type {
  KitchenGroup,
  KitchenWorktopInstance,
  LayoutInstance
} from "../layout/appState";
import {
  buildProjectMaterialUsageSummary,
  summarizeMaterialUsage,
  type ProjectMaterialUsageInput
} from "../layout/bom/materialUsageSummary";
import { projectMaterialQuantitiesFromUsageSummary } from "../layout/bom/projectMaterialQuantities";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import {
  makeDefaultKitchenContext,
  resolveContext,
  type KitchenContext
} from "../layout/kitchenContext";

export type ProjectMaterialQuantityResolution = {
  quantities: ProjectMaterialQuantity[];
  warnings: ProjectMaterialWarning[];
};

type SavedProjectMaterialInputs = Pick<
  ProjectMaterialUsageInput,
  "instances" | "worktops" | "customFurniture" | "kitchenContext" | "kitchenGroups"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function calculationWarning(
  id: string,
  description: string,
  affectedObjectId?: string
): ProjectMaterialWarning {
  return {
    id: `material-quantity:${id}`,
    severity: "warning",
    title: "Výpočet množstiev nie je úplný",
    description,
    ...(affectedObjectId ? { affectedObjectId } : {})
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function projectRecord(save: ProjectSaveFile): {
  layout: Record<string, unknown>;
  kitchen: Record<string, unknown>;
  modules: unknown[];
} {
  return {
    layout: isRecord(save.appState.layout) ? save.appState.layout : {},
    kitchen: isRecord(save.appState.kitchen) ? save.appState.kitchen : {},
    modules: Array.isArray(save.appState.modules) ? save.appState.modules : []
  };
}

function readKitchenContext(
  value: unknown,
  fallback: KitchenContext,
  warnings: ProjectMaterialWarning[],
  warningId: string,
  affectedObjectId?: string
): KitchenContext {
  if (!isRecord(value)) return structuredClone(fallback);

  const next: Record<string, unknown> = { ...fallback };
  const invalidKeys: string[] = [];
  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const candidate = value[key];
    if (candidate === undefined) continue;
    if (typeof fallbackValue === "number") {
      if (typeof candidate === "number" && Number.isFinite(candidate)) next[key] = candidate;
      else invalidKeys.push(key);
      continue;
    }
    if (typeof fallbackValue === "string") {
      if (typeof candidate === "string") next[key] = candidate;
      else invalidKeys.push(key);
    }
  }

  if (!["auto", "warn", "ignore"].includes(String(next.fillerStrategy))) {
    next.fillerStrategy = fallback.fillerStrategy;
    invalidKeys.push("fillerStrategy");
  }
  if (invalidKeys.length > 0) {
    warnings.push(calculationWarning(
      warningId,
      `Neplatné hodnoty kuchynského kontextu boli nahradené bezpečnými predvolenými hodnotami: ${[...new Set(invalidKeys)].join(", ")}.`,
      affectedObjectId
    ));
  }
  return resolveContext(next as unknown as KitchenContext);
}

function readModules(
  moduleValues: readonly unknown[],
  layoutSnapshot: Record<string, unknown>,
  warnings: ProjectMaterialWarning[]
): ProjectMaterialUsageInput["instances"] {
  const snapshotInstances = Array.isArray(layoutSnapshot.instances) ? layoutSnapshot.instances : [];
  const candidates = moduleValues.length > 0 ? moduleValues : snapshotInstances;
  const instances: Array<Pick<LayoutInstance, "id" | "params" | "kitchenGroupId">> = [];
  const ids = new Set<string>();

  candidates.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      warnings.push(calculationWarning(`invalid-module-${index}`, "Uložený modul nemá platný dátový formát."));
      return;
    }
    const id = nonEmptyString(candidate.id);
    const rawParams = isRecord(candidate.params) ? candidate.params : null;
    const type = nonEmptyString(rawParams?.type) ?? nonEmptyString(candidate.type);
    if (!id || !rawParams || !type) {
      warnings.push(calculationWarning(
        `invalid-module-${id ?? index}`,
        `Uložený modul ${id ?? `#${index + 1}`} nemá ID, typ alebo parametre a nebol započítaný.`,
        id ?? undefined
      ));
      return;
    }
    if (ids.has(id)) {
      warnings.push(calculationWarning(`duplicate-module-${id}`, `Modul ${id} je v save súbore duplicitný a bol započítaný iba raz.`, id));
      return;
    }
    ids.add(id);
    instances.push({
      id,
      params: { ...structuredClone(rawParams), type } as LayoutInstance["params"],
      kitchenGroupId: nonEmptyString(candidate.kitchenGroupId)
    });
  });

  return instances as unknown as ProjectMaterialUsageInput["instances"];
}

function readWorktops(
  layoutSnapshot: Record<string, unknown>,
  warnings: ProjectMaterialWarning[]
): ProjectMaterialUsageInput["worktops"] {
  const values = Array.isArray(layoutSnapshot.worktops) ? layoutSnapshot.worktops : [];
  const worktops: Array<Pick<KitchenWorktopInstance, "id" | "kitchenGroupId" | "params">> = [];
  values.forEach((value, index) => {
    if (!isRecord(value)) return;
    const id = nonEmptyString(value.id);
    if (!id || !isRecord(value.params)) {
      warnings.push(calculationWarning(
        `invalid-worktop-${id ?? index}`,
        `Uložená pracovná doska ${id ?? `#${index + 1}`} nemá ID alebo parametre a nebola započítaná.`,
        id ?? undefined
      ));
      return;
    }
    worktops.push({
      id,
      kitchenGroupId: nonEmptyString(value.kitchenGroupId) ?? "",
      params: structuredClone(value.params) as unknown as KitchenWorktopInstance["params"]
    });
  });
  return worktops as unknown as ProjectMaterialUsageInput["worktops"];
}

function readCustomFurniture(
  layoutSnapshot: Record<string, unknown>,
  warnings: ProjectMaterialWarning[]
): ProjectMaterialUsageInput["customFurniture"] {
  const values = Array.isArray(layoutSnapshot.customFurniture) ? layoutSnapshot.customFurniture : [];
  const furniture: Array<Pick<CustomFurnitureInstance, "id" | "params">> = [];
  values.forEach((value, index) => {
    if (!isRecord(value)) return;
    const id = nonEmptyString(value.id);
    if (!id || !isRecord(value.params)) {
      warnings.push(calculationWarning(
        `invalid-custom-furniture-${id ?? index}`,
        `Uložený vlastný nábytok ${id ?? `#${index + 1}`} nemá ID alebo parametre a nebol započítaný.`,
        id ?? undefined
      ));
      return;
    }
    furniture.push({
      id,
      params: structuredClone(value.params) as unknown as CustomFurnitureInstance["params"]
    });
  });
  return furniture as unknown as ProjectMaterialUsageInput["customFurniture"];
}

export function resolveProjectMaterialInputs(
  save: ProjectSaveFile,
  catalog: ClientCatalog,
  warnings: ProjectMaterialWarning[]
): SavedProjectMaterialInputs {
  const project = projectRecord(save);
  const layoutSnapshot = isRecord(project.layout.snapshot) ? project.layout.snapshot : {};
  const fallbackContext = resolveContext(makeDefaultKitchenContext(catalog));
  const kitchenContext = readKitchenContext(
    project.kitchen.context,
    fallbackContext,
    warnings,
    "invalid-kitchen-context"
  );
  const groups: KitchenGroup[] = [];
  const groupValues = Array.isArray(project.kitchen.groups) ? project.kitchen.groups : [];
  groupValues.forEach((value, index) => {
    if (!isRecord(value)) return;
    const id = nonEmptyString(value.id);
    if (!id) {
      warnings.push(calculationWarning(`invalid-kitchen-group-${index}`, `Kuchynská skupina #${index + 1} nemá ID a jej kontext nebol použitý.`));
      return;
    }
    groups.push({
      id,
      name: nonEmptyString(value.name) ?? id,
      ctx: readKitchenContext(value.ctx, kitchenContext, warnings, `invalid-kitchen-group-context-${id}`, id),
      instanceIds: Array.isArray(value.instanceIds)
        ? value.instanceIds.filter((item): item is string => typeof item === "string")
        : []
    });
  });

  return {
    instances: readModules(project.modules, layoutSnapshot, warnings),
    worktops: readWorktops(layoutSnapshot, warnings),
    customFurniture: readCustomFurniture(layoutSnapshot, warnings),
    kitchenContext,
    kitchenGroups: groups
  };
}

function warningsFromCalculation(messages: readonly string[]): ProjectMaterialWarning[] {
  return messages.map((description) => {
    const objectMatch = /^Modul\s+([^:]+):/u.exec(description);
    return calculationWarning(
      `calculation-${stableHash(description)}`,
      description,
      objectMatch?.[1]
    );
  });
}

function uniqueWarnings(warnings: readonly ProjectMaterialWarning[]): ProjectMaterialWarning[] {
  return [...new Map(warnings.map((warning) => [warning.id, warning])).values()];
}

export function resolveProjectMaterialQuantities(
  save: ProjectSaveFile,
  catalog: ClientCatalog
): ProjectMaterialQuantityResolution {
  const warnings: ProjectMaterialWarning[] = [];
  const inputs = resolveProjectMaterialInputs(save, catalog, warnings);
  let summary;
  try {
    summary = buildProjectMaterialUsageSummary({ ...inputs, catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "neznáma chyba";
    summary = summarizeMaterialUsage([], [`Projektové množstvá sa nepodarilo vypočítať (${message}).`]);
  }
  warnings.push(...warningsFromCalculation(summary.warnings));
  return {
    quantities: projectMaterialQuantitiesFromUsageSummary(summary),
    warnings: uniqueWarnings(warnings)
  };
}
