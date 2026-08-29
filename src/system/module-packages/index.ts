import drawerLow from "./drawerLow.fqm.source.json";
import swingShelvesLow from "./swingShelvesLow.fqm.source.json";
import cornerShelfLower from "./cornerShelfLower.fqm.source.json";
import fridgeTall from "./fridgeTall.fqm.source.json";
import flapShelvesLow from "./flapShelvesLow.fqm.source.json";
import { extendedFurnitureModulePackages } from "./extendedFurniture";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";
import { normalizeKitchenModulePackage } from "../../layout/kitchenModuleContract";

const rawSystemModulePackageTemplates: FurnQuoteModulePackage[] = [
  drawerLow,
  swingShelvesLow,
  cornerShelfLower,
  fridgeTall,
  flapShelvesLow,
  ...extendedFurnitureModulePackages
] as FurnQuoteModulePackage[];

/** Every system template is emitted with the current Kitchen Group contract. */
export const systemModulePackageTemplates: FurnQuoteModulePackage[] = rawSystemModulePackageTemplates.map(normalizeKitchenModulePackage);
