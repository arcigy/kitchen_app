export const moduleType = "flap_shelves_low";
export const displayName = "Flap";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "flap_shelves_low",
  "displayName": "Flap",
  "currency": "EUR",
  "components": [
    {
      "key": "boards",
      "label": "Boards",
      "amount": 124.68,
      "formula": "sum(filtered commercial board items)"
    },
    {
      "key": "edge-bands",
      "label": "Edge Bands",
      "amount": 3.86,
      "formula": "sum(filtered commercial edge_band items)"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 149.2,
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
    "subtotal": 325.74,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 325.74
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}