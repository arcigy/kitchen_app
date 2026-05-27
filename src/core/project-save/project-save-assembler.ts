import type { ClientCatalog } from "../catalog/catalog-types";
import { computeModulePackageHash } from "../module-package/module-package-file";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";
import type { ProjectMetadata, ProjectPreview } from "../project/project-types";
import type { ProjectAssetManifest, ProjectCatalogSnapshot, ProjectSaveFile, UsedModulePackageSnapshot } from "./project-save-types";
import { CURRENT_PROJECT_SAVE_VERSION } from "./project-save-types";
import { validateProjectSaveFile } from "./project-save-validation";

export type ProjectStateSerializer<T> = {
  key: string;
  serialize(): T;
  deserialize(data: T): void;
  validate(data: T): void;
};

export type ProjectSaveAssemblerInput = {
  clientId: string;
  projectId: string;
  activePhaseId: string;
  project: ProjectMetadata;
  catalog: ClientCatalog;
  layoutState: unknown;
  kitchenState: unknown;
  moduleInstances: unknown[];
  sceneState: unknown;
  editorState?: unknown;
  recentActivity?: unknown;
  cameraState?: unknown;
  selections?: unknown;
  pricingSettings?: unknown;
  quoteSettings?: unknown;
  projectPreview?: ProjectPreview;
  bomSnapshot?: unknown;
  assets?: ProjectAssetManifest;
  modulePackages?: FurnQuoteModulePackage[];
  appVersion?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function collectStringIds(value: unknown, keys: Set<string>): string[] {
  const out = new Set<string>();
  const seen = new WeakSet<object>();
  const walk = (next: unknown) => {
    if (!next || typeof next !== "object") return;
    if (seen.has(next)) return;
    seen.add(next);
    if (Array.isArray(next)) {
      next.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(next as Record<string, unknown>)) {
      if (keys.has(key) && typeof child === "string" && child.trim()) out.add(child);
      walk(child);
    }
  };
  walk(value);
  return [...out].sort();
}

function createUsedModulePackageSnapshots(
  packages: readonly FurnQuoteModulePackage[],
  usedModuleTypes: readonly string[],
  source: unknown
): UsedModulePackageSnapshot[] {
  const usedPackageIds = new Set(collectStringIds(source, new Set(["modulePackageId"])));
  const usedTypeSet = new Set(usedModuleTypes);
  return packages
    .filter((modulePackage) => usedPackageIds.has(modulePackage.module.modulePackageId) || usedTypeSet.has(modulePackage.module.moduleType))
    .map((modulePackage) => {
      const packageHash = computeModulePackageHash(modulePackage);
      return {
        modulePackageId: modulePackage.module.modulePackageId,
        moduleType: modulePackage.module.moduleType,
        packageVersion: modulePackage.module.version,
        packageHash,
        packageSnapshot: cloneJson({
          ...modulePackage,
          integrity: {
            ...modulePackage.integrity,
            packageHash
          }
        })
      };
    });
}

function createPriceListSnapshot(catalog: ClientCatalog, usedCatalogIds: readonly string[]) {
  const used = new Set(usedCatalogIds);
  return {
    ...catalog.priceList,
    prices: Object.fromEntries(Object.entries(catalog.priceList.prices).filter(([id]) => used.has(id)))
  };
}

export function createCatalogSnapshot(
  catalog: ClientCatalog,
  source: unknown,
  modulePackages: readonly FurnQuoteModulePackage[] = []
): ProjectCatalogSnapshot {
  const usedMaterialIds = collectStringIds(source, new Set(["materialId", "frontsMaterialId", "corpusMaterialId", "backMaterialId", "drawerBottomMaterialId", "worktopMaterialId"]));
  const usedComponentIds = collectStringIds(source, new Set(["componentId", "handleComponentId", "hingeComponentId", "drawerSystemComponentId"]));
  const usedModuleTypes = collectStringIds(source, new Set(["type", "moduleType"]));
  const usedModulePackageSnapshots = createUsedModulePackageSnapshots(modulePackages, usedModuleTypes, source);
  const usedCatalogIds = [...new Set([...usedMaterialIds, ...usedComponentIds])].sort();
  const materials = catalog.materials.filter((item) => usedMaterialIds.includes(item.id));
  const components = catalog.components.filter((item) => usedComponentIds.includes(item.id));
  const modules = catalog.modules.filter((item) => usedModuleTypes.includes(item.moduleType));
  const priceListSnapshot = createPriceListSnapshot(catalog, usedCatalogIds);
  return {
    catalogVersion: catalog.meta.catalogVersion,
    capturedAt: nowIso(),
    usedMaterialIds,
    usedComponentIds,
    usedModuleTypes,
    usedModulePackageSnapshots,
    materials,
    components,
    modules,
    priceListSnapshot: cloneJson(priceListSnapshot),
    fullCatalog: cloneJson({
      ...catalog,
      materials,
      components,
      modules,
      priceList: priceListSnapshot
    })
  };
}

export function assembleProjectSaveFile(input: ProjectSaveAssemblerInput): ProjectSaveFile {
  const savedAt = nowIso();
  const project = cloneJson(input.project);
  const layoutState = cloneJson(input.layoutState);
  const kitchenState = cloneJson(input.kitchenState);
  const moduleInstances = cloneJson(input.moduleInstances);
  const appStateSource = {
    layoutState,
    kitchenState,
    moduleInstances,
    pricingSettings: input.pricingSettings,
    quoteSettings: input.quoteSettings
  };
  const phase = project.phaseDetails.find((item) => item.phaseId === input.activePhaseId) ?? project.phaseDetails[0];
  const save: ProjectSaveFile = {
    format: "kitchen-app-project",
    saveFormatVersion: CURRENT_PROJECT_SAVE_VERSION,
    clientId: input.clientId,
    projectId: input.projectId,
    activePhaseId: input.activePhaseId,
    project,
    phases: [
      {
        phaseId: input.activePhaseId,
        phaseName: phase?.phaseName ?? "Fáza 1",
        phaseNumber: phase?.phaseNumber ?? 1,
        status: phase?.status ?? "draft",
        layoutState,
        kitchenState,
        moduleInstances,
        pricingSettings: cloneJson(input.pricingSettings),
        quoteSettings: cloneJson(input.quoteSettings),
        bomSnapshot: cloneJson(input.bomSnapshot),
        createdAt: phase?.createdAt ?? project.createdAt,
        updatedAt: savedAt
      }
    ],
    catalogSnapshot: createCatalogSnapshot(input.catalog, appStateSource, input.modulePackages ?? []),
    appState: {
      layout: layoutState,
      kitchen: kitchenState,
      modules: moduleInstances,
      scene: cloneJson(input.sceneState),
      editor: cloneJson(input.editorState),
      recentActivity: cloneJson(input.recentActivity),
      camera: cloneJson(input.cameraState),
      selections: cloneJson(input.selections),
      pricingSettings: cloneJson(input.pricingSettings),
      quoteSettings: cloneJson(input.quoteSettings),
      projectPreview: cloneJson(input.projectPreview)
    },
    assets: input.assets ?? { bundled: [], external: [], missing: [], generated: [] },
    integrity: {
      createdAt: project.createdAt,
      updatedAt: savedAt,
      savedAt,
      appVersion: input.appVersion
    }
  };
  validateProjectSaveFile(save, { clientId: input.clientId, projectId: input.projectId });
  return save;
}
