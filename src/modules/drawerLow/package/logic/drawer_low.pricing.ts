export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer",
  "currency": "EUR",
  "components": [
    {
      "key": "board-material",
      "label": "Board Material",
      "amount": 738,
      "formula": "41 * 18"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 104,
      "formula": "16 * 6.5"
    },
    {
      "key": "assembly",
      "label": "Assembly",
      "amount": 256.5,
      "formula": "57 * 4.5"
    }
  ],
  "totals": {
    "subtotal": 1098.5,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 1098.5
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}