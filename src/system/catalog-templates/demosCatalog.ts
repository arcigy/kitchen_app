import { gunzipSync, strFromU8 } from "fflate";
import type {
  ClientCatalog,
  ComponentDefinition,
  ComponentGeometryDefinition,
  KitchenDefaults,
  MaterialDefinition,
  PriceList
} from "../../core/catalog/catalog-types";
import {
  DEMOS_CATALOG_GENERATED_GZIP_BASE64,
  DEMOS_CATALOG_GENERATED_META
} from "./demosCatalog.generated";
import { componentDefinitions as fallbackComponentDefinitions } from "../../data/pricing/componentDefinitions";
import { componentGeometryDefinitions as fallbackComponentGeometryDefinitions } from "../../data/pricing/componentGeometryDefinitions";
import { materialDefinitions as fallbackMaterialDefinitions } from "../../data/pricing/materialDefinitions";
import { priceList as fallbackPriceList } from "../../data/pricing/priceList";

export type DemosCatalogGeneratedData = {
  materials: MaterialDefinition[];
  components: ComponentDefinition[];
  componentGeometry: ComponentGeometryDefinition[];
  priceList: PriceList;
  kitchenDefaults: KitchenDefaults;
  summary: {
    materials: Record<string, number>;
    components: Record<string, number>;
    activeMaterials: number;
    activeComponents: number;
  };
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function loadGeneratedDemosCatalog(): DemosCatalogGeneratedData | null {
  if (!DEMOS_CATALOG_GENERATED_GZIP_BASE64) return null;
  const json = strFromU8(gunzipSync(decodeBase64(DEMOS_CATALOG_GENERATED_GZIP_BASE64)));
  return JSON.parse(json) as DemosCatalogGeneratedData;
}

const fallbackKitchenDefaults: KitchenDefaults = {
  carcassMaterialId: "mat.board.body.dtd.grey.18",
  frontMaterialId: "mat.board.front.veneer.oak_natural.19",
  worktopMaterialId: "mat.board.worktop.laminate_oak.38",
  plinthMaterialId: "mat.board.body.dtd.grey.18",
  backPanelMaterialId: "mat.board.back.hdf.grey.6",
  drawerBottomMaterialId: "mat.board.drawer_bottom.hdf.white.8",
  defaultHandleComponentId: "cmp.handle.bar.160.black",
  defaultHingeComponentId: "cmp.hinge.clip_on.standard",
  defaultDrawerSystemComponentId: "cmp.runner.pair.400.standard",
  defaultWorktopThicknessMm: 38,
  defaultCarcassThicknessMm: 18,
  defaultBackPanelThicknessMm: 8,
  defaultPlinthHeightMm: 150
};

const fallbackData: DemosCatalogGeneratedData = {
  materials: fallbackMaterialDefinitions,
  components: fallbackComponentDefinitions,
  componentGeometry: fallbackComponentGeometryDefinitions,
  priceList: fallbackPriceList,
  kitchenDefaults: fallbackKitchenDefaults,
  summary: {
    materials: {},
    components: {},
    activeMaterials: fallbackMaterialDefinitions.filter((material) => material.isActive).length,
    activeComponents: fallbackComponentDefinitions.filter((component) => component.isActive).length
  }
};

export const demosCatalogGeneratedMeta = DEMOS_CATALOG_GENERATED_META;

export const demosCatalogData = loadGeneratedDemosCatalog() ?? fallbackData;

export const demosMaterialTemplates: ClientCatalog["materials"] = demosCatalogData.materials;
export const demosComponentTemplates: ClientCatalog["components"] = demosCatalogData.components;
export const demosComponentGeometryTemplates: ClientCatalog["componentGeometry"] = demosCatalogData.componentGeometry;
export const demosPriceListTemplate: ClientCatalog["priceList"] = demosCatalogData.priceList;
export const demosKitchenDefaultsTemplate: ClientCatalog["kitchenDefaults"] = demosCatalogData.kitchenDefaults;

export function isDemosCatalogGenerated(): boolean {
  return DEMOS_CATALOG_GENERATED_GZIP_BASE64.length > 0;
}
