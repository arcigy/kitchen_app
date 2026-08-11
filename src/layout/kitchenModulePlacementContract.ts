import { Vector3, type Object3D, type Mesh } from "three";
import type { FurnQuoteModulePackage, KitchenModuleContract, ModuleContextBinding, ModuleParameterDefinition } from "../core/module-package/module-package-types";
import { KITCHEN_SHARED_PARAMETER_POLICIES, resolveKitchenModuleContract } from "./kitchenModuleContract";

export type KitchenModulePlacementContractSeverity = "error" | "warning";

export type KitchenModulePlacementContractIssue = {
  severity: KitchenModulePlacementContractSeverity;
  code: string;
  message: string;
  path?: string;
};

function parameter(modulePackage: FurnQuoteModulePackage, key: string): ModuleParameterDefinition | null {
  return modulePackage.parameters.parameters.find((item) => item.key === key) ?? null;
}

function defaultValue(modulePackage: FurnQuoteModulePackage, key: string): unknown {
  return parameter(modulePackage, key)?.defaultValue;
}

function isKitchenTagged(modulePackage: FurnQuoteModulePackage) {
  return modulePackage.module.tags?.includes("kitchen") === true || defaultValue(modulePackage, "assemblyContext") === "kitchen";
}

function add(issues: KitchenModulePlacementContractIssue[], code: string, message: string, path?: string, severity: KitchenModulePlacementContractSeverity = "error") {
  issues.push({ severity, code, message, path });
}

function hasSync(binding: ModuleContextBinding | null, targetParameter: string, source: string) {
  return (binding?.parameterSync ?? []).some((rule) => rule.targetParameter === targetParameter && rule.source === source);
}

function kitchenBinding(modulePackage: FurnQuoteModulePackage) {
  return modulePackage.behavior?.contextBindings?.find((binding) => binding.contextType === "kitchenGroup") ?? null;
}

function auditContractMetadata(modulePackage: FurnQuoteModulePackage, contract: KitchenModuleContract, issues: KitchenModulePlacementContractIssue[]) {
  if (contract.version !== 1) add(issues, "contract.version", "Kitchen module contract version must be 1.", "kitchenContract.version");
  if (contract.productKind === "cabinet" && !contract.role) add(issues, "contract.role", "Cabinet contract must declare low, top, or tall role.", "kitchenContract.role");
  if (contract.productKind !== "cabinet" && contract.role) add(issues, "contract.non_cabinet_role", "Only cabinet packages may declare a kitchen role.", "kitchenContract.role");
  if (contract.topology !== "rectangular" && contract.placementMode !== "corner") add(issues, "contract.corner_placement", "Corner topology must use corner placement mode.", "kitchenContract.placementMode");
  if (contract.topology === "rectangular" && contract.placementMode === "corner") add(issues, "contract.rectangular_corner", "Rectangular topology cannot use corner placement mode.", "kitchenContract.placementMode");
  if (contract.geometryContractVersion !== 1 && contract.geometryContractVersion !== 2) add(issues, "contract.geometry_version", "Kitchen geometry contract version must be 1 or 2.", "kitchenContract.geometryContractVersion");
}

function auditSharedParameters(modulePackage: FurnQuoteModulePackage, contract: KitchenModuleContract, issues: KitchenModulePlacementContractIssue[]) {
  for (const policy of KITCHEN_SHARED_PARAMETER_POLICIES) {
    const item = parameter(modulePackage, policy.key);
    if (!policy.appliesTo(contract)) continue;
    if (!item) {
      if (policy.required(contract)) add(issues, "param.missing", `Missing required shared Kitchen parameter "${policy.key}".`, `parameters.${policy.key}`);
      continue;
    }
    if (item.type !== policy.type) add(issues, "param.type", `Parameter "${policy.key}" must be ${policy.type}, got ${item.type}.`, `parameters.${policy.key}.type`);
    if (policy.userVisible && policy.key === "width") {
      const shouldBeHidden = contract.topology === "corner-symmetric";
      if (shouldBeHidden && item.uiVisibility === "user") add(issues, "corner.width_visible", "Symmetric corner width is derived from depth and must not be user-visible.", "parameters.width.uiVisibility");
      if (!shouldBeHidden && item.uiVisibility !== "user") add(issues, "width.hidden", "Run width must be a user-visible per-instance parameter.", "parameters.width.uiVisibility");
    }
  }
  if (contract.productKind === "cabinet") {
    const role = parameter(modulePackage, "kitchenModuleRole");
    const options = role?.options?.map((option) => option.value) ?? [];
    if (role?.defaultValue !== contract.role) add(issues, "role.mismatch", "kitchenModuleRole must equal kitchenContract.role.", "parameters.kitchenModuleRole.defaultValue");
    for (const legacy of ["base", "upper", "wall"]) if (options.includes(legacy)) add(issues, "role.legacy_option", `Legacy role "${legacy}" must not be exported.`, "parameters.kitchenModuleRole.options");
    if (!options.includes("low") || !options.includes("top") || !options.includes("tall")) add(issues, "role.options", "Kitchen role options must include low, top and tall.", "parameters.kitchenModuleRole.options");
  }
}

function auditBinding(modulePackage: FurnQuoteModulePackage, contract: KitchenModuleContract, issues: KitchenModulePlacementContractIssue[]) {
  if (contract.productKind !== "cabinet") return;
  const binding = kitchenBinding(modulePackage);
  if (!binding) {
    add(issues, "context.missing", "Kitchen cabinet must declare a kitchenGroup context binding.", "behavior.contextBindings");
    return;
  }
  if (binding.required !== true) add(issues, "context.required", "Kitchen binding must be required.", "behavior.contextBindings[].required");
  if (binding.scope !== "single") add(issues, "context.scope", "Kitchen binding scope must be single.", "behavior.contextBindings[].scope");
  if (binding.autoAssign !== "activeKitchenGroup") add(issues, "context.auto_assign", "Kitchen binding must use activeKitchenGroup.", "behavior.contextBindings[].autoAssign");
  if (binding.liveSync !== true) add(issues, "context.live_sync", "Kitchen binding must live-sync shared values.", "behavior.contextBindings[].liveSync");
  if (binding.forbidCrossContextAdjacency !== true) add(issues, "context.cross_context", "Kitchen binding must block cross-context adjacency.", "behavior.contextBindings[].forbidCrossContextAdjacency");
  const sources = contract.role === "low"
    ? { height: "ctx.heightMm", carcass: "ctx.moduleHeightMm", depth: "ctx.moduleDepthMm" }
    : contract.role === "top"
      ? { height: "ctx.upperHeightMm", carcass: "ctx.upperHeightMm", depth: "ctx.upperDepthMm" }
      : { height: "ctx.tallHeightMm", carcass: "ctx.tallHeightMm", depth: "ctx.tallDepthMm" };
  for (const [parameterKey, source] of [["height", sources.height], ["heightCarcass", sources.carcass], ["depth", sources.depth]] as const) {
    if (parameter(modulePackage, parameterKey) && !hasSync(binding, parameterKey, source)) add(issues, `sync.${parameterKey}`, `"${parameterKey}" must live-sync from ${source}.`, "behavior.contextBindings[].parameterSync");
  }
  if (contract.capabilities.includes("plinth")) {
    if (parameter(modulePackage, "plinthHeight") && !hasSync(binding, "plinthHeight", "ctx.plinthHeightMm")) add(issues, "sync.plinth_height", "Plinth height must sync from ctx.plinthHeightMm.", "behavior.contextBindings[].parameterSync");
    if (parameter(modulePackage, "plinthSetbackMm") && !hasSync(binding, "plinthSetbackMm", "ctx.plinthDepthMm")) add(issues, "sync.plinth_setback", "Plinth setback must sync from ctx.plinthDepthMm.", "behavior.contextBindings[].parameterSync");
  }
  if (contract.role !== "low" && defaultValue(modulePackage, "requiresWorktop") !== false) add(issues, "role.worktop", "Top and tall cabinets must not require a worktop.", "parameters.requiresWorktop.defaultValue");
}

function auditPlacement(modulePackage: FurnQuoteModulePackage, contract: KitchenModuleContract, issues: KitchenModulePlacementContractIssue[]) {
  const placement = modulePackage.placement;
  if (contract.placementMode === "corner") {
    if (placement.allowedContexts.length !== 1 || !placement.allowedContexts.includes("kitchen_corner")) add(issues, "corner.context", "Corner modules must allow only kitchen_corner placement.", "placement.allowedContexts");
    if (placement.requiresCorner !== true || placement.requiresWall !== true || placement.allowFreePlacement !== false) add(issues, "corner.placement", "Corner modules must require walls/corner and disallow free placement.", "placement");
    if (contract.role === "low" && placement.requiresFloor !== true) add(issues, "corner.floor", "Low corner cabinet must require floor.", "placement.requiresFloor");
    if (contract.role === "top" && placement.requiresFloor === true) add(issues, "corner.top_floor", "Top corner cabinet must not require floor.", "placement.requiresFloor");
    if (placement.corner?.required !== true || placement.corner.mustTouchBothWalls !== true) add(issues, "corner.touch", "Corner modules must touch both walls of a 90-degree corner.", "placement.corner");
    for (const [key, expected] of [["isCorner", true], ["frontFaceCount", 0], ["backFaceCount", 2]] as const) {
      if (defaultValue(modulePackage, key) !== expected) add(issues, `corner.${key}`, `Corner module must set ${key}=${String(expected)}.`, `parameters.${key}.defaultValue`);
    }
  }
  if (contract.placementMode === "wall" && contract.productKind === "cabinet" && !placement.allowedContexts.includes("kitchen_wall")) add(issues, "wall.context", "Wall-bound cabinet must support kitchen_wall placement.", "placement.allowedContexts");
  if (contract.placementMode === "wall" && contract.productKind === "cabinet" && placement.requiresWall !== true) add(issues, "wall.required", "Wall-bound cabinet must require wall alignment.", "placement.requiresWall");
}

export function auditKitchenModulePlacementContract(modulePackage: FurnQuoteModulePackage): KitchenModulePlacementContractIssue[] {
  const issues: KitchenModulePlacementContractIssue[] = [];
  if (!isKitchenTagged(modulePackage)) return issues;
  const contract = resolveKitchenModuleContract(modulePackage);
  if (!contract) {
    add(issues, "contract.missing", "Kitchen-tagged package must declare kitchenContract.", "kitchenContract");
    return issues;
  }
  if (!modulePackage.kitchenContract) add(issues, "contract.legacy", "Kitchen package relies on inferred legacy contract; repair and re-export it.", "kitchenContract", "warning");
  auditContractMetadata(modulePackage, contract, issues);
  auditSharedParameters(modulePackage, contract, issues);
  auditBinding(modulePackage, contract, issues);
  auditPlacement(modulePackage, contract, issues);
  return issues;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function isBoardMaterialGroup(value: unknown) {
  return typeof value === "string" && ["corpus", "body", "carcass", "front", "back", "shelf", "drawer_bottom", "plinth", "worktop"].includes(value);
}

export function auditKitchenModuleGeometryContract(modulePackage: FurnQuoteModulePackage, root: Object3D): KitchenModulePlacementContractIssue[] {
  const issues: KitchenModulePlacementContractIssue[] = [];
  root.traverse((object) => {
    if (!isMesh(object) || !isBoardMaterialGroup(object.userData.materialGroup)) return;
    const grainAlong = object.userData.grainAlong;
    if (grainAlong !== "width" && grainAlong !== "height" && grainAlong !== "depth") add(issues, "board.grain", `Board mesh "${object.name}" is missing grainAlong metadata.`, `mesh.${object.name}.userData.grainAlong`);
  });
  const contract = resolveKitchenModuleContract(modulePackage);
  const isChamferedCorner = String(defaultValue(modulePackage, "variant") ?? "").startsWith("corner_chamfered");
  if (contract?.placementMode === "corner" && contract.geometryContractVersion === 2 && isChamferedCorner) {
    const corner = root.getObjectByName("__kitchen_corner_anchor");
    const xArm = root.getObjectByName("__kitchen_corner_x_anchor");
    const zArm = root.getObjectByName("__kitchen_corner_z_anchor");
    if (!corner || !xArm || !zArm) {
      add(issues, "corner.anchor.missing", "Corner geometry contract v2 requires corner, X-arm, and Z-arm reference anchors.", "geometry.kitchenCornerAnchors");
    } else {
      root.updateWorldMatrix(true, true);
      const cornerPosition = corner.getWorldPosition(new Vector3()).multiplyScalar(1000);
      const xArmPosition = xArm.getWorldPosition(new Vector3()).multiplyScalar(1000);
      const zArmPosition = zArm.getWorldPosition(new Vector3()).multiplyScalar(1000);
      const expectedArmLength = defaultValue(modulePackage, "depth");
      if (typeof expectedArmLength !== "number") {
        add(issues, "corner.arm_length.missing", "Corner geometry contract v2 requires a numeric depth reference length.", "parameters.depth.defaultValue");
      } else {
        const toleranceMm = 0.01;
        if (Math.abs(cornerPosition.x - xArmPosition.x - expectedArmLength) > toleranceMm || Math.abs(cornerPosition.z - xArmPosition.z) > toleranceMm) {
          add(issues, "corner.x_arm_length", `Corner X-arm reference plane must be exactly ${expectedArmLength} mm from the corner.`, "geometry.kitchenCornerAnchors.x");
        }
        if (Math.abs(zArmPosition.z - cornerPosition.z - expectedArmLength) > toleranceMm || Math.abs(zArmPosition.x - cornerPosition.x) > toleranceMm) {
          add(issues, "corner.z_arm_length", `Corner Z-arm reference plane must be exactly ${expectedArmLength} mm from the corner.`, "geometry.kitchenCornerAnchors.z");
        }
      }
    }
  }
  return issues;
}
