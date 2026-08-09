import type {
  ProjectMaterialAssignment,
  ProjectMaterialScopeKind,
  ProjectMaterialsView
} from "../../../src/core/project-materials/project-material-types";
import {
  resolveEffectiveProjectMaterialAssignment,
  topLevelProjectMaterialAssignments
} from "../../../src/core/project-materials/project-material-assignment-resolution";

export type ExtensionMaterialTarget = {
  id: string;
  category: ProjectMaterialAssignment["category"];
  label: string;
  groupId: string;
  group: string;
  scope: "general" | ProjectMaterialScopeKind;
  assigned: boolean;
  assignedText: string;
  assignedProductCode: string | null;
  inherited: boolean;
};

export type ExtensionMaterialTargetGroup = {
  id: string;
  label: string;
  targets: ExtensionMaterialTarget[];
  assignedCount: number;
};

export const materialCategoryLabels: Record<ProjectMaterialAssignment["category"], string> = {
  corpus: "Korpus", front: "Fronty", worktop: "Pracovná doska", plinth: "Sokel", back: "Chrbát",
  drawer_bottom: "Dná zásuviek", edge_front: "Hrany frontov", edge_other: "Hrany korpusu",
  handle: "Úchytky", hinge: "Pánty", runner: "Zásuvkové výsuvy", lift_up: "Výklopy",
  leg: "Nožičky", fastener: "Spojovací materiál", lighting: "Osvetlenie", other_component: "Ostatné komponenty"
};

function bridgeAssignment(assignment: ProjectMaterialAssignment | undefined): {
  assigned: boolean;
  text: string;
  productCode: string | null;
} {
  const bridge = assignment?.customValues.supplierBridge;
  if (!bridge || typeof bridge !== "object" || Array.isArray(bridge)) {
    return { assigned: false, text: "Nepriradené", productCode: null };
  }
  const value = bridge as Record<string, unknown>;
  const snapshotDisplayName = assignment?.snapshots.material?.definition.displayName
    ?? assignment?.snapshots.component?.definition.displayName
    ?? assignment?.snapshots.edgeFront?.definition.displayName
    ?? assignment?.snapshots.edgeOther?.definition.displayName
    ?? "";
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : snapshotDisplayName.trim();
  const productCode = typeof value.supplierProductCode === "string" ? value.supplierProductCode.trim() : "";
  if (!displayName && !productCode) return { assigned: false, text: "Nepriradené", productCode: null };
  return {
    assigned: true,
    text: [displayName || "Materiál", productCode].filter(Boolean).join(" · "),
    productCode: productCode || null
  };
}

function assignmentLabel(assignment: ProjectMaterialAssignment): string {
  const categoryLabel = materialCategoryLabels[assignment.category];
  if (assignment.category !== "runner" || !assignment.variantKey) return categoryLabel;
  const height = assignment.variantKey.match(/^front-height:(\d+)$/)?.[1];
  return height ? `${categoryLabel} · Čelo ${height} mm` : categoryLabel;
}

export function extensionMaterialTargets(view: ProjectMaterialsView | null): ExtensionMaterialTarget[] {
  if (!view) return [];
  const assignments = view.assignments.assignments;
  const general = topLevelProjectMaterialAssignments(assignments);
  const targets: ExtensionMaterialTarget[] = general.map((assignment) => {
    const bridge = bridgeAssignment(assignment);
    return {
      id: assignment.assignmentId,
      category: assignment.category,
      label: assignmentLabel(assignment),
      groupId: "general",
      group: "Celý projekt",
      scope: "general",
      assigned: bridge.assigned,
      assignedText: bridge.text,
      assignedProductCode: bridge.productCode,
      inherited: false
    };
  });
  for (const scope of view.scopes ?? []) {
    for (const item of scope.items) {
      const effective = resolveEffectiveProjectMaterialAssignment(assignments, scope.id, item);
      const bridge = bridgeAssignment(effective.assignment ?? undefined);
      targets.push({
        id: effective.assignmentId,
        category: item.category,
        label: item.label || materialCategoryLabels[item.category],
        groupId: `${scope.kind}:${scope.id}`,
        group: scope.label,
        scope: scope.kind,
        assigned: bridge.assigned,
        assignedText: bridge.text,
        assignedProductCode: bridge.productCode,
        inherited: effective.source === "general"
      });
    }
  }
  return targets;
}

export function extensionMaterialTargetGroups(
  targets: readonly ExtensionMaterialTarget[],
  scope: ProjectMaterialScopeKind
): ExtensionMaterialTargetGroup[] {
  const groups = new Map<string, ExtensionMaterialTargetGroup>();
  for (const target of targets) {
    if (target.scope !== scope) continue;
    const existing = groups.get(target.groupId);
    if (existing) {
      existing.targets.push(target);
      if (target.assigned) existing.assignedCount += 1;
    } else {
      groups.set(target.groupId, {
        id: target.groupId,
        label: target.group,
        targets: [target],
        assignedCount: target.assigned ? 1 : 0
      });
    }
  }
  return [...groups.values()];
}
