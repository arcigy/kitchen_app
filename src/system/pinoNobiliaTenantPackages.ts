import type { FurnQuoteModulePackage, ModulePackageCategory } from "../core/module-package/module-package-types";
import { systemModulePackageTemplates } from "./module-packages";
import { createPinoSideCabinetTenantPackage } from "./module-packages/pinoSideCabinet";

const COMMON_TAGS = ["pino", "nobilia", "vkh-2026", "review-staging"] as const;

export const PINO_NOBILIA_TENANT_MODULE_TYPES = [
  "drawer_low",
  "swing_shelves_low",
  "flap_shelves_low",
  "corner_shelf_lower",
  "fridge_tall",
  "fwm_built_in_dishwasher",
  "fwm_built_in_fridge",
  "fwm_oven_tower_module",
  "fwm_microwave_tower_module",
  "fwm_kitchen_special_module_1",
  "fwm_kitchen_special_module_2",
  "fwm_kitchen_special_module_3",
  "fwm_interior_cladding_1",
  "fwm_interior_cladding_2"
] as const;

const PINO_NOBILIA_TENANT_MODULE_TYPE_SET = new Set<string>(PINO_NOBILIA_TENANT_MODULE_TYPES);

type PackageOverrides = {
  displayName: string;
  description: string;
  category?: ModulePackageCategory;
  extraTags?: string[];
};

const PACKAGE_OVERRIDES: Record<string, PackageOverrides> = {
  drawer_low: {
    displayName: "PINO spodna zasuvkova skrinka",
    description: "Custom PINO/Nobilia VKH 2026 tenant drawer-base module."
  },
  swing_shelves_low: {
    displayName: "PINO spodna policova skrinka",
    description: "Custom PINO/Nobilia VKH 2026 tenant shelf-base module."
  },
  flap_shelves_low: {
    displayName: "PINO spodna vyklopna skrinka",
    description: "Custom PINO/Nobilia VKH 2026 tenant flap-base module."
  },
  corner_shelf_lower: {
    displayName: "PINO rohova spodna skrinka",
    description: "Custom PINO/Nobilia VKH 2026 tenant corner-base module."
  },
  fridge_tall: {
    displayName: "PINO vysoka spotrebicova skrinka",
    description: "Custom PINO/Nobilia VKH 2026 tenant tall appliance module."
  },
  fwm_built_in_dishwasher: {
    displayName: "PINO vstavana umyvacka riadu",
    description: "Custom PINO/Nobilia VKH 2026 tenant built-in dishwasher module.",
    category: "base_cabinet",
    extraTags: ["kitchen", "base", "appliance", "dishwasher", "vendor-resolved"]
  },
  fwm_built_in_fridge: {
    displayName: "PINO vstavana chladnicka",
    description: "Custom PINO/Nobilia VKH 2026 tenant built-in fridge appliance tower.",
    category: "tall_cabinet",
    extraTags: ["kitchen", "tall", "appliance", "fridge", "vendor-resolved"]
  },
  fwm_oven_tower_module: {
    displayName: "PINO rurovy modul",
    description: "Custom PINO/Nobilia VKH 2026 tenant oven tower module.",
    category: "tall_cabinet",
    extraTags: ["kitchen", "tall", "appliance", "oven", "vendor-resolved"]
  },
  fwm_microwave_tower_module: {
    displayName: "PINO mikrovlnny modul",
    description: "Custom PINO/Nobilia VKH 2026 tenant microwave tower module.",
    category: "tall_cabinet",
    extraTags: ["kitchen", "tall", "appliance", "microwave", "vendor-resolved"]
  },
  fwm_kitchen_special_module_1: {
    displayName: "PINO spodna skrinka kombinovana",
    description: "Custom PINO/Nobilia VKH 2026 tenant mixed base module for drawer plus door combinations.",
    category: "base_cabinet",
    extraTags: ["kitchen", "base", "mixed", "vendor-resolved"]
  },
  fwm_kitchen_special_module_2: {
    displayName: "PINO spodna skrinka spotrebicova",
    description: "Custom PINO/Nobilia VKH 2026 tenant appliance-ready base module.",
    category: "base_cabinet",
    extraTags: ["kitchen", "base", "appliance", "vendor-resolved"]
  },
  fwm_kitchen_special_module_3: {
    displayName: "PINO spodna skrinka otvorena",
    description: "Custom PINO/Nobilia VKH 2026 tenant open-shelf base module.",
    category: "base_cabinet",
    extraTags: ["kitchen", "base", "open-shelf", "vendor-resolved"]
  },
  fwm_interior_cladding_1: {
    displayName: "PINO kryci panel",
    description: "Custom PINO/Nobilia VKH 2026 tenant side cover and filler panel.",
    extraTags: ["kitchen", "accessory", "cover-panel", "vendor-resolved"]
  },
  fwm_interior_cladding_2: {
    displayName: "PINO rohovy kryci panel",
    description: "Custom PINO/Nobilia VKH 2026 tenant corner cover and filler panel.",
    extraTags: ["kitchen", "accessory", "corner", "cover-panel", "vendor-resolved"]
  }
};

function customizePackage(template: FurnQuoteModulePackage): FurnQuoteModulePackage {
  const now = new Date().toISOString();
  const moduleType = template.module.moduleType;
  const overrides = PACKAGE_OVERRIDES[moduleType] ?? {
    displayName: `PINO/Nobilia ${template.module.displayName}`,
    description: `Custom PINO/Nobilia VKH 2026 tenant module for ${template.module.displayName}.`
  };
  return {
    ...structuredClone(template),
    module: {
      ...template.module,
      modulePackageId: `pino_nobilia_${moduleType}_vkh_2026_v1`,
      familyName: `PINO/Nobilia ${template.module.familyName}`,
      displayName: overrides.displayName,
      description: overrides.description,
      category: overrides.category ?? template.module.category,
      isSystemModule: false,
      tags: [
        ...new Set([
          ...(template.module.tags ?? []),
          ...COMMON_TAGS,
          ...(overrides.extraTags ?? [])
        ])
      ]
    },
    integrity: {
      ...template.integrity,
      createdAt: now,
      updatedAt: now,
      author: "Arcigy PINO/Nobilia seed"
    }
  };
}

export function createPinoNobiliaTenantModulePackages(): FurnQuoteModulePackage[] {
  return [
    ...systemModulePackageTemplates
      .filter((template) => PINO_NOBILIA_TENANT_MODULE_TYPE_SET.has(template.module.moduleType))
      .map(customizePackage),
    createPinoSideCabinetTenantPackage()
  ];
}
