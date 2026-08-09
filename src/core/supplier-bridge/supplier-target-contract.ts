import type { MaterialAssignmentCategory } from "../project-materials/project-material-types";
import type { SupplierExpectedProductType } from "./supplier-bridge-types";

const BOARD_CATEGORIES = new Set<MaterialAssignmentCategory>([
  "corpus", "front", "worktop", "plinth", "back", "drawer_bottom"
]);

const GENERIC_HARDWARE_TYPES = new Set(["hardware", "component", "other", "unknown"]);
const SPECIFIC_HARDWARE_TYPES = new Set([
  "hinge", "drawer system", "handle", "lift up", "leg", "fastener", "lighting"
]);

function normalized(value: string | null | undefined): string | null {
  if (value == null) return null;
  const result = value.toLocaleLowerCase("sk-SK").replace(/[\s_-]+/g, " ").trim();
  return result || null;
}

export function supplierExpectedProductTypeForMaterialCategory(category: MaterialAssignmentCategory): SupplierExpectedProductType {
  if (category === "worktop") return "worktop";
  if (category === "edge_front" || category === "edge_other") return "edge_band";
  if (category === "hinge") return "hinge";
  if (category === "runner") return "drawer_system";
  if (category === "handle") return "handle";
  if (category === "lift_up") return "lift_up";
  if (category === "leg") return "leg";
  if (category === "fastener") return "fastener";
  if (category === "lighting") return "lighting";
  if (category === "other_component") return "component";
  return "board";
}

export function supplierTargetUsesThicknessConflict(category: MaterialAssignmentCategory | undefined, expectedProductType: string | null): boolean {
  if (category) return BOARD_CATEGORIES.has(category);
  return expectedProductType === "board" || expectedProductType === "worktop";
}

export function supplierProductTypeIsCompatible(args: {
  category?: MaterialAssignmentCategory;
  expected: string | null;
  observed: string | null;
}): boolean {
  const expected = normalized(args.expected);
  const observed = normalized(args.observed);
  if (expected == null || observed == null || expected === observed) return true;

  if (expected === "component") return GENERIC_HARDWARE_TYPES.has(observed) || SPECIFIC_HARDWARE_TYPES.has(observed);
  if (expected === "hardware") return GENERIC_HARDWARE_TYPES.has(observed) || SPECIFIC_HARDWARE_TYPES.has(observed);
  return SPECIFIC_HARDWARE_TYPES.has(expected) && GENERIC_HARDWARE_TYPES.has(observed);
}
