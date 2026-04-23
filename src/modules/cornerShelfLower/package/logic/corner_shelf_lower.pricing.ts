export const moduleType = "corner_shelf_lower";
export const displayName = "Corner";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "corner_shelf_lower",
  "displayName": "Corner",
  "currency": "EUR",
  "components": [
    {
      "key": "boards",
      "label": "Boards",
      "amount": 152.92,
      "formula": "sum(filtered commercial board items)"
    },
    {
      "key": "edge-bands",
      "label": "Edge Bands",
      "amount": 12.62,
      "formula": "sum(filtered commercial edge_band items)"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 52.83,
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
    "subtotal": 266.37,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 266.37
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}