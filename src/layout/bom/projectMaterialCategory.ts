import type { MaterialAssignmentCategory } from "../../core/project-materials/project-material-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";

const DIRECT_HARDWARE_CATEGORIES = new Set<MaterialAssignmentCategory>([
  "handle",
  "hinge",
  "runner",
  "lift_up",
  "leg"
]);

const FASTENER_COMPONENT_TYPES = new Set([
  "fastener",
  "plinth_clip",
  "shelf_support",
  "hanging_bracket"
]);

function normalizedGroup(item: PortableQuoteBomItem): string {
  return String(item.materialGroup ?? item.material?.boardFamily ?? item.category ?? "")
    .trim()
    .toLowerCase();
}

/**
 * One canonical mapping from a commercial BOM line to the stable project
 * material/margin category. Keep Materials, pricing and server projections on
 * this function so a line cannot silently move between groups.
 */
export function projectMaterialCategoryForBomItem(
  item: PortableQuoteBomItem
): MaterialAssignmentCategory | null {
  if (item.itemType === "edge_band") {
    const family = String(item.material?.edgeFamily ?? item.materialGroup ?? item.category ?? "")
      .trim()
      .toLowerCase();
    return family.includes("front") ? "edge_front" : "edge_other";
  }

  if (item.itemType === "hardware") {
    const componentType = item.component?.componentType;
    if (componentType && DIRECT_HARDWARE_CATEGORIES.has(componentType as MaterialAssignmentCategory)) {
      return componentType as MaterialAssignmentCategory;
    }
    if (componentType && FASTENER_COMPONENT_TYPES.has(componentType)) return "fastener";
    return "other_component";
  }

  const group = normalizedGroup(item);
  if (["corpus", "carcass", "body", "shelf"].includes(group)) return "corpus";
  if (group === "front") return "front";
  if (group === "worktop") return "worktop";
  if (group === "plinth") return "plinth";
  if (group === "back" || group === "back_panel") return "back";
  if (group === "drawer_bottom" || group === "drawer_box") return "drawer_bottom";
  return null;
}
