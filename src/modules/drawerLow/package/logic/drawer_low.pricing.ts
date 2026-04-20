export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const pricingSnapshot = {
  "schemaVersion": "module-pricing.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer Low",
  "currency": "EUR",
  "components": [
    {
      "key": "board-material",
      "label": "Board Material",
      "amount": 216,
      "formula": "12 * 18"
    },
    {
      "key": "hardware",
      "label": "Hardware",
      "amount": 19.5,
      "formula": "3 * 6.5"
    },
    {
      "key": "assembly",
      "label": "Assembly",
      "amount": 67.5,
      "formula": "15 * 4.5"
    }
  ],
  "totals": {
    "subtotal": 303,
    "overrideApplied": false,
    "overrideAmount": null,
    "finalTotal": 303
  }
} as const;

export function calculatePricing() {
  return pricingSnapshot;
}