export const moduleType = "swing_shelves_low";
export const displayName = "Shelf Doors";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "swing_shelves_low",
  "displayName": "Shelf Doors",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 204.93,
  "priceSource": "calculated",
  "bomItems": 33
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}