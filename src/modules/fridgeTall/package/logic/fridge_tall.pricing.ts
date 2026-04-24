export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "currency": "EUR",
  "components": [
    {
      "key": "boards",
      "label": "Boards",
      "amount": 158.54,
      "formula": "sum(filtered commercial board items)"
    },
    {
      "key": "edge-bands",
      "label": "Edge Bands",
      "amount": 8.77,
      "formula": "sum(filtered commercial edge_band items)"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 17.28,
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
    "subtotal": 232.59,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 232.59
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}