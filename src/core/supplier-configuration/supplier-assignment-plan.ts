export type ClientSupplierAssignment = {
  supplierId: string;
  enabled: boolean;
};

export type SupplierEnablePlan = {
  requestedSupplierIds: string[];
  enableSupplierIds: string[];
  alreadyEnabledSupplierIds: string[];
};

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function planEnabledClientSuppliers(args: {
  activeSupplierIds: readonly string[];
  currentAssignments: readonly ClientSupplierAssignment[];
  requestedSupplierIds: readonly string[];
}): SupplierEnablePlan {
  const active = new Set(uniqueIds(args.activeSupplierIds));
  const requestedSupplierIds = uniqueIds(args.requestedSupplierIds);
  if (requestedSupplierIds.length === 0) throw new Error("At least one supplier must be requested.");
  const unavailable = requestedSupplierIds.filter((supplierId) => !active.has(supplierId));
  if (unavailable.length > 0) throw new Error(`Requested suppliers are not active: ${unavailable.join(", ")}.`);
  const enabled = new Set(args.currentAssignments.filter((assignment) => assignment.enabled).map((assignment) => assignment.supplierId));
  return {
    requestedSupplierIds,
    enableSupplierIds: requestedSupplierIds.filter((supplierId) => !enabled.has(supplierId)),
    alreadyEnabledSupplierIds: requestedSupplierIds.filter((supplierId) => enabled.has(supplierId))
  };
}
