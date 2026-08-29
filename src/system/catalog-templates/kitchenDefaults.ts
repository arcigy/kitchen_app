import type { KitchenDefaults } from "../../core/catalog/catalog-types";
import { demosKitchenDefaultsTemplate } from "./demosCatalog";

export const systemKitchenDefaultsTemplate: KitchenDefaults = {
  ...demosKitchenDefaultsTemplate,
  carcassMaterialId: "mat.demos.142391",
  plinthMaterialId: "mat.demos.142391",
  backPanelMaterialId: "mat.demos.116884",
  defaultBackPanelThicknessMm: 10
};
