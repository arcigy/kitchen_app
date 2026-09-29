import type {
  MaterialAssignmentCategory,
  ProjectMaterialQuantity
} from "../../core/project-materials/project-material-types";
import type { ProjectMaterialUsageSummary } from "./materialUsageSummary";

const CATEGORY_UNITS: ReadonlyArray<[MaterialAssignmentCategory, ProjectMaterialQuantity["unit"]]> = [
  ["corpus", "m2"],
  ["front", "m2"],
  ["worktop", "m2"],
  ["backsplash", "m2"],
  ["plinth", "lm"],
  ["back", "m2"],
  ["drawer_bottom", "m2"],
  ["edge_front", "lm"],
  ["edge_other", "lm"],
  ["handle", "pcs"],
  ["hinge", "pcs"],
  ["runner", "pcs"],
  ["lift_up", "pcs"],
  ["leg", "pcs"],
  ["fastener", "pcs"],
  ["hinge_plate", "pcs"],
  ["leg_plate", "pcs"],
  ["plinth_clip", "pcs"],
  ["hanging_bracket", "pcs"],
  ["shelf_support", "pcs"],
  ["assembly_pack", "pcs"],

  ["other_component", "pcs"],
  ["lighting", "m2"]
];

const HARDWARE_CATEGORIES = new Set<MaterialAssignmentCategory>([
  "handle",
  "hinge",
  "runner",
  "lift_up",
  "leg",
  "fastener", "hinge_plate", "leg_plate", "plinth_clip", "hanging_bracket", "shelf_support", "assembly_pack"
]);

const HARDWARE_CATEGORY_ALIASES: Readonly<Record<string, MaterialAssignmentCategory>> = {
  plinth_clip: "plinth_clip",
  shelf_support: "shelf_support",
  hanging_bracket: "hanging_bracket"
};

export function projectMaterialQuantitiesFromUsageSummary(summary: ProjectMaterialUsageSummary): ProjectMaterialQuantity[] {
  const quantities = new Map<MaterialAssignmentCategory, ProjectMaterialQuantity>(
    CATEGORY_UNITS.map(([category, unit]) => [category, { category, unit, quantity: 0, pieces: 0 }])
  );

  for (const group of summary.groups) {
    if (["corpus", "front", "worktop", "plinth", "back", "drawer_bottom", "backsplash", "lighting"].includes(group.id)) {
      addQuantity(quantities, group.id as MaterialAssignmentCategory, group.quantity, group.pieces);
      continue;
    }
    if (group.id === "edge") {
      for (const item of group.items) {
        addQuantity(quantities, item.usageRole === "front" ? "edge_front" : "edge_other", item.quantity, item.pieces);
      }
      continue;
    }
    if (group.id === "hardware") {
      for (const item of group.items) {
        const role = item.usageRole as MaterialAssignmentCategory | undefined;
        const category = role && HARDWARE_CATEGORIES.has(role)
          ? role
          : HARDWARE_CATEGORY_ALIASES[item.usageRole ?? ""] ?? "other_component";
        addQuantity(quantities, category, item.quantity, item.pieces, item.unit);
      }
    }
  }

  return CATEGORY_UNITS.map(([category]) => quantities.get(category)!);
}

function addQuantity(
  quantities: Map<MaterialAssignmentCategory, ProjectMaterialQuantity>,
  category: MaterialAssignmentCategory,
  quantity: number,
  pieces: number, unit?: ProjectMaterialQuantity["unit"]
): void {
  const target = quantities.get(category);
  if (!target) return;
  if (unit) target.unit = target.unit === "custom" ? "custom" : (target.pieces ?? 0) === 0 ? unit : target.unit === unit ? unit : "custom";
  target.quantity = target.unit === "custom" ? 0 : round(target.quantity + quantity);
  target.pieces = round((target.pieces ?? 0) + pieces);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
