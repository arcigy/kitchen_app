import type {
  BoardFamily,
  ClientCatalog,
  ComponentDefinition,
  ComponentType,
  KitchenDefaults,
  MaterialDefinition,
  PricingUnit
} from "../catalog/catalog-types";
import {
  PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
  type CatalogItemSnapshot,
  type JsonValue,
  type MaterialAssignmentCategory,
  type ProjectMaterialAssignment,
  type ProjectMaterialAssignmentsState,
  type ProjectMaterialQuantity,
  type ProjectMaterialsView,
  type ProjectMaterialWarning
} from "./project-material-types";

type MaterialDefaultKey = keyof Pick<
  KitchenDefaults,
  | "carcassMaterialId"
  | "frontMaterialId"
  | "worktopMaterialId"
  | "plinthMaterialId"
  | "backPanelMaterialId"
  | "drawerBottomMaterialId"
>;

type ComponentDefaultKey = keyof Pick<
  KitchenDefaults,
  "defaultHandleComponentId" | "defaultHingeComponentId"
>;

export type MaterialAssignmentCategoryDefinition = {
  category: MaterialAssignmentCategory;
  label: string;
  description: string;
  kind: "material" | "component";
  idField: "materialId" | "componentId";
  quantityUnit: PricingUnit;
  alwaysVisible: boolean;
  requiredByDefault: boolean;
  materialType?: MaterialDefinition["materialType"];
  boardFamilies?: readonly BoardFamily[];
  componentTypes?: readonly ComponentType[];
  defaultCatalogKey?: MaterialDefaultKey | ComponentDefaultKey;
};

export type ProjectMaterialDefaultOverrides = Partial<Record<MaterialAssignmentCategory, string>>;

export const MATERIAL_ASSIGNMENT_CATEGORIES = [
  {
    category: "corpus",
    label: "Korpus",
    description: "Korpusové dosky a police",
    kind: "material",
    idField: "materialId",
    quantityUnit: "m2",
    alwaysVisible: true,
    requiredByDefault: true,
    materialType: "board",
    boardFamilies: ["body", "shelf"],
    defaultCatalogKey: "carcassMaterialId"
  },
  {
    category: "front",
    label: "Fronty",
    description: "Dvierka a čelá zásuviek",
    kind: "material",
    idField: "materialId",
    quantityUnit: "m2",
    alwaysVisible: true,
    requiredByDefault: true,
    materialType: "board",
    boardFamilies: ["front"],
    defaultCatalogKey: "frontMaterialId"
  },
  {
    category: "worktop",
    label: "Pracovná doska",
    description: "Pracovné dosky projektu",
    kind: "material",
    idField: "materialId",
    quantityUnit: "m2",
    alwaysVisible: true,
    requiredByDefault: false,
    materialType: "board",
    boardFamilies: ["worktop"],
    defaultCatalogKey: "worktopMaterialId"
  },
  {
    category: "plinth",
    label: "Sokel",
    description: "Soklové dosky a profily",
    kind: "material",
    idField: "materialId",
    quantityUnit: "lm",
    alwaysVisible: true,
    requiredByDefault: false,
    materialType: "board",
    boardFamilies: ["body"],
    defaultCatalogKey: "plinthMaterialId"
  },
  {
    category: "back",
    label: "Chrbát",
    description: "Zadné dosky skriniek",
    kind: "material",
    idField: "materialId",
    quantityUnit: "m2",
    alwaysVisible: true,
    requiredByDefault: true,
    materialType: "board",
    boardFamilies: ["back"],
    defaultCatalogKey: "backPanelMaterialId"
  },
  {
    category: "drawer_bottom",
    label: "Dná zásuviek",
    description: "Dná a drevené diely zásuviek",
    kind: "material",
    idField: "materialId",
    quantityUnit: "m2",
    alwaysVisible: false,
    requiredByDefault: false,
    materialType: "board",
    boardFamilies: ["drawer_bottom", "drawer_box"],
    defaultCatalogKey: "drawerBottomMaterialId"
  },
  {
    category: "edge_front",
    label: "Hrany frontov",
    description: "Olepovanie dielov a čiel vo fronte",
    kind: "material",
    idField: "materialId",
    quantityUnit: "lm",
    alwaysVisible: true,
    requiredByDefault: false,
    materialType: "edge"
  },
  {
    category: "edge_other",
    label: "Hrany korpusu",
    description: "Olepovanie korpusových dosiek a políc",
    kind: "material",
    idField: "materialId",
    quantityUnit: "lm",
    alwaysVisible: true,
    requiredByDefault: false,
    materialType: "edge"
  },
  {
    category: "handle",
    label: "Úchytky",
    description: "Úchytky dvierok a zásuviek",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["handle"],
    defaultCatalogKey: "defaultHandleComponentId"
  },
  {
    category: "hinge",
    label: "Pánty",
    description: "Pánty a súvisiace kovanie",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["hinge"],
    defaultCatalogKey: "defaultHingeComponentId"
  },
  {
    category: "runner",
    label: "Zásuvkové výsuvy",
    description: "Výsuvy a zásuvkové systémy",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["runner"]
  },
  {
    category: "lift_up",
    label: "Výklopy",
    description: "Výklopné mechanizmy",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["lift_up"]
  },
  {
    category: "leg",
    label: "Nožičky",
    description: "Nábytkové nožičky",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["leg"]
  },
  {
    category: "fastener",
    label: "Spojovací materiál",
    description: "Spojovací a montážny materiál",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false,
    componentTypes: ["fastener", "plinth_clip", "shelf_support", "hanging_bracket"]
  },
  {
    category: "other_component",
    label: "Ostatné komponenty",
    description: "Ostatné katalógové komponenty projektu",
    kind: "component",
    idField: "componentId",
    quantityUnit: "pcs",
    alwaysVisible: true,
    requiredByDefault: false
  }
] as const satisfies readonly MaterialAssignmentCategoryDefinition[];

const CATEGORY_BY_ID = new Map<MaterialAssignmentCategory, MaterialAssignmentCategoryDefinition>(
  MATERIAL_ASSIGNMENT_CATEGORIES.map((definition) => [definition.category, definition])
);

function snapshotMaterial(catalog: ClientCatalog, id: string | undefined, capturedAt: string) {
  if (!id) return undefined;
  const definition = catalog.materials.find((material) => material.id === id);
  if (!definition) return undefined;
  return {
    definition: structuredClone(definition),
    unitPrice: finitePrice(catalog.priceList.prices[id]),
    currency: catalog.priceList.currency,
    priceListId: catalog.priceList.id,
    capturedAt
  } satisfies CatalogItemSnapshot<MaterialDefinition>;
}

function snapshotComponent(catalog: ClientCatalog, id: string | undefined, capturedAt: string) {
  if (!id) return undefined;
  const definition = catalog.components.find((component) => component.id === id);
  if (!definition) return undefined;
  return {
    definition: structuredClone(definition),
    unitPrice: finitePrice(catalog.priceList.prices[id]),
    currency: catalog.priceList.currency,
    priceListId: catalog.priceList.id,
    capturedAt
  } satisfies CatalogItemSnapshot<ComponentDefinition>;
}

function finitePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function defaultCatalogId(
  catalog: ClientCatalog,
  definition: MaterialAssignmentCategoryDefinition,
  overrides: ProjectMaterialDefaultOverrides
): string | undefined {
  const override = overrides[definition.category]?.trim();
  if (override) {
    const validOverride = definition.kind === "material"
      ? catalog.materials.some((item) => item.id === override && isMaterialAllowedForCategory(item, definition.category))
      : catalog.components.some((item) => item.id === override && isComponentAllowedForCategory(item, definition.category));
    if (validOverride) return override;
  }
  if (definition.defaultCatalogKey) {
    const value = catalog.kitchenDefaults[definition.defaultCatalogKey];
    if (typeof value === "string" && value.trim()) {
      const id = value.trim();
      const validDefault = definition.kind === "material"
        ? catalog.materials.some((item) => item.id === id && item.isActive && isMaterialAllowedForCategory(item, definition.category))
        : catalog.components.some((item) => item.id === id && item.isActive && isComponentAllowedForCategory(item, definition.category));
      if (validDefault) return id;
    }
  }
  if (definition.category === "other_component") return undefined;
  if (definition.kind === "material") {
    return catalog.materials.find((item) => item.isActive && isMaterialAllowedForCategory(item, definition.category))?.id;
  }
  return catalog.components.find((item) => item.isActive && isComponentAllowedForCategory(item, definition.category))?.id;
}

function assignmentForCategory(
  catalog: ClientCatalog,
  definition: MaterialAssignmentCategoryDefinition,
  capturedAt: string,
  overrides: ProjectMaterialDefaultOverrides
): ProjectMaterialAssignment {
  const catalogId = defaultCatalogId(catalog, definition, overrides);
  if (definition.kind === "material") {
    const snapshot = snapshotMaterial(catalog, catalogId, capturedAt);
    return {
      assignmentId: `material-assignment:${definition.category}`,
      category: definition.category,
      kind: "material",
      ...(catalogId ? { materialId: catalogId } : {}),
      ...(snapshot ? { thicknessMm: snapshot.definition.defaultThicknessMm } : {}),
      customValues: {},
      source: "auto",
      snapshots: snapshot ? { material: snapshot } : {},
      updatedAt: capturedAt
    };
  }

  const snapshot = snapshotComponent(catalog, catalogId, capturedAt);
  return {
    assignmentId: `material-assignment:${definition.category}`,
    category: definition.category,
    kind: "component",
    ...(catalogId ? { componentId: catalogId } : {}),
    customValues: {},
    source: "auto",
    snapshots: snapshot ? { component: snapshot } : {},
    updatedAt: capturedAt
  };
}

export function getMaterialAssignmentCategoryDefinition(category: MaterialAssignmentCategory): MaterialAssignmentCategoryDefinition {
  const definition = CATEGORY_BY_ID.get(category);
  if (!definition) throw new Error(`Unsupported project material category: ${category}`);
  return definition;
}

export function isMaterialAllowedForCategory(material: MaterialDefinition, category: MaterialAssignmentCategory): boolean {
  const definition = getMaterialAssignmentCategoryDefinition(category);
  if (
    definition.kind !== "material" ||
    material.materialType !== definition.materialType ||
    material.pricingUnit !== definition.quantityUnit
  ) return false;
  return !definition.boardFamilies?.length || (!!material.boardFamily && definition.boardFamilies.includes(material.boardFamily));
}

export function isComponentAllowedForCategory(component: ComponentDefinition, category: MaterialAssignmentCategory): boolean {
  const definition = getMaterialAssignmentCategoryDefinition(category);
  if (definition.kind !== "component" || component.pricingUnit !== definition.quantityUnit) return false;
  return !definition.componentTypes?.length || definition.componentTypes.includes(component.componentType);
}

export function createDefaultProjectMaterialAssignments(
  catalog: ClientCatalog,
  now = new Date().toISOString(),
  overrides: ProjectMaterialDefaultOverrides = {}
): ProjectMaterialAssignmentsState {
  return {
    schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
    initialized: true,
    revision: 0,
    assignments: MATERIAL_ASSIGNMENT_CATEGORIES
      .filter((definition) => definition.category !== "runner")
      .map((definition) => assignmentForCategory(catalog, definition, now, overrides)),
    updatedAt: now
  };
}

export function normalizeAutoProjectMaterialAssignments(
  state: ProjectMaterialAssignmentsState,
  catalog: ClientCatalog,
  now = new Date().toISOString()
): ProjectMaterialAssignmentsState {
  if (!state.initialized) return createDefaultProjectMaterialAssignments(catalog, now);
  const defaults = createDefaultProjectMaterialAssignments(catalog, now);
  const defaultByCategory = new Map(defaults.assignments.map((assignment) => [assignment.category, assignment]));
  const assignments = state.assignments.map((assignment) => {
    if (assignment.source !== "auto") return structuredClone(assignment);
    const currentDefault = defaultByCategory.get(assignment.category);
    const valid = assignment.kind === "material"
      ? !assignment.materialId || catalog.materials.some((item) =>
        item.id === assignment.materialId && item.isActive && isMaterialAllowedForCategory(item, assignment.category)
      )
      : !assignment.componentId || catalog.components.some((item) =>
        item.id === assignment.componentId && item.isActive && isComponentAllowedForCategory(item, assignment.category)
      );
    const usesCurrentDefault = assignment.category !== "front" || (assignment.kind === "material"
      ? assignment.materialId === currentDefault?.materialId
      : assignment.componentId === currentDefault?.componentId);
    return structuredClone(valid && usesCurrentDefault ? assignment : currentDefault ?? assignment);
  });
  const presentCategories = new Set(assignments.map((assignment) => assignment.category));
  for (const definition of MATERIAL_ASSIGNMENT_CATEGORIES.filter((entry) => entry.category !== "runner")) {
    if (presentCategories.has(definition.category)) continue;
    const fallback = defaultByCategory.get(definition.category);
    if (fallback) assignments.push(structuredClone(fallback));
  }
  return { ...structuredClone(state), assignments };
}

export function validateProjectMaterialAssignments(
  state: ProjectMaterialAssignmentsState,
  catalog: ClientCatalog
): ProjectMaterialWarning[] {
  const warnings: ProjectMaterialWarning[] = [];
  const byCategory = new Map<string, ProjectMaterialAssignment[]>();

  for (const assignment of state.assignments.filter(isGeneralMaterialAssignment)) {
    const key = `${assignment.category}:${assignment.variantKey ?? "default"}`;
    const matches = byCategory.get(key) ?? [];
    matches.push(assignment);
    byCategory.set(key, matches);
  }

  for (const definition of MATERIAL_ASSIGNMENT_CATEGORIES) {
    const categoryGroups = [...byCategory.entries()].filter(([key]) => key.startsWith(`${definition.category}:`));
    for (const [key, duplicateAssignments] of categoryGroups) {
      if (duplicateAssignments.length <= 1) continue;
      warnings.push(warning(
        `duplicate:${key}`,
        "error",
        "Duplicitné priradenie",
        `Kategória ${definition.label} má viac než jedno priradenie pre rovnaký variant.`,
        definition.category
      ));
    }

    const assignments = categoryGroups.flatMap(([, values]) => values);

    const assignment = assignments.find((item) => item.assignmentId === `material-assignment:${definition.category}`) ?? assignments[0];
    if (!assignment) {
      if (definition.requiredByDefault) {
        warnings.push(warning(
          `missing-assignment:${definition.category}`,
          "warning",
          "Chýba priradenie",
          `Kategória ${definition.label} nemá vytvorené priradenie.`,
          definition.category
        ));
      }
      continue;
    }

    if (assignment.kind !== definition.kind) {
      warnings.push(warning(
        `kind:${assignment.assignmentId}`,
        "error",
        "Nesprávny typ priradenia",
        `Kategória ${definition.label} očakáva ${definition.kind === "material" ? "materiál" : "komponent"}.`,
        definition.category,
        assignment.assignmentId
      ));
      continue;
    }

    if (definition.kind === "material") validateMaterialAssignment(assignment, definition, catalog, warnings);
    else validateComponentAssignment(assignment, definition, catalog, warnings);
  }

  validateEdgeWidths(state, warnings);

  return uniqueWarnings(warnings);
}

function isGeneralMaterialAssignment(assignment: ProjectMaterialAssignment): boolean {
  const id = assignment.assignmentId;
  if (id.startsWith("material-assignment:module:") || id.startsWith("material-assignment:addition:")) return false;
  if (
    (assignment.category === "edge_front" || assignment.category === "edge_other") &&
    id.startsWith(`material-assignment:${assignment.category}:split:`)
  ) {
    return false;
  }
  return true;
}

function validateEdgeWidths(state: ProjectMaterialAssignmentsState, warnings: ProjectMaterialWarning[]): void {
  const boardThickness = (category: "corpus" | "front") => state.assignments.find((assignment) => assignment.assignmentId === `material-assignment:${category}`)?.thicknessMm;
  for (const edge of state.assignments.filter((assignment) => assignment.category === "edge_front" || assignment.category === "edge_other")) {
    const bridge = edge.customValues.supplierBridge;
    const data = bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge as Record<string, JsonValue> : null;
    const edgeWidth = typeof data?.edgeWidthMm === "number" ? data.edgeWidthMm : null;
    const owner = edge.category === "edge_front" ? "front" : "corpus";
    const expected = boardThickness(owner);
    if (edgeWidth == null || expected == null || Math.abs(edgeWidth - expected) <= 0.5) continue;
    warnings.push(warning(
      `edge-width-mismatch:${edge.assignmentId}`,
      "warning",
      "Šírka hrany nesedí s doskou",
      `${owner === "front" ? "Front" : "Korpus"} má hrúbku ${expected} mm, ale priradená hrana má šírku ${edgeWidth} mm.`,
      edge.category,
      edge.assignmentId
    ));
  }
}

function validateMaterialAssignment(
  assignment: ProjectMaterialAssignment,
  definition: MaterialAssignmentCategoryDefinition,
  catalog: ClientCatalog,
  warnings: ProjectMaterialWarning[]
): void {
  const id = assignment.materialId?.trim();
  if (!id) {
    if (definition.requiredByDefault) {
      warnings.push(warning(
        `missing-material:${definition.category}`,
        "warning",
        "Chýba materiál",
        `Zadajte ID materiálu pre kategóriu ${definition.label}.`,
        definition.category,
        assignment.assignmentId
      ));
    }
    return;
  }

  const material = catalog.materials.find((candidate) => candidate.id === id);
  if (!material) {
    warnings.push(warning(
      `invalid-material:${assignment.assignmentId}`,
      "error",
      "Neplatné ID materiálu",
      `Materiál ${id} sa v tenant katalógu nenašiel.`,
      definition.category,
      assignment.assignmentId
    ));
    return;
  }
  if (!material.isActive) {
    warnings.push(warning(
      `inactive-material:${assignment.assignmentId}`,
      "warning",
      "Materiál je neaktívny",
      `${material.displayName} už nie je aktívny v tenant katalógu.`,
      definition.category,
      assignment.assignmentId
    ));
  }
  if (material.pricingUnit !== definition.quantityUnit) {
    warnings.push(warning(
      `pricing-unit:${assignment.assignmentId}`,
      "error",
      "Nekompatibilná jednotka ceny",
      `${material.displayName} má cenu za ${material.pricingUnit}, ale ${definition.label} sa počíta v ${definition.quantityUnit}.`,
      definition.category,
      assignment.assignmentId
    ));
  } else if (!isMaterialAllowedForCategory(material, definition.category)) {
    warnings.push(warning(
      `material-category:${assignment.assignmentId}`,
      "error",
      "Materiál nepatrí do kategórie",
      `${material.displayName} nemožno použiť pre ${definition.label}.`,
      definition.category,
      assignment.assignmentId
    ));
  }
  if (
    typeof assignment.thicknessMm === "number" &&
    material.availableThicknessesMm.length > 0 &&
    !material.availableThicknessesMm.some((thickness) => Math.abs(thickness - assignment.thicknessMm!) < 0.001)
  ) {
    warnings.push(warning(
      `unsupported-thickness:${assignment.assignmentId}`,
      "warning",
      "Nepodporovaná hrúbka",
      `${material.displayName} nie je dostupný v hrúbke ${assignment.thicknessMm} mm.`,
      definition.category,
      assignment.assignmentId
    ));
  }
}

function validateComponentAssignment(
  assignment: ProjectMaterialAssignment,
  definition: MaterialAssignmentCategoryDefinition,
  catalog: ClientCatalog,
  warnings: ProjectMaterialWarning[]
): void {
  const id = assignment.componentId?.trim();
  if (!id) return;
  const component = catalog.components.find((candidate) => candidate.id === id);
  if (!component) {
    warnings.push(warning(
      `invalid-component:${assignment.assignmentId}`,
      "error",
      "Neplatné ID komponentu",
      `Komponent ${id} sa v tenant katalógu nenašiel.`,
      definition.category,
      assignment.assignmentId
    ));
    return;
  }
  if (!component.isActive) {
    warnings.push(warning(
      `inactive-component:${assignment.assignmentId}`,
      "warning",
      "Komponent je neaktívny",
      `${component.displayName} už nie je aktívny v tenant katalógu.`,
      definition.category,
      assignment.assignmentId
    ));
  }
  if (component.pricingUnit !== definition.quantityUnit) {
    warnings.push(warning(
      `pricing-unit:${assignment.assignmentId}`,
      "error",
      "Nekompatibilná jednotka ceny",
      `${component.displayName} má cenu za ${component.pricingUnit}, ale ${definition.label} sa počíta v ${definition.quantityUnit}.`,
      definition.category,
      assignment.assignmentId
    ));
  } else if (!isComponentAllowedForCategory(component, definition.category)) {
    warnings.push(warning(
      `component-category:${assignment.assignmentId}`,
      "error",
      "Komponent nepatrí do kategórie",
      `${component.displayName} nemožno použiť pre ${definition.label}.`,
      definition.category,
      assignment.assignmentId
    ));
  }
}

function warning(
  id: string,
  severity: ProjectMaterialWarning["severity"],
  title: string,
  description: string,
  affectedCategory: MaterialAssignmentCategory,
  affectedObjectId?: string
): ProjectMaterialWarning {
  return { id, severity, title, description, affectedCategory, ...(affectedObjectId ? { affectedObjectId } : {}) };
}

function uniqueWarnings(warnings: readonly ProjectMaterialWarning[]): ProjectMaterialWarning[] {
  return [...new Map(warnings.map((item) => [item.id, item])).values()];
}

function lastSynchronizedAt(catalog: ClientCatalog): string | null {
  const value = catalog.meta.lastSynchronizedAt;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function createProjectMaterialsView(
  state: ProjectMaterialAssignmentsState,
  quantities: readonly ProjectMaterialQuantity[],
  catalog: ClientCatalog
): ProjectMaterialsView {
  const warnings = validateProjectMaterialAssignments(state, catalog);
  const assignmentByCategory = new Map(state.assignments
    .filter((assignment) => assignment.assignmentId === `material-assignment:${assignment.category}`)
    .map((assignment) => [assignment.category, assignment]));

  for (const quantity of quantities) {
    if (!Number.isFinite(quantity.quantity) || quantity.quantity <= 0) continue;
    const definition = CATEGORY_BY_ID.get(quantity.category);
    const assignment = assignmentByCategory.get(quantity.category);
    if (!definition || !assignment) continue;
    const hasId = definition.kind === "material" ? !!assignment.materialId?.trim() : !!assignment.componentId?.trim();
    if (hasId) continue;
    const missingTitle = quantity.category === "edge_front" || quantity.category === "edge_other"
      ? "Chýba hrana"
      : definition.kind === "material" ? "Chýba materiál" : "Chýba komponent";
    warnings.push(warning(
      `missing-used:${quantity.category}`,
      "warning",
      missingTitle,
      `${definition.label} sa v projekte používa, ale nemá priradené katalógové ID.`,
      quantity.category,
      assignment.assignmentId
    ));
  }

  return {
    assignments: structuredClone(state),
    quantities: structuredClone([...quantities]),
    warnings: uniqueWarnings(warnings),
    priceSource: {
      priceListId: catalog.priceList.id,
      name: catalog.priceList.name,
      currency: catalog.priceList.currency,
      source: catalog.meta.source,
      lastSynchronizedAt: lastSynchronizedAt(catalog)
    }
  };
}
