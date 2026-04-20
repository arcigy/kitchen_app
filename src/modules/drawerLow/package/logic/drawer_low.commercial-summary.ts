export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 1098.5,
  "priceSource": "calculated",
  "bomItems": 57
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}