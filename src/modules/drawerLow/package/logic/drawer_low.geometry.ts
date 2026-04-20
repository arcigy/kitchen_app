export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const geometrySnapshot = {
  "schemaVersion": "module-geometry.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer Low",
  "dimensions": {
    "widthMm": 600,
    "heightMm": 720,
    "depthMm": 560,
    "worktopThicknessMm": 38,
    "plinthHeightMm": 100
  },
  "parameterEffects": [
    {
      "parameter": "width",
      "effect": "drawer_low width changes carcass span, top/bottom panel width and drawer/front clear width."
    },
    {
      "parameter": "height",
      "effect": "drawer_low height changes side panels, front stack allocation and internal vertical clearances."
    },
    {
      "parameter": "depth",
      "effect": "drawer_low depth changes side panel depth, drawer box depth and back panel footprint."
    },
    {
      "parameter": "boardThickness",
      "effect": "Board thickness changes panel stock thickness and all dependent internal clear dimensions."
    },
    {
      "parameter": "drawerCount",
      "effect": "Drawer count changes number of drawer fronts, runner sets and drawer box assemblies."
    },
    {
      "parameter": "drawerFrontHeights",
      "effect": "Drawer front heights redistribute the visible front stack and drawer aperture geometry."
    },
    {
      "parameter": "frontGap",
      "effect": "Front gap changes revealed spacing between stacked fronts and side/top/bottom front edges."
    },
    {
      "parameter": "worktopThicknessMm",
      "effect": "Worktop thickness reduces effective carcass height when the module uses a worktop."
    },
    {
      "parameter": "plinthHeight",
      "effect": "Plinth height changes support geometry and usable carcass height for floor-mounted modules."
    }
  ],
  "parts": [
    {
      "id": "left-side",
      "label": "Left Side Panel",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 560,
        "height": 582,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "depth",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness"
      ],
      "formulas": {
        "width": "depth",
        "height": "height - plinthHeight - worktopThicknessMm",
        "thickness": "boardThickness"
      }
    },
    {
      "id": "right-side",
      "label": "Right Side Panel",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 560,
        "height": 582,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "depth",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness"
      ],
      "formulas": {
        "width": "depth",
        "height": "height - plinthHeight - worktopThicknessMm",
        "thickness": "boardThickness"
      }
    },
    {
      "id": "bottom-panel",
      "label": "Bottom Panel",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 564,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "boardThickness"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness",
        "height": "depth",
        "thickness": "boardThickness"
      }
    },
    {
      "id": "top-panel",
      "label": "Top Panel",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 564,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "boardThickness"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness",
        "height": "depth",
        "thickness": "boardThickness"
      }
    },
    {
      "id": "back-panel",
      "label": "Back Panel",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 564,
        "height": 564,
        "depth": 8,
        "thickness": 8
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness",
        "backThickness"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness",
        "height": "height - plinthHeight - worktopThicknessMm - boardThickness",
        "thickness": "backThickness"
      }
    },
    {
      "id": "plinth",
      "label": "Plinth",
      "kind": "support",
      "materialRole": "body",
      "sizeMm": {
        "width": 564,
        "height": 100,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "boardThickness"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness",
        "height": "plinthHeight",
        "thickness": "boardThickness"
      }
    },
    {
      "id": "drawer-front-1",
      "label": "Drawer Front 1",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 596,
        "height": 140,
        "depth": 19,
        "thickness": 19
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "drawerFrontHeights",
        "sideGap",
        "frontThicknessMm"
      ],
      "formulas": {
        "width": "width - 2 * sideGap",
        "height": "drawerFrontHeights[0]",
        "thickness": "frontThicknessMm"
      }
    },
    {
      "id": "drawer-box-1",
      "label": "Drawer Box 1",
      "kind": "drawer-box",
      "materialRole": "drawer",
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "drawerBoxSideHeight",
        "drawerBoxThickness",
        "drawerBackReserveMm"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness - 26",
        "height": "drawerBoxSideHeight",
        "depth": "depth - drawerBackReserveMm - 50",
        "thickness": "drawerBoxThickness"
      },
      "notes": [
        "Driven by drawerCount slot 1."
      ]
    },
    {
      "id": "drawer-front-2",
      "label": "Drawer Front 2",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 596,
        "height": 180,
        "depth": 19,
        "thickness": 19
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "drawerFrontHeights",
        "sideGap",
        "frontThicknessMm"
      ],
      "formulas": {
        "width": "width - 2 * sideGap",
        "height": "drawerFrontHeights[1]",
        "thickness": "frontThicknessMm"
      }
    },
    {
      "id": "drawer-box-2",
      "label": "Drawer Box 2",
      "kind": "drawer-box",
      "materialRole": "drawer",
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "drawerBoxSideHeight",
        "drawerBoxThickness",
        "drawerBackReserveMm"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness - 26",
        "height": "drawerBoxSideHeight",
        "depth": "depth - drawerBackReserveMm - 50",
        "thickness": "drawerBoxThickness"
      },
      "notes": [
        "Driven by drawerCount slot 2."
      ]
    },
    {
      "id": "drawer-front-3",
      "label": "Drawer Front 3",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 596,
        "height": 300,
        "depth": 19,
        "thickness": 19
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "drawerFrontHeights",
        "sideGap",
        "frontThicknessMm"
      ],
      "formulas": {
        "width": "width - 2 * sideGap",
        "height": "drawerFrontHeights[2]",
        "thickness": "frontThicknessMm"
      }
    },
    {
      "id": "drawer-box-3",
      "label": "Drawer Box 3",
      "kind": "drawer-box",
      "materialRole": "drawer",
      "sizeMm": {
        "width": 538,
        "height": 110,
        "depth": 502,
        "thickness": 13
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "drawerBoxSideHeight",
        "drawerBoxThickness",
        "drawerBackReserveMm"
      ],
      "formulas": {
        "width": "width - 2 * boardThickness - 26",
        "height": "drawerBoxSideHeight",
        "depth": "depth - drawerBackReserveMm - 50",
        "thickness": "drawerBoxThickness"
      },
      "notes": [
        "Driven by drawerCount slot 3."
      ]
    },
    {
      "id": "handles",
      "label": "Handle Set",
      "kind": "hardware",
      "materialRole": "hardware",
      "sizeMm": {
        "width": 160,
        "height": 14,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 3,
      "paramKeys": [
        "handleType",
        "handleLengthMm",
        "handleProjectionMm",
        "handleSizeMm",
        "drawerCount"
      ],
      "formulas": {
        "width": "handleLengthMm",
        "height": "handleProjectionMm",
        "depth": "handleSizeMm",
        "quantity": "drawerCount"
      }
    }
  ]
} as const;

export function computeGeometry() {
  return geometrySnapshot;
}

export function explainParameterEffects() {
  return geometrySnapshot.parameterEffects;
}