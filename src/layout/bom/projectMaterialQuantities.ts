import type {
  MaterialAssignmentCategory,
  ProjectMaterialQuantity
} from "../../core/project-materials/project-material-types";
import type { ProjectMaterialUsageSummary } from "./materialUsageSummary";

const CATEGORY_UNITS: ReadonlyArray<[MaterialAssignmentCategory, ProjectMaterialQuantity["unit"]]> = [
  ["corpus", "m2"],
  ["front", "m2"],
  ["worktop", "m2"],
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
  ["other_component", "pcs"]
];

const HARDWARE_CATEGORIES = new Set<MaterialAssignmentCategory>([
  "handle",
  "hinge",
  "runner",
  "lift_up",
  "leg",
  "fastener"
]);

const HARDWARE_CATEGORY_ALIASES: Readonly<Record<string, MaterialAssignmentCategory>> = {
  plinth_clip: "fastener",
  shelf_support: "fastener",
  hanging_bracket: "fastener"
};

export function projectMaterialQuantitiesFromUsageSummary(summary: ProjectMaterialUsageSummary): ProjectMaterialQuantity[] {
  const quantities = new Map<MaterialAssignmentCategory, ProjectMaterialQuantity>(
    CATEGORY_UNITS.map(([category, unit]) => [category, { category, unit, quantity: 0, pieces: 0 }])
  );

  for (const group of summary.groups) {
    if (["corpus", "front", "worktop", "plinth", "back", "drawer_bottom"].includes(group.id)) {
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
        addQuantity(quantities, category, item.quantity, item.pieces);
      }
    }
  }

  return CATEGORY_UNITS.map(([category]) => quantities.get(category)!);
}

function addQuantity(
  quantities: Map<MaterialAssignmentCategory, ProjectMaterialQuantity>,
  category: MaterialAssignmentCategory,
  quantity: number,
  pieces: number
): void {
  const target = quantities.get(category);
  if (!target) return;
  target.quantity = round(target.quantity + quantity);
  target.pieces = round((target.pieces ?? 0) + pieces);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
