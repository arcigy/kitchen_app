export const moduleType = "swing_shelves_low";
export const displayName = "Shelf Doors";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "swing_shelves_low",
  "displayName": "Shelf Doors",
  "currency": "EUR",
  "components": [
    {
      "key": "boards",
      "label": "Boards",
      "amount": 109.06,
      "formula": "sum(filtered commercial board items)"
    },
    {
      "key": "edge-bands",
      "label": "Edge Bands",
      "amount": 8.43,
      "formula": "sum(filtered commercial edge_band items)"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 39.44,
      "formula": "sum(filtered commercial hardware items)"
    },
    {
      "key": "assembly",
      "label": "Fixed Labor",
      "amount": 48,
      "formula": "fixed module labor input"
    },
    {
      "key": "margin",
      "label": "Margin",
      "amount": 0,
      "formula": "subtotalCost * 0"
    }
  ],
  "totals": {
    "subtotal": 204.93,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 204.93
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}