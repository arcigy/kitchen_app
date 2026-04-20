export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const bomSnapshot = {
  "schemaVersion": "module-bom.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer Low",
  "items": [
    {
      "id": "left-side",
      "category": "board",
      "description": "Left Side Panel",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 560,
        "height": 582,
        "depth": 18,
        "thickness": 18
      },
      "materialRole": "body",
      "sourcePartIds": [
        "left-side"
      ]
    },
    {
      "id": "right-side",
      "category": "board",
      "description": "Right Side Panel",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 560,
        "height": 582,
        "depth": 18,
        "thickness": 18
      },
      "materialRole": "body",
      "sourcePartIds": [
        "right-side"
      ]
    },
    {
      "id": "bottom-panel",
      "category": "board",
      "description": "Bottom Panel",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 564,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "materialRole": "body",
      "sourcePartIds": [
        "bottom-panel"
      ]
    },
    {
      "id": "top-panel",
      "category": "board",
      "description": "Top Panel",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 564,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "materialRole": "body",
      "sourcePartIds": [
        "top-panel"
      ]
    },
    {
      "id": "back-panel",
      "category": "board",
      "description": "Back Panel",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 564,
        "height": 564,
        "depth": 8,
        "thickness": 8
      },
      "materialRole": "body",
      "sourcePartIds": [
        "back-panel"
      ]
    },
    {
      "id": "plinth",
      "category": "board",
      "description": "Plinth",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 564,
        "height": 100,
        "depth": 18,
        "thickness": 18
      },
      "materialRole": "body",
      "sourcePartIds": [
        "plinth"
      ]
    },
    {
      "id": "drawer-front-1",
      "category": "front",
      "description": "Drawer Front 1",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 596,
        "height": 140,
        "depth": 19,
        "thickness": 19
      },
      "materialRole": "front",
      "sourcePartIds": [
        "drawer-front-1"
      ]
    },
    {
      "id": "drawer-box-1",
      "category": "drawer",
      "description": "Drawer Box 1",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "materialRole": "drawer",
      "sourcePartIds": [
        "drawer-box-1"
      ],
      "notes": [
        "Driven by drawerCount slot 1."
      ]
    },
    {
      "id": "drawer-front-2",
      "category": "front",
      "description": "Drawer Front 2",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 596,
        "height": 180,
        "depth": 19,
        "thickness": 19
      },
      "materialRole": "front",
      "sourcePartIds": [
        "drawer-front-2"
      ]
    },
    {
      "id": "drawer-box-2",
      "category": "drawer",
      "description": "Drawer Box 2",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "materialRole": "drawer",
      "sourcePartIds": [
        "drawer-box-2"
      ],
      "notes": [
        "Driven by drawerCount slot 2."
      ]
    },
    {
      "id": "drawer-front-3",
      "category": "front",
      "description": "Drawer Front 3",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 596,
        "height": 300,
        "depth": 19,
        "thickness": 19
      },
      "materialRole": "front",
      "sourcePartIds": [
        "drawer-front-3"
      ]
    },
    {
      "id": "drawer-box-3",
      "category": "drawer",
      "description": "Drawer Box 3",
      "unit": "pcs",
      "quantity": 1,
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "materialRole": "drawer",
      "sourcePartIds": [
        "drawer-box-3"
      ],
      "notes": [
        "Driven by drawerCount slot 3."
      ]
    },
    {
      "id": "handles",
      "category": "hardware",
      "description": "Handle Set",
      "unit": "pcs",
      "quantity": 3,
      "sizeMm": {
        "width": 160,
        "height": 14,
        "depth": 12,
        "thickness": 12
      },
      "materialRole": "hardware",
      "sourcePartIds": [
        "handles"
      ]
    }
  ],
  "summary": {
    "totalItems": 15,
    "boardItems": 12,
    "hardwareItems": 1
  }
} as const;

export function generateBom() {
  return bomSnapshot;
}

export function summarizeBom() {
  return bomSnapshot.summary;
}