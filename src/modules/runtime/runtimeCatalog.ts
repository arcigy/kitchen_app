import type {
  ClientCatalog,
  ComponentDefinition,
  ComponentGeometryDefinition,
  ComponentType,
  MaterialDefinition
} from "../../core/catalog/catalog-types";

export type MaterialFallbackKind = "carcass" | "front" | "worktop" | "plinth" | "backPanel" | "drawer";

export type ResolvedRenderMaterial = {
  id: string;
  displayName: string;
  colorHex: string;
  roughness: number;
  metalness: number;
  thicknessMm: number | null;
  source: "catalog" | "system-placeholder";
};

export type ModuleRuntimeCatalogContext = {
  catalog: ClientCatalog;
  getMaterialById(materialId: string | undefined | null): MaterialDefinition | undefined;
  getComponentById(componentId: string | undefined | null): ComponentDefinition | undefined;
  getComponentGeometryById(geometryId: string | undefined | null): ComponentGeometryDefinition | undefined;
  getComponentGeometryForComponentId(componentId: string | undefined | null): ComponentGeometryDefinition | undefined;
  resolveMaterialId(materialId: string | undefined | null, fallbackKind?: MaterialFallbackKind): string | undefined;
  resolveMaterial(materialId: string | undefined | null, fallbackKind?: MaterialFallbackKind): MaterialDefinition | undefined;
  resolveRenderMaterial(materialId: string | undefined | null, fallbackKind?: MaterialFallbackKind): ResolvedRenderMaterial;
  resolveComponentId(componentId: string | undefined | null, componentType: ComponentType, defaultKind?: ComponentDefaultKind): string | undefined;
  resolveComponent(componentId: string | undefined | null, componentType: ComponentType, defaultKind?: ComponentDefaultKind): ComponentDefinition | undefined;
};

export type ComponentDefaultKind = "handle" | "hinge" | "drawerSystem";

export const SYSTEM_PLACEHOLDER_MATERIAL: ResolvedRenderMaterial = {
  id: "system.placeholder.material",
  displayName: "System placeholder material",
  colorHex: "#b8bcc7",
  roughness: 0.72,
  metalness: 0.04,
  thicknessMm: null,
  source: "system-placeholder"
};

type RuntimeCatalogIndex = {
  materials: ClientCatalog["materials"];
  components: ClientCatalog["components"];
  componentGeometry: ClientCatalog["componentGeometry"];
  catalogVersion: number;
  updatedAt: string;
  activeMaterialById: Map<string, MaterialDefinition>;
  firstActiveMaterial: MaterialDefinition | undefined;
  activeComponentById: Map<string, ComponentDefinition>;
  firstActiveComponentByType: Map<ComponentType, ComponentDefinition>;
  componentGeometryById: Map<string, ComponentGeometryDefinition>;
};

const runtimeCatalogIndexes = new WeakMap<ClientCatalog, RuntimeCatalogIndex>();

function buildRuntimeCatalogIndex(catalog: ClientCatalog): RuntimeCatalogIndex {
  const activeMaterialById = new Map<string, MaterialDefinition>();
  let firstActiveMaterial: MaterialDefinition | undefined;
  for (const material of catalog.materials ?? []) {
    if (!material.isActive) continue;
    firstActiveMaterial ??= material;
    if (!activeMaterialById.has(material.id)) activeMaterialById.set(material.id, material);
  }

  const activeComponentById = new Map<string, ComponentDefinition>();
  const firstActiveComponentByType = new Map<ComponentType, ComponentDefinition>();
  for (const component of catalog.components ?? []) {
    if (!component.isActive) continue;
    if (!activeComponentById.has(component.id)) activeComponentById.set(component.id, component);
    if (!firstActiveComponentByType.has(component.componentType)) {
      firstActiveComponentByType.set(component.componentType, component);
    }
  }

  const componentGeometryById = new Map<string, ComponentGeometryDefinition>();
  for (const geometry of catalog.componentGeometry ?? []) {
    if (!componentGeometryById.has(geometry.id)) componentGeometryById.set(geometry.id, geometry);
  }

  return {
    materials: catalog.materials,
    components: catalog.components,
    componentGeometry: catalog.componentGeometry,
    catalogVersion: catalog.meta?.catalogVersion ?? 0,
    updatedAt: catalog.meta?.updatedAt ?? "",
    activeMaterialById,
    firstActiveMaterial,
    activeComponentById,
    firstActiveComponentByType,
    componentGeometryById
  };
}

function runtimeCatalogIndex(catalog: ClientCatalog): RuntimeCatalogIndex {
  const existing = runtimeCatalogIndexes.get(catalog);
  if (
    existing &&
    existing.materials === catalog.materials &&
    existing.components === catalog.components &&
    existing.componentGeometry === catalog.componentGeometry &&
    existing.catalogVersion === (catalog.meta?.catalogVersion ?? 0) &&
    existing.updatedAt === (catalog.meta?.updatedAt ?? "")
  ) {
    return existing;
  }
  const next = buildRuntimeCatalogIndex(catalog);
  runtimeCatalogIndexes.set(catalog, next);
  return next;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function defaultMaterialId(catalog: ClientCatalog, kind?: MaterialFallbackKind): string | undefined {
  switch (kind) {
    case "front":
      return catalog.kitchenDefaults.frontMaterialId;
    case "worktop":
      return catalog.kitchenDefaults.worktopMaterialId;
    case "plinth":
      return catalog.kitchenDefaults.plinthMaterialId;
    case "backPanel":
      return catalog.kitchenDefaults.backPanelMaterialId;
    case "drawer":
      return catalog.kitchenDefaults.drawerBottomMaterialId ?? catalog.kitchenDefaults.carcassMaterialId;
    case "carcass":
    default:
      return catalog.kitchenDefaults.carcassMaterialId;
  }
}

function defaultComponentId(catalog: ClientCatalog, kind?: ComponentDefaultKind): string | undefined {
  switch (kind) {
    case "handle":
      return catalog.kitchenDefaults.defaultHandleComponentId;
    case "hinge":
      return catalog.kitchenDefaults.defaultHingeComponentId;
    case "drawerSystem":
      return catalog.kitchenDefaults.defaultDrawerSystemComponentId;
    default:
      return undefined;
  }
}

export function createModuleRuntimeCatalogContext(catalog: ClientCatalog): ModuleRuntimeCatalogContext {
  const getMaterialById = (materialId: string | undefined | null) => {
    const id = readString(materialId);
    return id ? runtimeCatalogIndex(catalog).activeMaterialById.get(id) : undefined;
  };

  const getComponentById = (componentId: string | undefined | null) => {
    const id = readString(componentId);
    return id ? runtimeCatalogIndex(catalog).activeComponentById.get(id) : undefined;
  };

  const getComponentGeometryById = (geometryId: string | undefined | null) => {
    const id = readString(geometryId);
    return id ? runtimeCatalogIndex(catalog).componentGeometryById.get(id) : undefined;
  };

  const getComponentGeometryForComponentId = (componentId: string | undefined | null) => {
    const component = getComponentById(componentId);
    return component ? getComponentGeometryById(component.geometryId) : undefined;
  };

  const resolveMaterial = (materialId: string | undefined | null, fallbackKind?: MaterialFallbackKind) => {
    const explicit = getMaterialById(materialId);
    if (explicit) return explicit;

    const defaultId = defaultMaterialId(catalog, fallbackKind);
    const fromDefault = getMaterialById(defaultId);
    if (fromDefault) return fromDefault;

    return runtimeCatalogIndex(catalog).firstActiveMaterial;
  };

  const resolveComponent = (
    componentId: string | undefined | null,
    componentType: ComponentType,
    defaultKind?: ComponentDefaultKind
  ) => {
    const explicit = getComponentById(componentId);
    if (explicit?.componentType === componentType) return explicit;

    const fromDefault = getComponentById(defaultComponentId(catalog, defaultKind));
    if (fromDefault?.componentType === componentType) return fromDefault;

    return runtimeCatalogIndex(catalog).firstActiveComponentByType.get(componentType);
  };

  return {
    catalog,
    getMaterialById,
    getComponentById,
    getComponentGeometryById,
    getComponentGeometryForComponentId,
    resolveMaterialId: (materialId, fallbackKind) => resolveMaterial(materialId, fallbackKind)?.id,
    resolveMaterial,
    resolveRenderMaterial: (materialId, fallbackKind) => {
      const material = resolveMaterial(materialId, fallbackKind);
      if (!material) return { ...SYSTEM_PLACEHOLDER_MATERIAL };
      return {
        id: material.id,
        displayName: material.displayName,
        colorHex: material.preview.colorHex,
        roughness: material.preview.roughness,
        metalness: material.preview.metalness,
        thicknessMm: material.defaultThicknessMm,
        source: "catalog"
      };
    },
    resolveComponentId: (componentId, componentType, defaultKind) =>
      resolveComponent(componentId, componentType, defaultKind)?.id,
    resolveComponent
  };
}

export function componentOptionsForParameter(catalog: ClientCatalog, parameterKey: string) {
  const type = componentTypeForParameter(parameterKey);
  if (!type) return null;
  return catalog.components
    .filter((component) => component.isActive && component.componentType === type)
    .map((component) => ({ value: component.id, label: component.displayName }));
}

export function componentTypeForParameter(parameterKey: string): ComponentType | null {
  if (parameterKey === "handleComponentId") return "handle";
  if (parameterKey === "legComponentId") return "leg";
  if (parameterKey === "runnerComponentId") return "runner";
  if (parameterKey === "hingeComponentId") return "hinge";
  if (parameterKey === "clipComponentId") return "plinth_clip";
  if (parameterKey === "liftUpComponentId") return "lift_up";
  if (parameterKey === "hangingBracketComponentId") return "hanging_bracket";
  if (parameterKey === "shelfSupportComponentId") return "shelf_support";
  return null;
}

function componentDefaultKindForParameter(parameterKey: string): ComponentDefaultKind | undefined {
  if (parameterKey === "handleComponentId") return "handle";
  if (parameterKey === "hingeComponentId") return "hinge";
  if (parameterKey === "runnerComponentId") return "drawerSystem";
  return undefined;
}

function handleKindFromGeometry(geometry: ComponentGeometryDefinition | undefined) {
  if (geometry?.archetype === "handle_knob") return "knob";
  if (geometry?.archetype === "handle_profile") return "gola";
  return "bar";
}

export function applyCatalogComponentToParams(
  params: Record<string, unknown>,
  parameterKey: string,
  componentId: string | null | undefined,
  catalogContext: ModuleRuntimeCatalogContext
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = { ...params };
  const componentType = componentTypeForParameter(parameterKey);
  if (!componentType) {
    if (componentId) nextParams[parameterKey] = componentId;
    return nextParams;
  }

  const component = catalogContext.resolveComponent(componentId, componentType, componentDefaultKindForParameter(parameterKey));
  if (!component) {
    delete nextParams[parameterKey];
    if (parameterKey === "handleComponentId") nextParams.handleType = "none";
    return nextParams;
  }

  nextParams[parameterKey] = component.id;
  const geometry = catalogContext.getComponentGeometryById(component.geometryId);

  if (parameterKey === "handleComponentId") {
    nextParams.handleType = handleKindFromGeometry(geometry);
    nextParams.handleLengthMm = geometry?.dimensionsMm.lengthMm ?? geometry?.dimensionsMm.widthMm ?? component.nominalLengthMm ?? nextParams.handleLengthMm;
    nextParams.handleSizeMm = geometry?.dimensionsMm.heightMm ?? geometry?.dimensionsMm.diameterMm ?? geometry?.dimensionsMm.thicknessMm ?? nextParams.handleSizeMm;
    nextParams.handleProjectionMm = geometry?.dimensionsMm.projectionMm ?? geometry?.dimensionsMm.depthMm ?? nextParams.handleProjectionMm;
  }

  if (parameterKey === "legComponentId") {
    nextParams.plinthHeight = component.nominalHeightMm ?? geometry?.dimensionsMm.heightMm ?? nextParams.plinthHeight;
  }

  return nextParams;
}
