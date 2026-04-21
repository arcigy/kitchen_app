export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer",
  "currency": "EUR",
  "components": [
    {
      "key": "boards",
      "label": "Boards",
      "amount": 116.13,
      "formula": "sum(filtered commercial board items)"
    },
    {
      "key": "edge-bands",
      "label": "Edge Bands",
      "amount": 1.46,
      "formula": "sum(filtered commercial edge_band items)"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 66.95,
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
    "subtotal": 232.54,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 232.54
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}