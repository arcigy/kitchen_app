import type { ClientContext } from "../client/client-context";
import type { ClientCatalog, ClientModuleDefinition, ComponentDefinition, KitchenDefaults, MaterialDefinition } from "./catalog-types";
import { createHardwareCatalog } from "./hardware-catalog";
import { getKitchenDefaults } from "./kitchen-defaults";
import { createMaterialCatalog } from "./material-catalog";
import { getEnabledClientModules } from "./module-catalog";
import { createPricingCatalog } from "./pricing-catalog";
import type { ClientCatalogRepository } from "./catalog-repository";
import { validateClientCatalog } from "./catalog-validation";

export type ClientCatalogService = ReturnType<typeof createClientCatalogService>;

export function createClientCatalogService(args: {
  context: ClientContext;
  repository: ClientCatalogRepository;
}) {
  const getCatalog = (): ClientCatalog => args.repository.getCatalogForClient(args.context.clientId);
  const saveValidated = async (catalog: ClientCatalog) => args.repository.saveCatalog(args.context, validateClientCatalog(catalog));

  return {
    getCatalog,
    loadCatalog: () => args.repository.ensureCatalogExists(args.context),
    createCatalogFromSystemTemplates: () => args.repository.ensureCatalogExists(args.context),
    validateCatalog: validateClientCatalog,
    getMaterialCatalog: () => createMaterialCatalog(getCatalog()),
    getHardwareCatalog: () => createHardwareCatalog(getCatalog()),
    getPricingCatalog: () => createPricingCatalog(getCatalog()),
    getKitchenDefaults: () => getKitchenDefaults(getCatalog()),
    getEnabledModules: () => getEnabledClientModules(getCatalog()),
    getReadonlyCatalogForUi: () => structuredClone(getCatalog()),
    async updateMaterial(material: MaterialDefinition) {
      const catalog = await args.repository.ensureCatalogExists(args.context);
      const next = catalog.materials.map((item) => item.id === material.id ? material : item);
      if (!next.some((item) => item.id === material.id)) next.push(material);
      await saveValidated({ ...catalog, materials: next, meta: { ...catalog.meta, source: "client-custom", updatedAt: new Date().toISOString() } });
    },
    async updateComponent(component: ComponentDefinition) {
      const catalog = await args.repository.ensureCatalogExists(args.context);
      const next = catalog.components.map((item) => item.id === component.id ? component : item);
      if (!next.some((item) => item.id === component.id)) next.push(component);
      await saveValidated({ ...catalog, components: next, meta: { ...catalog.meta, source: "client-custom", updatedAt: new Date().toISOString() } });
    },
    async setModuleEnabled(moduleType: string, enabled: boolean) {
      const catalog = await args.repository.ensureCatalogExists(args.context);
      const modules = catalog.modules.map((module): ClientModuleDefinition => module.moduleType === moduleType ? { ...module, enabled } : module);
      await saveValidated({ ...catalog, modules, meta: { ...catalog.meta, source: "client-custom", updatedAt: new Date().toISOString() } });
    },
    async updatePrice(priceRef: string, value: number) {
      const catalog = await args.repository.ensureCatalogExists(args.context);
      await saveValidated({
        ...catalog,
        priceList: { ...catalog.priceList, prices: { ...catalog.priceList.prices, [priceRef]: value } },
        meta: { ...catalog.meta, source: "client-custom", updatedAt: new Date().toISOString() }
      });
    },
    async updateKitchenDefaults(defaults: KitchenDefaults) {
      const catalog = await args.repository.ensureCatalogExists(args.context);
      await saveValidated({ ...catalog, kitchenDefaults: { ...catalog.kitchenDefaults, ...defaults }, meta: { ...catalog.meta, source: "client-custom", updatedAt: new Date().toISOString() } });
    }
  };
}
