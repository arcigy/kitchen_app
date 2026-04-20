export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer Low",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 303,
  "priceSource": "calculated",
  "bomItems": 15
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}