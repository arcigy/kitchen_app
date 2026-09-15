import type {
  FurnQuoteModulePackage,
  KitchenModuleCapability,
  KitchenModuleContract,
  KitchenModulePlacementMode,
  KitchenModuleProductKind,
  KitchenModuleRole,
  KitchenModuleTopology,
  ModuleContextBinding,
  ModuleParameterDefinition
} from "../core/module-package/module-package-types";

export type KitchenSharedParameterPolicy = {
  key: string;
  type: ModuleParameterDefinition["type"];
  appliesTo: (contract: KitchenModuleContract) => boolean;
  required: (contract: KitchenModuleContract) => boolean;
  userVisible?: boolean;
};

const CABINET_CAPABILITIES: readonly KitchenModuleCapability[] = ["backs"];

function defaults(modulePackage: FurnQuoteModulePackage) {
  return Object.fromEntries(modulePackage.parameters.parameters.map((parameter) => [parameter.key, parameter.defaultValue]));
}

function hasParameter(modulePackage: FurnQuoteModulePackage, key: string) {
  return modulePackage.parameters.parameters.some((parameter) => parameter.key === key);
}

function canonicalRole(value: unknown): KitchenModuleRole | undefined {
  if (value === "low" || value === "base") return "low";
  if (value === "top" || value === "upper" || value === "wall") return "top";
  if (value === "tall") return "tall";
  return undefined;
}

function isKitchenPackage(modulePackage: FurnQuoteModulePackage) {
  const value = defaults(modulePackage).assemblyContext;
  return modulePackage.module.tags?.includes("kitchen") === true || value === "kitchen";
}

function inferProductKind(modulePackage: FurnQuoteModulePackage): KitchenModuleProductKind {
  if (canonicalRole(defaults(modulePackage).kitchenModuleRole)) return "cabinet";
  const type = modulePackage.module.moduleType.toLowerCase();
  if (type.includes("worktop")) return "worktop";
  if (type.includes("hardware") || type.includes("trim")) return "hardware";
  if (type.includes("accessory") || type.includes("lighting")) return "accessory";
  if (type.includes("cladding") || type.includes("front_component")) return "panel";
  if (type.includes("free_shelf")) return "shelf";
  if (type.includes("appliance")) return "appliance";
  return "cabinet";
}

function inferTopology(modulePackage: FurnQuoteModulePackage, values: Record<string, unknown>): KitchenModuleTopology {
  const corner = modulePackage.placement.requiresCorner === true || modulePackage.placement.allowedContexts.includes("kitchen_corner") || values.isCorner === true;
  if (!corner) return "rectangular";
  const width = typeof values.width === "number" ? values.width : null;
  const depth = typeof values.depth === "number" ? values.depth : null;
  return width !== null && depth !== null && Math.abs(width - depth) > 0.001
    ? "corner-asymmetric"
    : "corner-symmetric";
}

function inferPlacementMode(modulePackage: FurnQuoteModulePackage, topology: KitchenModuleTopology): KitchenModulePlacementMode {
  if (topology !== "rectangular") return "corner";
  return modulePackage.placement.allowFreePlacement === true || modulePackage.placement.allowedContexts.includes("free_standing")
    ? "free-standing"
    : "wall";
}

function inferCapabilities(modulePackage: FurnQuoteModulePackage, values: Record<string, unknown>, productKind: KitchenModuleProductKind): KitchenModuleCapability[] {
  const capability = new Set<KitchenModuleCapability>();
  if (productKind === "cabinet") CABINET_CAPABILITIES.forEach((item) => capability.add(item));
  if (
    values.hasPlinth === true ||
    (typeof values.plinthHeight === "number" && values.plinthHeight > 0) ||
    modulePackage.components.slots.some((slot) => slot.componentType === "plinth_clip" || slot.componentType === "leg")
  ) capability.add("plinth");
  if (values.requiresWorktop === true || productKind === "worktop") capability.add("worktop");
  if (hasParameter(modulePackage, "doorCount") || hasParameter(modulePackage, "opened") || modulePackage.materials.slots.some((slot) => slot.slotId === "front")) capability.add("fronts");
  if (hasParameter(modulePackage, "drawerCount") || modulePackage.components.slots.some((slot) => slot.componentType === "runner")) capability.add("drawers");
  if (hasParameter(modulePackage, "shelfCount")) capability.add("shelves");
  if (modulePackage.components.slots.some((slot) => slot.componentType === "handle")) capability.add("handles");
  if (modulePackage.components.slots.some((slot) => slot.componentType === "hinge")) capability.add("hinges");
  if (modulePackage.components.slots.some((slot) => slot.componentType === "runner")) capability.add("runners");
  if (hasParameter(modulePackage, "opened")) capability.add("openable");
  return [...capability].sort();
}

/** Resolves legacy packages for auditing only. New exports must carry kitchenContract explicitly. */
export function inferKitchenModuleContract(modulePackage: FurnQuoteModulePackage): KitchenModuleContract | null {
  if (!isKitchenPackage(modulePackage)) return null;
  const values = defaults(modulePackage);
  const productKind = inferProductKind(modulePackage);
  const topology = inferTopology(modulePackage, values);
  const role = productKind === "cabinet" ? canonicalRole(values.kitchenModuleRole) : undefined;
  return {
    version: 1,
    productKind,
    ...(role ? { role } : {}),
    topology,
    placementMode: inferPlacementMode(modulePackage, topology),
    capabilities: inferCapabilities(modulePackage, values, productKind),
    // V2 is supported by the FWM base-corner family. The run-time geometry
    // audit applies its two-arm plane invariant only to its chamfered variants.
    geometryContractVersion: modulePackage.module.moduleType === "fwm_catalog_base_corner" ? 3 : 1
  };
}

export function resolveKitchenModuleContract(modulePackage: FurnQuoteModulePackage): KitchenModuleContract | null {
  return modulePackage.kitchenContract ?? inferKitchenModuleContract(modulePackage);
}

function upsertParameter(parameters: ModuleParameterDefinition[], next: ModuleParameterDefinition) {
  const index = parameters.findIndex((parameter) => parameter.key === next.key);
  if (index >= 0) parameters[index] = { ...parameters[index], ...next };
  else parameters.push(next);
}

function isDrawerSystemChoiceParameter(key: string) {
  return key === "drawerSystemBrand" || key === "runnerComponentId" ||
    /^drawer\d+System(Size|Label|MinFrontHeightMm|BackHeightMm)$/.test(key) ||
    /^tallSlot\d+DrawerSystemSize$/.test(key) ||
    /^drawerSystem(?:Brand|Size|Sizes|Labels|Id|Code|Depth|BackHeightsMm|MinFrontHeightsMm|Price)/.test(key);
}

function removeDrawerSystemChoices(modulePackage: FurnQuoteModulePackage) {
  const removed = new Set(
    modulePackage.parameters.parameters
      .filter((parameter) => isDrawerSystemChoiceParameter(parameter.key))
      .map((parameter) => parameter.key)
  );
  if (removed.size === 0) return;
  modulePackage.parameters.parameters = modulePackage.parameters.parameters.filter((parameter) => !removed.has(parameter.key));
  modulePackage.ui = {
    ...modulePackage.ui,
    controls: modulePackage.ui.controls.filter((control) => !removed.has(control.parameterKey))
  };
}

function canonicalKitchenBinding(contract: KitchenModuleContract, modulePackage: FurnQuoteModulePackage): ModuleContextBinding | null {
  if (contract.productKind !== "cabinet" || !contract.role) return null;
  const has = (key: string) => hasParameter(modulePackage, key);
  const source = contract.role === "low"
    ? { height: "ctx.heightMm", carcass: "ctx.moduleHeightMm", depth: "ctx.moduleDepthMm" }
    : contract.role === "top"
      ? { height: "ctx.upperHeightMm", carcass: "ctx.upperHeightMm", depth: "ctx.upperDepthMm" }
      : { height: "ctx.tallHeightMm", carcass: "ctx.tallHeightMm", depth: "ctx.tallDepthMm" };
  return {
    contextType: "kitchenGroup",
    required: true,
    scope: "single",
    autoAssign: "activeKitchenGroup",
    liveSync: true,
    forbidCrossContextAdjacency: true,
    parameterSync: [
      ...(has("height") ? [{ targetParameter: "height", source: source.height, mode: "live" as const }] : []),
      ...(has("heightCarcass") ? [{ targetParameter: "heightCarcass", source: source.carcass, mode: "live" as const }] : []),
      ...(has("depth") ? [{ targetParameter: "depth", source: source.depth, mode: "live" as const }] : []),
      ...(contract.capabilities.includes("plinth") && has("plinthHeight") ? [{ targetParameter: "plinthHeight", source: "ctx.plinthHeightMm", mode: "live" as const }] : []),
      ...(contract.capabilities.includes("plinth") && has("plinthSetbackMm") ? [{ targetParameter: "plinthSetbackMm", source: "ctx.plinthDepthMm", mode: "live" as const }] : []),
      ...(contract.capabilities.includes("worktop") && has("worktopThicknessMm") ? [{ targetParameter: "worktopThicknessMm", source: "ctx.worktopThicknessMm", transform: "resolvedWorktopThickness" as const, mode: "live" as const }] : [])
    ],
    overridePolicy: { allowUserOverride: false, warnWhenDetachedFromContext: true }
  };
}

/**
 * Converts old system templates into the current contract without changing a
 * tenant-owned package. The repair command uses the same normalizer for an
 * explicit, reviewable DB refresh.
 */
export function normalizeKitchenModulePackage(modulePackage: FurnQuoteModulePackage): FurnQuoteModulePackage {
  const inferred = resolveKitchenModuleContract(modulePackage);
  if (!inferred) return modulePackage;
  const normalized = structuredClone(modulePackage);
  normalized.kitchenContract = inferred;
  const values = defaults(normalized);
  if (inferred.productKind === "cabinet" && inferred.role) {
    upsertParameter(normalized.parameters.parameters, {
      key: "kitchenModuleRole", label: "Kitchen module role", type: "select", required: true,
      defaultValue: inferred.role,
      options: [{ label: "low", value: "low" }, { label: "top", value: "top" }, { label: "tall", value: "tall" }],
      group: "system", uiVisibility: "technical", affects: "placement"
    });
    const currentHeight = typeof values.height === "number" ? values.height : 720;
    const currentDepth = typeof values.depth === "number" ? values.depth : 560;
    if (!hasParameter(normalized, "heightCarcass")) {
      upsertParameter(normalized.parameters.parameters, {
        key: "heightCarcass", label: "Carcass height", type: "number", required: true, defaultValue: currentHeight,
        min: 1, max: 3200, step: 1, unit: "mm", group: "dimensions", uiVisibility: "technical", affects: "geometry"
      });
    }
    if (!hasParameter(normalized, "width") && inferred.topology !== "corner-symmetric") {
      upsertParameter(normalized.parameters.parameters, {
        key: "width", label: "Width", type: "number", required: true, defaultValue: currentDepth,
        min: 1, max: 5000, step: 1, unit: "mm", group: "dimensions", uiVisibility: "user", affects: "geometry"
      });
    }
    upsertParameter(normalized.parameters.parameters, {
      key: "assemblyContext", label: "Assembly context", type: "select", required: true,
      defaultValue: "kitchen", options: [{ label: "kitchen", value: "kitchen" }],
      group: "system", uiVisibility: "technical", affects: "placement"
    });
    upsertParameter(normalized.parameters.parameters, {
      key: "requiresWorktop", label: "Requires worktop", type: "boolean", required: true,
      defaultValue: inferred.role === "low" && inferred.capabilities.includes("worktop"),
      group: "system", uiVisibility: "technical", affects: "placement"
    });
    const binding = canonicalKitchenBinding(inferred, normalized);
    const existingBinding = normalized.behavior?.contextBindings?.find((item) => item.contextType === "kitchenGroup");
    const repairedBinding = binding && existingBinding
      ? {
          ...existingBinding,
          ...binding,
          materialSync: existingBinding.materialSync,
          componentSync: existingBinding.componentSync,
          commercialSelectionSync: existingBinding.commercialSelectionSync
        }
      : binding;
    normalized.behavior = {
      ...normalized.behavior,
      contextBindings: [
        ...(normalized.behavior?.contextBindings ?? []).filter((item) => item.contextType !== "kitchenGroup"),
        ...(repairedBinding ? [repairedBinding] : [])
      ]
    };
  }
  if (inferred.topology === "corner-symmetric") {
    const width = normalized.parameters.parameters.find((parameter) => parameter.key === "width");
    if (width) width.uiVisibility = "internal";
  }
  if (inferred.productKind === "cabinet" && inferred.topology !== "corner-symmetric") {
    const width = normalized.parameters.parameters.find((parameter) => parameter.key === "width");
    if (width) width.uiVisibility = "user";
  }
  if (inferred.productKind === "cabinet" && !inferred.capabilities.includes("worktop")) {
    const thickness = normalized.parameters.parameters.find((parameter) => parameter.key === "worktopThicknessMm");
    if (thickness) thickness.uiVisibility = "internal";
  }
  if (inferred.topology !== "rectangular") {
    const top = inferred.role === "top";
    normalized.placement = {
      ...normalized.placement,
      allowedContexts: ["kitchen_corner"],
      requiredAnchors: top ? ["two_perpendicular_walls", "corner", "wall"] : ["two_perpendicular_walls", "corner", "floor"],
      requiresCorner: true,
      requiresWall: true,
      requiresFloor: !top,
      allowFreePlacement: false,
      corner: { required: true, allowedAngles: [90], toleranceDeg: 3, mustTouchBothWalls: true }
    };
    for (const [key, value] of [["isCorner", true], ["frontFaceCount", 0], ["backFaceCount", 2]] as const) {
      const parameter = normalized.parameters.parameters.find((item) => item.key === key);
      if (parameter) parameter.defaultValue = value;
      else upsertParameter(normalized.parameters.parameters, {
        key, label: key, type: typeof value === "boolean" ? "boolean" : "number", required: true, defaultValue: value,
        ...(typeof value === "number" ? { min: 0, max: 8, step: 1, unit: "pcs" as const } : {}),
        group: "system", uiVisibility: "technical", affects: "placement"
      });
    }
  }
  // Preserve an old value for package-local compatibility fields only.
  if (values.frontChamferReferenceMm !== undefined && inferred.geometryContractVersion === 2) {
    const parameter = normalized.parameters.parameters.find((item) => item.key === "frontChamferReferenceMm");
    if (parameter) parameter.uiVisibility = "internal";
  }
  if (inferred.geometryContractVersion >= 2) {
    upsertParameter(normalized.parameters.parameters, {
      key: "geometryContractVersion", label: "Geometry contract version", type: "number", required: true,
      defaultValue: inferred.geometryContractVersion, min: 1, max: 3, step: 1, unit: "pcs", group: "system", uiVisibility: "internal", affects: "geometry"
    });
  }
  // Drawer-system/size choices are assigned through materials/components,
  // never manually selected in module Properties. Geometry falls back to the
  // catalog assignment when a historical package still carries these keys.
  removeDrawerSystemChoices(normalized);
  return normalized;
}

export const KITCHEN_SHARED_PARAMETER_POLICIES: readonly KitchenSharedParameterPolicy[] = [
  { key: "assemblyContext", type: "select", appliesTo: () => true, required: () => true },
  { key: "kitchenModuleRole", type: "select", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet" },
  { key: "width", type: "number", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet" && contract.topology !== "corner-symmetric", userVisible: true },
  { key: "height", type: "number", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet", userVisible: true },
  { key: "depth", type: "number", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet", userVisible: true },
  { key: "heightCarcass", type: "number", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet" },
  { key: "requiresWorktop", type: "boolean", appliesTo: (contract) => contract.productKind === "cabinet", required: (contract) => contract.productKind === "cabinet" },
  { key: "plinthHeight", type: "number", appliesTo: (contract) => contract.capabilities.includes("plinth"), required: (contract) => contract.capabilities.includes("plinth") },
  { key: "plinthSetbackMm", type: "number", appliesTo: (contract) => contract.capabilities.includes("plinth"), required: (contract) => contract.capabilities.includes("plinth") },
  { key: "worktopThicknessMm", type: "number", appliesTo: (contract) => contract.capabilities.includes("worktop"), required: (contract) => contract.productKind === "cabinet" && contract.capabilities.includes("worktop") }
];
