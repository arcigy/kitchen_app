import type { SupplierSyncItem, SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type { SupplierBridgeTrace } from "./storage";

export type SupplierTargetScope = "general" | "module" | "addition";

export type SupplierTarget = {
  item: SupplierSyncItem;
  label: string;
  group: string;
  assigned: boolean;
};

export function supplierViewForProject(view: SupplierSyncSessionView | null, projectId: string | null | undefined): SupplierSyncSessionView | null {
  return !view || !projectId || view.session.projectId === projectId ? view : null;
}

const targetLabels: Record<string, string> = {
  corpus: "Korpus", front: "Fronty", worktop: "Pracovná doska", plinth: "Sokel", back: "Chrbát",
  drawer_bottom: "Dná zásuviek", edge_front: "Hrany frontov", edge_other: "Hrany korpusu",
  handle: "Úchytky", hinge: "Pánty", runner: "Zásuvkové výsuvy", lift_up: "Výklopy",
  leg: "Nožičky", fastener: "Spojovací materiál", lighting: "Osvetlenie", other_component: "Ostatné komponenty"
};

function targetFor(item: SupplierSyncItem): SupplierTarget | null {
  const prefix = "material-assignment:";
  if (!item.materialAssignmentId.startsWith(prefix)) return null;
  const category = item.materialAssignmentId.slice(prefix.length).split(":").find((part) => part in targetLabels);
  const label = item.targetLabel ?? (category ? targetLabels[category] : null);
  if (!label) return null;
  return { item, label, group: item.targetLabel?.split(" · ")[0] ?? label, assigned: item.status === "confirmed" };
}

export function supplierTargetsForScope(view: SupplierSyncSessionView | null, scope: SupplierTargetScope): SupplierTarget[] {
  return (view?.items.flatMap((item) => targetFor(item) ?? []) ?? []).filter((target) => (target.item.targetScope ?? "general") === scope);
}

export function supplierTargetGroups(targets: readonly SupplierTarget[]): Array<[string, SupplierTarget[]]> {
  return [...targets.reduce((groups, target) => {
    groups.set(target.group, [...(groups.get(target.group) ?? []), target]);
    return groups;
  }, new Map<string, SupplierTarget[]>())];
}

export function supplierTargetProductText(view: SupplierSyncSessionView, item: SupplierSyncItem): string {
  const candidate = item.selectedCandidateId ? view.candidates.find((entry) => entry.id === item.selectedCandidateId) : null;
  if (!candidate) return item.status === "confirmed" ? "Priradené" : "Nepriradené";
  const product = candidate.normalizedProduct;
  const dimensions = product.widthMm != null || product.thicknessMm != null ? ` · ${product.widthMm ?? "—"} × ${product.thicknessMm ?? "—"} mm` : "";
  const price = view.priceObservations.find((entry) => entry.candidateId === candidate.id);
  return `${product.displayName} · ${candidate.supplierProductCode}${dimensions}${price?.normalizedAmount != null ? ` · ${price.normalizedAmount} ${price.currency}` : ""}`;
}

export function createSupplierBridgeDebugReport(input: {
  version: string;
  view: SupplierSyncSessionView;
  trace: readonly SupplierBridgeTrace[];
  lastWarning: string | null;
  visibleError: string | null;
}): string {
  const lines = [
    "Arcigy Supplier Bridge diagnostics",
    `extension_version=${input.version}`,
    `supplier=${input.view.session.supplierId}`,
    `session_status=${input.view.session.status}`,
    `completed=${input.view.counts.completed}`,
    `pending=${input.view.counts.pending}`,
    `last_warning=${input.lastWarning ?? "none"}`,
    `visible_error=${input.visibleError ?? "none"}`,
    "trace:"
  ];
  for (const entry of input.trace.slice(-16)) {
    lines.push(`${entry.at} | ${entry.outcome} | ${entry.stage} | ${entry.code ?? "-"}`);
  }
  return lines.join("\n");
}
