import { extendedFurnitureModulePackages } from "./extendedFurniture";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";

/** Authoring templates for the supported kitchen families. Tenant assignments live in ClientCatalog. */
export const systemModulePackageTemplates: FurnQuoteModulePackage[] = extendedFurnitureModulePackages;
