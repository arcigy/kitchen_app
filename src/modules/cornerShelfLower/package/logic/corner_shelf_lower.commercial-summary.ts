export const moduleType = "corner_shelf_lower";
export const displayName = "Corner";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "corner_shelf_lower",
  "displayName": "Corner",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 266.37,
  "priceSource": "calculated",
  "bomItems": 38
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}