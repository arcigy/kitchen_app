export const moduleType = "flap_shelves_low";
export const displayName = "Flap";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "flap_shelves_low",
  "displayName": "Flap",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 325.74,
  "priceSource": "calculated",
  "bomItems": 18
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}