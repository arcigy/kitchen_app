import type { Object3D, Mesh } from "three";
import type { FurnQuoteModulePackage, ModuleContextBinding, ModuleParameterDefinition } from "../core/module-package/module-package-types";
import { isKitchenCornerModule, type KitchenModuleContractRole } from "./kitchenModuleRules";

export type KitchenModulePlacementContractSeverity = "error" | "warning";

export type KitchenModulePlacementContractIssue = {
  severity: KitchenModulePlacementContractSeverity;
  code: string;
  message: string;
  path?: string;
};

function param(modulePackage: FurnQuoteModulePackage, key: string): ModuleParameterDefinition | null {
  return modulePackage.parameters.parameters.find((item) => item.key === key) ?? null;
}

function defaultValue(modulePackage: FurnQuoteModulePackage, key: string): unknown {
  return param(modulePackage, key)?.defaultValue;
}

function paramOptions(parameter: ModuleParameterDefinition | null): string[] {
  return parameter?.options?.map((option) => option.value) ?? [];
}

function isKitchenPackage(modulePackage: FurnQuoteModulePackage) {
  if ((modulePackage.module.tags ?? []).includes("kitchen")) return true;
  return defaultValue(modulePackage, "assemblyContext") === "kitchen";
}

function readContractRole(modulePackage: FurnQuoteModulePackage): KitchenModuleContractRole | null {
  const raw = defaultValue(modulePackage, "kitchenModuleRole");
  if (raw === "low" || raw === "top" || raw === "tall") return raw;
  return null;
}

function legacyRoleName(value: unknown) {
  return value === "base" || value === "upper" || value === "wall";
}

function kitchenBinding(modulePackage: FurnQuoteModulePackage): ModuleContextBinding | null {
  return modulePackage.behavior?.contextBindings?.find((binding) => binding.contextType === "kitchenGroup") ?? null;
}

function hasSync(binding: ModuleContextBinding | null, targetParameter: string, source: string) {
  return (binding?.parameterSync ?? []).some((rule) => rule.targetParameter === targetParameter && rule.source === source);
}

function add(
  issues: KitchenModulePlacementContractIssue[],
  severity: KitchenModulePlacementContractSeverity,
  code: string,
  message: string,
  path?: string
) {
  issues.push({ severity, code, message, path });
}

function requireParam(
  issues: KitchenModulePlacementContractIssue[],
  modulePackage: FurnQuoteModulePackage,
  key: string,
  type?: ModuleParameterDefinition["type"]
) {
  const parameter = param(modulePackage, key);
  if (!parameter) {
    add(issues, "error", "param.missing", `Missing required kitchen module parameter "${key}".`, `parameters.${key}`);
    return null;
  }
  if (type && parameter.type !== type) {
    add(issues, "error", "param.type", `Parameter "${key}" must be ${type}, got ${parameter.type}.`, `parameters.${key}.type`);
  }
  return parameter;
}

function auditRole(modulePackage: FurnQuoteModulePackage, issues: KitchenModulePlacementContractIssue[]) {
  const roleParam = requireParam(issues, modulePackage, "kitchenModuleRole", "select");
  const roleDefault = roleParam?.defaultValue;
  if (legacyRoleName(roleDefault)) {
    add(issues, "error", "role.legacy", `Kitchen module role must use low/top/tall, not legacy "${String(roleDefault)}".`, "parameters.kitchenModuleRole.defaultValue");
  }
  if (roleDefault !== "low" && roleDefault !== "top" && roleDefault !== "tall") {
    add(issues, "error", "role.invalid", "Kitchen module role must be one of low, top, tall.", "parameters.kitchenModuleRole.defaultValue");
  }
  const options = paramOptions(roleParam);
  for (const expected of ["low", "top", "tall"]) {
    if (!options.includes(expected)) {
      add(issues, "error", "role.options", `Kitchen module role options must include ${expected}.`, "parameters.kitchenModuleRole.options");
    }
  }
  for (const forbidden of ["base", "upper", "wall"]) {
    if (options.includes(forbidden)) {
      add(issues, "error", "role.legacy_option", `Kitchen module role options must not expose legacy "${forbidden}".`, "parameters.kitchenModuleRole.options");
    }
  }
}

function auditContextBinding(modulePackage: FurnQuoteModulePackage, role: KitchenModuleContractRole | null, issues: KitchenModulePlacementContractIssue[]) {
  const binding = kitchenBinding(modulePackage);
  const params = Object.fromEntries(modulePackage.parameters.parameters.map((item) => [item.key, item.defaultValue]));
  const corner = isKitchenCornerModule(params, modulePackage);
  if (!binding) {
    add(issues, "error", "context.missing", "Kitchen modules must declare a kitchenGroup context binding.", "behavior.contextBindings");
    return;
  }
  if (binding.required !== true) add(issues, "error", "context.required", "Kitchen group binding must be required.", "behavior.contextBindings[].required");
  if (binding.scope !== "single") add(issues, "error", "context.scope", "Kitchen group binding scope must be single.", "behavior.contextBindings[].scope");
  if (binding.autoAssign !== "activeKitchenGroup") add(issues, "error", "context.auto_assign", "Kitchen modules must auto-assign to the active kitchen group.", "behavior.contextBindings[].autoAssign");
  if (binding.liveSync !== true) add(issues, "error", "context.live_sync", "Kitchen context binding must live-sync placement dimensions.", "behavior.contextBindings[].liveSync");
  if (binding.forbidCrossContextAdjacency !== true) add(issues, "warning", "context.cross_context", "Kitchen modules should forbid cross-context adjacency.", "behavior.contextBindings[].forbidCrossContextAdjacency");

  if (role === "low") {
    if (!hasSync(binding, "height", "ctx.heightMm")) add(issues, "error", "sync.height", "Low modules must sync height from ctx.heightMm.", "behavior.contextBindings[].parameterSync");
    if (!hasSync(binding, "heightCarcass", "ctx.moduleHeightMm")) add(issues, "error", "sync.height_carcass", "Low modules must sync carcass height from ctx.moduleHeightMm.", "behavior.contextBindings[].parameterSync");
    if (!hasSync(binding, "depth", "ctx.moduleDepthMm")) {
      add(issues, "error", corner ? "sync.corner_depth" : "sync.depth", "Low modules, including corner low modules, must sync depth from ctx.moduleDepthMm so they always follow the kitchen worktop depth.", "behavior.contextBindings[].parameterSync");
    }
    if (defaultValue(modulePackage, "requiresWorktop") === true && !hasSync(binding, "worktopThicknessMm", "ctx.worktopThicknessMm")) {
      add(issues, "error", "sync.worktop", "Worktop-based low modules must sync worktopThicknessMm from ctx.worktopThicknessMm.", "behavior.contextBindings[].parameterSync");
    }
  }
  if (role === "top") {
    if (!hasSync(binding, "height", "ctx.upperHeightMm")) add(issues, "error", "sync.top_height", "Top modules must sync height from ctx.upperHeightMm.", "behavior.contextBindings[].parameterSync");
    if (!hasSync(binding, "depth", "ctx.upperDepthMm")) add(issues, "error", "sync.top_depth", "Top modules must sync depth from ctx.upperDepthMm.", "behavior.contextBindings[].parameterSync");
  }
}

function auditPlacement(modulePackage: FurnQuoteModulePackage, role: KitchenModuleContractRole | null, issues: KitchenModulePlacementContractIssue[]) {
  const placement = modulePackage.placement;
  const params = Object.fromEntries(modulePackage.parameters.parameters.map((item) => [item.key, item.defaultValue]));
  const corner = isKitchenCornerModule(params, modulePackage);

  if (corner) {
    if (role !== "low" && role !== "top") add(issues, "error", "corner.role", "Corner kitchen modules must be low or top modules.", "parameters.kitchenModuleRole.defaultValue");
    if (defaultValue(modulePackage, "isCorner") !== true) add(issues, "error", "corner.flag", "Corner modules must set isCorner=true.", "parameters.isCorner.defaultValue");
    if (defaultValue(modulePackage, "frontFaceCount") !== 0) add(issues, "error", "corner.front_count", "Corner modules must have frontFaceCount=0.", "parameters.frontFaceCount.defaultValue");
    if (defaultValue(modulePackage, "backFaceCount") !== 2) add(issues, "error", "corner.back_count", "Corner modules must have backFaceCount=2.", "parameters.backFaceCount.defaultValue");
    if (!placement.allowedContexts.includes("kitchen_corner") || placement.allowedContexts.length !== 1) {
      add(issues, "error", "corner.context", "Corner modules must allow only kitchen_corner placement context.", "placement.allowedContexts");
    }
    if (placement.requiresCorner !== true) add(issues, "error", "corner.requires_corner", "Corner modules must set requiresCorner=true.", "placement.requiresCorner");
    if (placement.requiresWall !== true) add(issues, "error", "corner.requires_wall", "Corner modules must require walls.", "placement.requiresWall");
    if (role === "low" && placement.requiresFloor !== true) add(issues, "error", "corner.requires_floor", "Low corner modules must require floor.", "placement.requiresFloor");
    if (role === "top" && placement.requiresFloor === true) add(issues, "error", "corner.top_floor", "Top corner modules must not require floor.", "placement.requiresFloor");
    if (placement.allowFreePlacement !== false) add(issues, "error", "corner.free", "Corner modules must not allow free placement.", "placement.allowFreePlacement");
    const requiredAnchors = role === "top" ? ["two_perpendicular_walls", "corner", "wall"] : ["two_perpendicular_walls", "corner", "floor"];
    for (const anchor of requiredAnchors) {
      if (!(placement.requiredAnchors ?? []).includes(anchor as never)) {
        add(issues, "error", "corner.anchor", `Corner modules must require ${anchor} anchor.`, "placement.requiredAnchors");
      }
    }
    if (placement.corner?.required !== true || placement.corner.mustTouchBothWalls !== true) {
      add(issues, "error", "corner.touch", "Corner placement must require a 90-degree corner touching both walls.", "placement.corner");
    }
    const width = param(modulePackage, "width");
    if (width?.uiVisibility === "user") {
      add(issues, "error", "corner.width_visible", "Corner modules must not expose width as an independent user parameter; depth controls both legs.", "parameters.width.uiVisibility");
    }
    const cornerShape = defaultValue(modulePackage, "cornerShape");
    if (cornerShape === "none" || cornerShape == null) {
      add(issues, "error", "corner.shape", "Corner modules must set a concrete cornerShape.", "parameters.cornerShape.defaultValue");
    }
  } else if (defaultValue(modulePackage, "isCorner") === true) {
    add(issues, "error", "corner.false_positive", "Non-corner modules must not set isCorner=true.", "parameters.isCorner.defaultValue");
  }

  if (role === "low" && !corner && !placement.allowedContexts.includes("kitchen_wall")) {
    add(issues, "error", "low.context", "Low non-corner modules must support kitchen_wall placement.", "placement.allowedContexts");
  }
  if (role === "low" && !corner && placement.requiresWall !== true) {
    add(issues, "error", "low.wall", "Low wall/worktop modules must require wall alignment.", "placement.requiresWall");
  }
  if (role === "top" && placement.requiresWall !== true) {
    add(issues, "error", "top.wall", "Top modules must require wall placement.", "placement.requiresWall");
  }
  if (role === "tall" && defaultValue(modulePackage, "requiresWorktop") !== false) {
    add(issues, "error", "tall.worktop", "Tall modules must not require a worktop.", "parameters.requiresWorktop.defaultValue");
  }
}

function auditDimensions(modulePackage: FurnQuoteModulePackage, role: KitchenModuleContractRole | null, issues: KitchenModulePlacementContractIssue[]) {
  for (const key of ["height", "depth"]) requireParam(issues, modulePackage, key, "number");
  if (role !== null) requireParam(issues, modulePackage, "requiresWorktop", "boolean");
  const height = defaultValue(modulePackage, "height");
  const depth = defaultValue(modulePackage, "depth");
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) add(issues, "error", "dimension.height", "Height default must be a positive number.", "parameters.height.defaultValue");
  if (typeof depth !== "number" || !Number.isFinite(depth) || depth <= 0) add(issues, "error", "dimension.depth", "Depth default must be a positive number.", "parameters.depth.defaultValue");
}

export function auditKitchenModulePlacementContract(modulePackage: FurnQuoteModulePackage): KitchenModulePlacementContractIssue[] {
  const issues: KitchenModulePlacementContractIssue[] = [];
  if (!isKitchenPackage(modulePackage)) return issues;
  auditRole(modulePackage, issues);
  const role = readContractRole(modulePackage);
  auditDimensions(modulePackage, role, issues);
  auditContextBinding(modulePackage, role, issues);
  auditPlacement(modulePackage, role, issues);
  return issues;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function isBoardMaterialGroup(value: unknown) {
  if (typeof value !== "string") return false;
  return ["corpus", "body", "carcass", "front", "back", "shelf", "drawer_bottom", "plinth", "worktop"].includes(value);
}

export function auditKitchenModuleGeometryContract(modulePackage: FurnQuoteModulePackage, root: Object3D): KitchenModulePlacementContractIssue[] {
  const issues: KitchenModulePlacementContractIssue[] = [];
  root.traverse((object) => {
    if (!isMesh(object)) return;
    const materialGroup = object.userData.materialGroup;
    if (!isBoardMaterialGroup(materialGroup)) return;
    const grainAlong = object.userData.grainAlong;
    if (grainAlong !== "width" && grainAlong !== "height" && grainAlong !== "depth") {
      add(
        issues,
        "error",
        "board.grain",
        `Board mesh "${object.name}" in ${modulePackage.module.moduleType} is missing grainAlong metadata.`,
        `mesh.${object.name}.userData.grainAlong`
      );
    }
  });
  return issues;
}
