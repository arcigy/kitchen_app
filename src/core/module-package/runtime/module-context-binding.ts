import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "../../catalog/catalog-types";
import type {
  FurnQuoteModulePackage,
  ModuleContextBinding,
  ModuleContextMaterialFamily,
  ModuleContextMaterialAlias
} from "../module-package-types";

type MaterialSnapshotSlot = {
  slotId: string;
  boardFamily?: string;
  assignedMaterial?: { family?: string };
};

export type ModuleContextBindingSnapshot = {
  slotAssignments?: MaterialSnapshotSlot[];
};

export type ApplyModuleContextBindingsArgs = {
  modulePackage: FurnQuoteModulePackage;
  params: Record<string, unknown>;
  contextType: ModuleContextBinding["contextType"];
  context: Record<string, unknown>;
  catalog: ClientCatalog;
  materialSnapshot?: ModuleContextBindingSnapshot;
};

function readSource(source: string, context: Record<string, unknown>, catalog: ClientCatalog): unknown {
  if (source.startsWith("ctx.")) {
    return source.slice(4).split(".").reduce<unknown>((value, key) => {
      if (!value || typeof value !== "object") return undefined;
      return (value as Record<string, unknown>)[key];
    }, context);
  }
  if (source.startsWith("catalog.")) {
    return source.slice(8).split(".").reduce<unknown>((value, key) => {
      if (!value || typeof value !== "object") return undefined;
      return (value as Record<string, unknown>)[key];
    }, catalog as unknown as Record<string, unknown>);
  }
  if (source.startsWith("constant.")) return source.slice(9);
  return undefined;
}

function matchesFamily(material: MaterialDefinition, family: ModuleContextMaterialFamily) {
  if (family === "shelf") return material.boardFamily === "body";
  return material.boardFamily === family;
}

function getMaterialForFamily(materialId: unknown, family: ModuleContextMaterialFamily, catalog: ClientCatalog) {
  if (typeof materialId === "string") {
    const requested = catalog.materials.find((material) => material.id === materialId) ?? null;
    if (requested?.materialType === "board" && matchesFamily(requested, family)) return requested;
  }
  return catalog.materials.find((material) => material.materialType === "board" && material.isActive && matchesFamily(material, family)) ?? null;
}

function getComponent(componentId: unknown, catalog: ClientCatalog) {
  return typeof componentId === "string" ? catalog.components.find((component) => component.id === componentId) ?? null : null;
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function resolveHandleGeometryKind(component: ComponentDefinition | null): "bar" | "knob" | "none" {
  if (!component || component.componentType !== "handle") return "none";
  return component.id.includes(".knob.") ? "knob" : "bar";
}

function resolveWorktopThickness(material: MaterialDefinition | null, desired: unknown) {
  const desiredNumber = typeof desired === "number" && Number.isFinite(desired) ? desired : undefined;
  const options = material?.availableThicknessesMm?.filter((value) => Number.isFinite(value) && value > 0) ?? [];
  if (!material || options.length === 0) return desiredNumber ?? material?.defaultThicknessMm ?? 0;
  if (desiredNumber != null && options.includes(desiredNumber)) return desiredNumber;
  if (desiredNumber != null) {
    return [...options].sort((left, right) => Math.abs(left - desiredNumber) - Math.abs(right - desiredNumber))[0] ?? material.defaultThicknessMm;
  }
  return material.defaultThicknessMm;
}

function applyMaterialAlias(params: Record<string, unknown>, alias: ModuleContextMaterialAlias, material: MaterialDefinition) {
  const materials = ensureRecord(params, "materials");
  const colorHex = material.preview.colorHex;
  if (alias === "front") {
    params.frontMaterialId = material.id;
    params.frontColor = colorHex;
    materials.frontKey = material.id;
    materials.frontMaterialId = material.id;
    materials.frontName = material.displayName;
    materials.frontColor = colorHex;
    return;
  }
  if (alias === "back") {
    params.backMaterialId = material.id;
    params.backColor = colorHex;
    materials.backKey = material.id;
    materials.backMaterialId = material.id;
    materials.backName = material.displayName;
    materials.backColor = colorHex;
    return;
  }
  if (alias === "drawer_bottom") {
    params.drawerMaterialId = material.id;
    params.drawerColor = colorHex;
    materials.drawerKey = material.id;
    materials.drawerMaterialId = material.id;
    materials.drawerName = material.displayName;
    materials.drawerColor = colorHex;
    return;
  }
  if (alias === "shelf") {
    params.shelfMaterialId = material.id;
    params.shelfColor = colorHex;
    materials.shelfMaterialId = material.id;
    materials.shelfName = material.displayName;
    materials.shelfColor = colorHex;
    return;
  }
  if (alias === "worktop") {
    params.worktopMaterialId = material.id;
    materials.worktopMaterialId = material.id;
    materials.worktopName = material.displayName;
    return;
  }
  params.bodyMaterialId = material.id;
  params.bodyColor = colorHex;
  materials.bodyKey = material.id;
  materials.bodyMaterialId = material.id;
  materials.bodyName = material.displayName;
  materials.bodyColor = colorHex;
  materials.backInsideColor = colorHex;
}

function setBoardSelection(params: Record<string, unknown>, slotId: string, material: MaterialDefinition) {
  const commercialSelections = ensureRecord(params, "commercialSelections");
  const boardMaterials = ensureRecord(commercialSelections, "boardMaterials");
  const boardThicknesses = ensureRecord(commercialSelections, "boardThicknesses");
  boardMaterials[slotId] = material.id;
  boardThicknesses[slotId] = material.defaultThicknessMm;
}

function applyCommercialSelections(
  params: Record<string, unknown>,
  binding: ModuleContextBinding,
  context: Record<string, unknown>,
  catalog: ClientCatalog,
  materialSnapshot?: ModuleContextBindingSnapshot
) {
  const rules = binding.commercialSelectionSync?.filter((rule) => rule.source === "materialSnapshot") ?? [];
  if (rules.length === 0) return;
  const materialForFamily = (family: ModuleContextMaterialFamily) => {
    const sourceField =
      family === "front" ? "frontsMaterialId" :
      family === "back" ? "backMaterialId" :
      family === "drawer_bottom" ? "drawerBottomMaterialId" :
      family === "body" || family === "shelf" ? "corpusMaterialId" :
      null;
    return getMaterialForFamily(sourceField ? context[sourceField] : undefined, family, catalog);
  };

  for (const rule of rules) {
    const allowedFamilies = rule.families ? new Set(rule.families) : null;
    for (const slot of materialSnapshot?.slotAssignments ?? []) {
      const family = (slot.boardFamily ?? slot.assignedMaterial?.family ?? null) as ModuleContextMaterialFamily | null;
      if (!family || family === "worktop" || (allowedFamilies && !allowedFamilies.has(family))) continue;
      const material = materialForFamily(family);
      if (material) setBoardSelection(params, slot.slotId, material);
    }

    for (const dynamicSlot of rule.dynamicSlots ?? []) {
      const rawCount = params[dynamicSlot.countParameter];
      const count = Math.max(0, Math.round(typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0));
      const startIndex = dynamicSlot.startIndex ?? 1;
      const material = materialForFamily(dynamicSlot.family);
      if (!material) continue;
      for (let index = startIndex; index < startIndex + count; index += 1) {
        setBoardSelection(params, dynamicSlot.slotIdPattern.replaceAll("{index}", String(index)), material);
      }
    }
  }
}

export function applyModuleContextBindings(args: ApplyModuleContextBindingsArgs): boolean {
  const bindings = args.modulePackage.behavior?.contextBindings?.filter((binding) => binding.contextType === args.contextType) ?? [];
  if (bindings.length === 0) return false;

  for (const binding of bindings) {
    for (const rule of binding.parameterSync ?? []) {
      const sourceValue = readSource(rule.source, args.context, args.catalog);
      if (rule.mode === "defaultOnly" && args.params[rule.targetParameter] !== undefined) continue;
      if (rule.transform === "resolvedWorktopThickness") {
        const material = getMaterialForFamily(readSource("ctx.worktopMaterialId", args.context, args.catalog), "worktop", args.catalog);
        args.params[rule.targetParameter] = resolveWorktopThickness(material, sourceValue);
      } else {
        args.params[rule.targetParameter] = sourceValue;
      }
    }

    for (const rule of binding.materialSync ?? []) {
      const material = getMaterialForFamily(readSource(rule.source, args.context, args.catalog), rule.family, args.catalog);
      if (!material) continue;
      if (rule.targetParameter) args.params[rule.targetParameter] = material.id;
      if (rule.targetSlot) ensureRecord(args.params, "materialAssignments")[rule.targetSlot] = material.id;
      if (rule.thicknessParameter) args.params[rule.thicknessParameter] = material.defaultThicknessMm;
      for (const alias of rule.aliases ?? []) applyMaterialAlias(args.params, alias, material);
    }

    for (const rule of binding.componentSync ?? []) {
      const component = getComponent(readSource(rule.source, args.context, args.catalog), args.catalog);
      if (!component || (rule.componentType && component.componentType !== rule.componentType)) continue;
      args.params[rule.targetParameter] = component.id;
      if (rule.targetSlot) ensureRecord(args.params, "componentAssignments")[rule.targetSlot] = component.id;
      for (const transform of rule.transforms ?? []) {
        if (transform === "handleGeometryKind") args.params.handleType = resolveHandleGeometryKind(component);
        if (transform === "componentNominalLength") args.params.handleLengthMm = component.nominalLengthMm ?? args.params.handleLengthMm;
      }
    }

    applyCommercialSelections(args.params, binding, args.context, args.catalog, args.materialSnapshot);
  }

  return true;
}
