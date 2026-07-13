import type { ComponentDefinition, MaterialDefinition, PriceList, PricingUnit } from "../catalog/catalog-types";

export const PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION = 1 as const;

export type MaterialAssignmentCategory =
  | "corpus"
  | "front"
  | "worktop"
  | "plinth"
  | "back"
  | "drawer_bottom"
  | "edge_front"
  | "edge_other"
  | "handle"
  | "hinge"
  | "runner"
  | "lift_up"
  | "leg"
  | "fastener"
  | "other_component";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type CatalogItemSnapshot<TDefinition extends MaterialDefinition | ComponentDefinition> = {
  definition: TDefinition;
  unitPrice: number | null;
  currency: string;
  priceListId: string | null;
  capturedAt: string;
};

export type ProjectMaterialAssignment = {
  assignmentId: string;
  category: MaterialAssignmentCategory;
  kind: "material" | "component";
  materialId?: string;
  componentId?: string;
  edgeFrontId?: string;
  edgeOtherId?: string;
  thicknessMm?: number;
  customValues: JsonObject;
  source: "auto" | "user";
  snapshots: {
    material?: CatalogItemSnapshot<MaterialDefinition>;
    component?: CatalogItemSnapshot<ComponentDefinition>;
    edgeFront?: CatalogItemSnapshot<MaterialDefinition>;
    edgeOther?: CatalogItemSnapshot<MaterialDefinition>;
  };
  updatedAt: string;
};

export type ProjectMaterialAssignmentsState = {
  schemaVersion: typeof PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION;
  initialized: boolean;
  revision: number;
  assignments: ProjectMaterialAssignment[];
  updatedAt?: string;
};

export type ProjectMaterialWarningSeverity = "info" | "warning" | "error";

export type ProjectMaterialWarning = {
  id: string;
  severity: ProjectMaterialWarningSeverity;
  title: string;
  description: string;
  affectedObjectId?: string;
  affectedCategory?: MaterialAssignmentCategory;
};

export type ProjectMaterialQuantity = {
  category: MaterialAssignmentCategory;
  quantity: number;
  unit: PricingUnit;
  pieces?: number;
};

export type ProjectMaterialPriceSource = {
  priceListId: string;
  name: string;
  currency: PriceList["currency"];
  source: string;
  lastSynchronizedAt: string | null;
};

export type ProjectMaterialScopeKind = "module" | "addition";

export type ProjectMaterialScopeItem = {
  id: string;
  category: MaterialAssignmentCategory;
  label: string;
  description: string;
  quantity: number;
  unit: PricingUnit;
  pieces: number;
};

export type ProjectMaterialScope = {
  id: string;
  kind: ProjectMaterialScopeKind;
  label: string;
  items: ProjectMaterialScopeItem[];
};

export type ProjectMaterialsView = {
  assignments: ProjectMaterialAssignmentsState;
  quantities: ProjectMaterialQuantity[];
  warnings: ProjectMaterialWarning[];
  priceSource: ProjectMaterialPriceSource;
  scopes?: ProjectMaterialScope[];
};

export function createEmptyProjectMaterialAssignmentsState(): ProjectMaterialAssignmentsState {
  return {
    schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
    initialized: false,
    revision: 0,
    assignments: []
  };
}
