import type { MaterialAssignmentCategory } from "../../core/project-materials/project-material-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";

const DIRECT_HARDWARE_CATEGORIES = new Set<MaterialAssignmentCategory>([
  "handle",
  "hinge",
  "runner",
  "lift_up",
  "leg", "hinge_plate", "leg_plate", "plinth_clip", "hanging_bracket", "shelf_support", "assembly_pack"
]);

const FASTENER_COMPONENT_TYPES = new Set([
  "fastener"
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
  if (item.id.startsWith("material-assignment:extra:")) return "other_component";
  if (item.itemType === "lighting") return "lighting";
  if (item.itemType === "edge_band") {
    // The same catalogue edge can be used on a front and on a corpus. Its
    // catalogue family must not move measured usage between project roles.
    const role = String(item.materialGroup ?? "").trim().toLowerCase();
    if (["front", "edge_front"].includes(role)) return "edge_front";
    if (["body", "corpus", "carcass", "shelf", "plinth", "worktop", "drawer_box", "edge_other"].includes(role)) return "edge_other";
    const family = String(item.material?.edgeFamily ?? item.category ?? "")
      .trim()
      .toLowerCase();
    return family.includes("front") ? "edge_front" : "edge_other";
  }

  if (item.itemType === "hardware") {
    // Generated hardware has no component until Supplier Bridge assigns one.
    // The BOM category remains authoritative during that intermediate state.
    const componentType = item.component?.componentType ?? item.category ?? item.materialGroup;
    if (componentType && DIRECT_HARDWARE_CATEGORIES.has(componentType as MaterialAssignmentCategory)) {
      return componentType as MaterialAssignmentCategory;
    }
    if (componentType && FASTENER_COMPONENT_TYPES.has(componentType)) return "fastener";
    return "other_component";
  }

  const group = normalizedGroup(item);
  if (["corpus", "carcass", "body", "shelf"].includes(group)) return "corpus";
  if (group === "front") return "front";
  if (group === "backsplash") return "backsplash";
  if (group === "worktop") return "worktop";
  if (group === "plinth") return "plinth";
  if (group === "back" || group === "back_panel") return "back";
  if (group === "drawer_bottom" || group === "drawer_box") return "drawer_bottom";
  return null;
}
