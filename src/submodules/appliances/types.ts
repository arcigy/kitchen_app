import type { ModuleParameterDefinition } from "../../core/module-package/module-package-types";

export const APPLIANCE_SUBMODULE_TYPES = [
  "microwave",
  "oven",
  "fridge",
  "fridge_freezer",
  "sink",
  "dishwasher",
  "cooktop"
] as const;

export type ApplianceSubmoduleType = (typeof APPLIANCE_SUBMODULE_TYPES)[number];

export type AppliancePlacementRule =
  | "built_in_tall_or_base_opening"
  | "built_in_tall_opening"
  | "base_sink_opening"
  | "integrated_dishwasher_opening"
  | "worktop_top_only";

export type ApplianceSubmoduleParams = {
  type: "appliance_submodule";
  applianceSubmoduleType: ApplianceSubmoduleType;
  displayName: string;
  brand: string;
  model: string;
  width: number;
  height: number;
  depth: number;
  priceNet: number;
  powerW: number;
  info: string;
  placementRule: AppliancePlacementRule;
  hostOpeningWidthMm: number;
  hostOpeningHeightMm: number;
  hostOpeningDepthMm: number;
  minVentilationGapMm: number;
  requiresWorktop: boolean;
  requiresWaterConnection: boolean;
  requiresDrainConnection: boolean;
  requiresElectricalConnection: boolean;
  allowedHostRoles: string;
  notes: string;
};

export type ApplianceSubmoduleDefinition = {
  type: ApplianceSubmoduleType;
  label: string;
  description: string;
  defaultParams: Omit<ApplianceSubmoduleParams, "type" | "applianceSubmoduleType" | "displayName">;
};

export const APPLIANCE_SUBMODULE_DEFINITIONS: readonly ApplianceSubmoduleDefinition[] = [
  {
    type: "microwave",
    label: "Mikrovlnka",
    description: "Built-in microwave appliance submodule for inserting into a tall/base appliance opening.",
    defaultParams: {
      brand: "Generic",
      model: "Built-in microwave 60",
      width: 595,
      height: 382,
      depth: 320,
      priceNet: 180,
      powerW: 900,
      info: "Vstavana mikrovlnka do pripraveneho otvoru skrinky.",
      placementRule: "built_in_tall_or_base_opening",
      hostOpeningWidthMm: 600,
      hostOpeningHeightMm: 380,
      hostOpeningDepthMm: 340,
      minVentilationGapMm: 20,
      requiresWorktop: false,
      requiresWaterConnection: false,
      requiresDrainConnection: false,
      requiresElectricalConnection: true,
      allowedHostRoles: "tall,base_appliance",
      notes: "Appliance submodule. It is inserted into a host cabinet opening; it is not a standalone cabinet module."
    }
  },
  {
    type: "oven",
    label: "Rura",
    description: "Built-in oven appliance submodule for appliance tower/base openings.",
    defaultParams: {
      brand: "Generic",
      model: "Built-in oven 60",
      width: 595,
      height: 595,
      depth: 550,
      priceNet: 260,
      powerW: 3500,
      info: "Vstavana rura do pripraveneho otvoru.",
      placementRule: "built_in_tall_or_base_opening",
      hostOpeningWidthMm: 600,
      hostOpeningHeightMm: 600,
      hostOpeningDepthMm: 560,
      minVentilationGapMm: 20,
      requiresWorktop: false,
      requiresWaterConnection: false,
      requiresDrainConnection: false,
      requiresElectricalConnection: true,
      allowedHostRoles: "tall,base_appliance",
      notes: "Contract placeholder for oven appliance submodule."
    }
  },
  {
    type: "fridge",
    label: "Chladnicka",
    description: "Integrated fridge appliance submodule for tall appliance host cabinets.",
    defaultParams: {
      brand: "Generic",
      model: "Integrated fridge",
      width: 540,
      height: 1220,
      depth: 545,
      priceNet: 420,
      powerW: 120,
      info: "Vstavana chladnicka do vysokej skrinky.",
      placementRule: "built_in_tall_opening",
      hostOpeningWidthMm: 560,
      hostOpeningHeightMm: 1225,
      hostOpeningDepthMm: 560,
      minVentilationGapMm: 40,
      requiresWorktop: false,
      requiresWaterConnection: false,
      requiresDrainConnection: false,
      requiresElectricalConnection: true,
      allowedHostRoles: "tall",
      notes: "Contract placeholder for integrated fridge appliance submodule."
    }
  },
  {
    type: "fridge_freezer",
    label: "Chladnicka + mraznicka",
    description: "Integrated fridge-freezer appliance submodule for tall appliance host cabinets.",
    defaultParams: {
      brand: "Generic",
      model: "Integrated fridge-freezer",
      width: 540,
      height: 1780,
      depth: 545,
      priceNet: 540,
      powerW: 150,
      info: "Vstavana kombinovana chladnicka s mraznickou.",
      placementRule: "built_in_tall_opening",
      hostOpeningWidthMm: 560,
      hostOpeningHeightMm: 1780,
      hostOpeningDepthMm: 560,
      minVentilationGapMm: 40,
      requiresWorktop: false,
      requiresWaterConnection: false,
      requiresDrainConnection: false,
      requiresElectricalConnection: true,
      allowedHostRoles: "tall",
      notes: "Contract placeholder for integrated fridge-freezer appliance submodule."
    }
  },
  {
    type: "sink",
    label: "Drez",
    description: "Sink appliance submodule for sink base and worktop cutout coordination.",
    defaultParams: {
      brand: "Generic",
      model: "Black sink with drainer",
      width: 860,
      height: 200,
      depth: 500,
      priceNet: 90,
      powerW: 0,
      info: "Drez do pracovnej dosky a drezovej spodnej skrinky.",
      placementRule: "base_sink_opening",
      hostOpeningWidthMm: 840,
      hostOpeningHeightMm: 200,
      hostOpeningDepthMm: 480,
      minVentilationGapMm: 0,
      requiresWorktop: true,
      requiresWaterConnection: true,
      requiresDrainConnection: true,
      requiresElectricalConnection: false,
      allowedHostRoles: "base_sink,worktop",
      notes: "Sink appliance submodule with worktop cutout, water and drain insertion rules."
    }
  },
  {
    type: "dishwasher",
    label: "Umyvacka riadu",
    description: "Integrated dishwasher appliance submodule for a base dishwasher opening.",
    defaultParams: {
      brand: "Generic",
      model: "Integrated dishwasher 60",
      width: 598,
      height: 815,
      depth: 550,
      priceNet: 360,
      powerW: 2000,
      info: "Vstavana umyvacka riadu do spodnej zostavy.",
      placementRule: "integrated_dishwasher_opening",
      hostOpeningWidthMm: 600,
      hostOpeningHeightMm: 820,
      hostOpeningDepthMm: 560,
      minVentilationGapMm: 10,
      requiresWorktop: true,
      requiresWaterConnection: true,
      requiresDrainConnection: true,
      requiresElectricalConnection: true,
      allowedHostRoles: "base_appliance",
      notes: "Contract placeholder for dishwasher appliance submodule."
    }
  },
  {
    type: "cooktop",
    label: "Varna doska",
    description: "Cooktop appliance submodule that can be placed only on top of a worktop.",
    defaultParams: {
      brand: "Generic",
      model: "Cooktop 60",
      width: 590,
      height: 50,
      depth: 520,
      priceNet: 220,
      powerW: 7000,
      info: "Varna doska do vyrezu v pracovnej doske.",
      placementRule: "worktop_top_only",
      hostOpeningWidthMm: 560,
      hostOpeningHeightMm: 60,
      hostOpeningDepthMm: 490,
      minVentilationGapMm: 30,
      requiresWorktop: true,
      requiresWaterConnection: false,
      requiresDrainConnection: false,
      requiresElectricalConnection: true,
      allowedHostRoles: "worktop",
      notes: "Rule: cooktop can be inserted only on top of a worktop/cutout host."
    }
  }
];

export function getApplianceSubmoduleDefinition(type: ApplianceSubmoduleType): ApplianceSubmoduleDefinition {
  const definition = APPLIANCE_SUBMODULE_DEFINITIONS.find((entry) => entry.type === type);
  if (!definition) throw new Error(`Unknown appliance submodule type: ${type}`);
  return definition;
}

export function makeDefaultApplianceSubmoduleParams(type: ApplianceSubmoduleType): ApplianceSubmoduleParams {
  const definition = getApplianceSubmoduleDefinition(type);
  return {
    type: "appliance_submodule",
    applianceSubmoduleType: type,
    displayName: definition.label,
    ...definition.defaultParams
  };
}

export function normalizeApplianceSubmoduleParams(params: Partial<ApplianceSubmoduleParams>): ApplianceSubmoduleParams {
  const type = APPLIANCE_SUBMODULE_TYPES.includes(params.applianceSubmoduleType as ApplianceSubmoduleType)
    ? params.applianceSubmoduleType as ApplianceSubmoduleType
    : "microwave";
  const defaults = makeDefaultApplianceSubmoduleParams(type);
  const next = { ...defaults, ...params, type: "appliance_submodule", applianceSubmoduleType: type } as ApplianceSubmoduleParams;
  next.width = finite(next.width, defaults.width);
  next.height = finite(next.height, defaults.height);
  next.depth = finite(next.depth, defaults.depth);
  next.priceNet = finite(next.priceNet, defaults.priceNet);
  next.powerW = finite(next.powerW, defaults.powerW);
  next.hostOpeningWidthMm = finite(next.hostOpeningWidthMm, defaults.hostOpeningWidthMm);
  next.hostOpeningHeightMm = finite(next.hostOpeningHeightMm, defaults.hostOpeningHeightMm);
  next.hostOpeningDepthMm = finite(next.hostOpeningDepthMm, defaults.hostOpeningDepthMm);
  next.minVentilationGapMm = finite(next.minVentilationGapMm, defaults.minVentilationGapMm);
  return next;
}

export function getApplianceSubmoduleParameterDefinitions(type: ApplianceSubmoduleType): ModuleParameterDefinition[] {
  const definition = getApplianceSubmoduleDefinition(type);
  return [
    { key: "displayName", label: "Display name", type: "string", group: "identity", uiVisibility: "technical", defaultValue: definition.label, affects: "all" },
    { key: "applianceSubmoduleType", label: "Appliance type", type: "select", group: "identity", uiVisibility: "technical", defaultValue: type, options: APPLIANCE_SUBMODULE_DEFINITIONS.map((entry) => ({ label: entry.label, value: entry.type })), affects: "all" },
    { key: "brand", label: "Brand", type: "string", group: "appliance", uiVisibility: "user", defaultValue: definition.defaultParams.brand, affects: "pricing" },
    { key: "model", label: "Model", type: "string", group: "appliance", uiVisibility: "user", defaultValue: definition.defaultParams.model, affects: "pricing" },
    { key: "priceNet", label: "Price", type: "number", group: "appliance", uiVisibility: "user", defaultValue: definition.defaultParams.priceNet, min: 0, step: 1, affects: "pricing" },
    { key: "info", label: "Info", type: "string", group: "appliance", uiVisibility: "user", defaultValue: definition.defaultParams.info, affects: "export" },
    { key: "width", label: "Width", type: "number", group: "dimensions", uiVisibility: "user", defaultValue: definition.defaultParams.width, min: 1, step: 1, unit: "mm", affects: "geometry" },
    { key: "height", label: "Height", type: "number", group: "dimensions", uiVisibility: "user", defaultValue: definition.defaultParams.height, min: 1, step: 1, unit: "mm", affects: "geometry" },
    { key: "depth", label: "Depth", type: "number", group: "dimensions", uiVisibility: "user", defaultValue: definition.defaultParams.depth, min: 1, step: 1, unit: "mm", affects: "geometry" },
    { key: "powerW", label: "Power", type: "number", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.powerW, min: 0, step: 1, affects: "pricing" },
    { key: "placementRule", label: "Placement rule", type: "select", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.placementRule, options: [
      { label: "Built-in opening", value: "built_in_tall_or_base_opening" },
      { label: "Tall built-in opening", value: "built_in_tall_opening" },
      { label: "Sink base/worktop", value: "base_sink_opening" },
      { label: "Dishwasher opening", value: "integrated_dishwasher_opening" },
      { label: "Worktop top only", value: "worktop_top_only" }
    ], affects: "placement" },
    { key: "hostOpeningWidthMm", label: "Host opening width", type: "number", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.hostOpeningWidthMm, min: 1, step: 1, unit: "mm", affects: "placement" },
    { key: "hostOpeningHeightMm", label: "Host opening height", type: "number", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.hostOpeningHeightMm, min: 1, step: 1, unit: "mm", affects: "placement" },
    { key: "hostOpeningDepthMm", label: "Host opening depth", type: "number", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.hostOpeningDepthMm, min: 1, step: 1, unit: "mm", affects: "placement" },
    { key: "minVentilationGapMm", label: "Min ventilation gap", type: "number", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.minVentilationGapMm, min: 0, step: 1, unit: "mm", affects: "placement" },
    { key: "requiresWorktop", label: "Requires worktop", type: "boolean", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.requiresWorktop, affects: "placement" },
    { key: "requiresWaterConnection", label: "Requires water", type: "boolean", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.requiresWaterConnection, affects: "placement" },
    { key: "requiresDrainConnection", label: "Requires drain", type: "boolean", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.requiresDrainConnection, affects: "placement" },
    { key: "requiresElectricalConnection", label: "Requires electric", type: "boolean", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.requiresElectricalConnection, affects: "placement" },
    { key: "allowedHostRoles", label: "Allowed host roles", type: "string", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.allowedHostRoles, affects: "placement" },
    { key: "notes", label: "Notes", type: "string", group: "technical", uiVisibility: "technical", defaultValue: definition.defaultParams.notes, affects: "export" }
  ];
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
