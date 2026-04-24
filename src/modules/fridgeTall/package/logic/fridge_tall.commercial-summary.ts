export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const commercialSummarySnapshot = {
  "schemaVersion": "module-commercial-summary.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "quantity": 1,
  "pricingEnabled": true,
  "finalPriceEur": 232.59,
  "priceSource": "incomplete",
  "bomItems": 28
} as const;

export function buildCommercialSummary() {
  return commercialSummarySnapshot;
}