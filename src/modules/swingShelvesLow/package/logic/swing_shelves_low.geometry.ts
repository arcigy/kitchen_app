export const moduleType = "swing_shelves_low";
export const displayName = "Shelf Doors";
export const geometrySnapshot = {
  "schemaVersion": "module-geometry.v1",
  "moduleType": "swing_shelves_low",
  "displayName": "Shelf Doors",
  "dimensions": {
    "widthMm": 800,
    "heightMm": 700,
    "depthMm": 560,
    "worktopThicknessMm": 38,
    "plinthHeightMm": 100
  },
  "parameterEffects": [
    {
      "parameter": "width",
      "effect": "Shelf width changes carcass span, top and bottom panel width, shelf width and both door front widths."
    },
    {
      "parameter": "height",
      "effect": "Height changes the total module height including worktop and shifts the derived carcass height."
    },
    {
      "parameter": "heightCarcass",
      "effect": "Height carcass changes side panel height, door height and the internal shelf stack envelope."
    },
    {
      "parameter": "depth",
      "effect": "Depth changes side panel depth, shelf depth, top and bottom footprint and back panel footprint."
    },
    {
      "parameter": "boardThickness",
      "effect": "Board thickness changes carcass stock thickness and all dependent internal clear dimensions."
    },
    {
      "parameter": "shelfThickness",
      "effect": "Shelf thickness changes the stock used for each internal shelf board."
    },
    {
      "parameter": "backThickness",
      "effect": "Back thickness changes the rear panel stock and the usable internal shelf depth."
    },
    {
      "parameter": "shelfCount",
      "effect": "Shelf count changes the number of internal shelf boards and the vertical shelf layout."
    },
    {
      "parameter": "shelfAutoFit",
      "effect": "Shelf auto-fit switches between equalized shelf spacing and manually defined shelf gaps."
    },
    {
      "parameter": "shelfGaps",
      "effect": "Shelf gaps manually redistribute the internal shelf spacing when auto-fit is disabled."
    },
    {
      "parameter": "frontThicknessMm",
      "effect": "Front thickness changes both swing door boards and the selected front material thickness."
    },
    {
      "parameter": "hingeCountPerDoor",
      "effect": "Hinge count per door changes the quantity of hinge assemblies exported for both swing doors."
    },
    {
      "parameter": "worktopThicknessMm",
      "effect": "Worktop thickness reduces effective carcass height while keeping total module height fixed."
    },
    {
      "parameter": "plinthHeight",
      "effect": "Plinth height changes support geometry and reduces the visible door height and internal shelf envelope."
    }
  ],
  "parts": [
    {
      "id": "left-side",
      "label": "Left Side Panel",
      "kind": "support",
      "materialRole": "body",
      "sizeMm": {
        "width": 562,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "depth",
        "plinthHeight",
        "boardThickness",
        "worktopThicknessMm"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-391, 381, 0"
      },
      "notes": [
        "material DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "right-side",
      "label": "Right Side Panel",
      "kind": "support",
      "materialRole": "body",
      "sizeMm": {
        "width": 562,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "depth",
        "plinthHeight",
        "boardThickness",
        "worktopThicknessMm"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "391, 381, 0"
      },
      "notes": [
        "material DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "bottom-panel",
      "label": "Bottom Panel",
      "kind": "support",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "depth",
        "boardThickness",
        "plinthHeight"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 109, 0"
      },
      "notes": [
        "material DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "top-panel",
      "label": "Top Panel",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 560,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "depth",
        "boardThickness",
        "worktopThicknessMm"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 653, 0"
      },
      "notes": [
        "material DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "back-panel",
      "label": "Back Panel",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 779,
        "height": 541,
        "depth": 6,
        "thickness": 6
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "depth",
        "boardThickness",
        "backThickness",
        "backGrooveDepthMm",
        "backGrooveWidthMm",
        "backGrooveClearanceMm",
        "plinthHeight"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 388.5, -259"
      },
      "notes": [
        "material HDF Grey 6 mm color #c8ccd1"
      ]
    },
    {
      "id": "plinth",
      "label": "plinth",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 100,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "boardThickness"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 50, 211"
      },
      "notes": [
        "material unnamed color #f3f3ef"
      ]
    },
    {
      "id": "shelf-1-x",
      "label": "shelf-1-x",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 525,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "shelfCount",
        "shelfThickness",
        "shelfAutoFit",
        "shelfGaps",
        "heightCarcass",
        "depth"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 245, 8.5"
      },
      "notes": [
        "material Shelf DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "shelf-2-x",
      "label": "shelf-2-x",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 525,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "shelfCount",
        "shelfThickness",
        "shelfAutoFit",
        "shelfGaps",
        "heightCarcass",
        "depth"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 381, 8.5"
      },
      "notes": [
        "material Shelf DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "shelf-3-x",
      "label": "shelf-3-x",
      "kind": "panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 764,
        "height": 525,
        "depth": 18,
        "thickness": 18
      },
      "quantity": 1,
      "paramKeys": [
        "shelfCount",
        "shelfThickness",
        "shelfAutoFit",
        "shelfGaps",
        "heightCarcass",
        "depth"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 517, 8.5"
      },
      "notes": [
        "material Shelf DTD White 18 mm color #f3f3ef"
      ]
    },
    {
      "id": "door-front-z",
      "label": "door_front_z",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 558,
        "height": 397,
        "depth": 19,
        "thickness": 19
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "frontThicknessMm",
        "sideGap",
        "topGap",
        "bottomGap",
        "frontGap",
        "doorDouble",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "198.5, 0, 0"
      },
      "notes": [
        "material MDF White Supermat 19 mm color #f3f3ef"
      ]
    },
    {
      "id": "door_front_z_handle",
      "label": "door_front_z_handle",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 160,
        "height": 14,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "handleComponentId",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "277, 219, 17.5"
      },
      "notes": [
        "material Bar Handle 160 mm Black color #1e232b"
      ]
    },
    {
      "id": "door_front_z_hinge_1",
      "label": "door_front_z_hinge_1",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 62,
        "height": 34,
        "depth": 3,
        "thickness": 3
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, 169, -12.25"
      },
      "notes": [
        "material Clip-On Hinge Softclose color #aeb3bb"
      ]
    },
    {
      "id": "door_front_z_hinge_1_cup",
      "label": "door_front_z_hinge_1_cup",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 35,
        "height": 34,
        "depth": 10,
        "thickness": 10
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, 169, -3.775"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_z_hinge_1_arm",
      "label": "door_front_z_hinge_1_arm",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 30,
        "height": 18,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, 169, -28.5"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_z_hinge_2",
      "label": "door_front_z_hinge_2",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 62,
        "height": 34,
        "depth": 3,
        "thickness": 3
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, -169, -12.25"
      },
      "notes": [
        "material Clip-On Hinge Softclose color #aeb3bb"
      ]
    },
    {
      "id": "door_front_z_hinge_2_cup",
      "label": "door_front_z_hinge_2_cup",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 35,
        "height": 34,
        "depth": 10,
        "thickness": 10
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, -169, -3.775"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_z_hinge_2_arm",
      "label": "door_front_z_hinge_2_arm",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 30,
        "height": 18,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "37, -169, -28.5"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door-front-x",
      "label": "door_front_x",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 558,
        "height": 397,
        "depth": 19,
        "thickness": 19
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "heightCarcass",
        "frontThicknessMm",
        "sideGap",
        "topGap",
        "bottomGap",
        "frontGap",
        "doorDouble",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-198.5, 0, 0"
      },
      "notes": [
        "material MDF White Supermat 19 mm color #f3f3ef"
      ]
    },
    {
      "id": "door_front_x_handle",
      "label": "door_front_x_handle",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 160,
        "height": 14,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "handleComponentId",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-277, 219, 17.5"
      },
      "notes": [
        "material Bar Handle 160 mm Black color #1e232b"
      ]
    },
    {
      "id": "door_front_x_hinge_1",
      "label": "door_front_x_hinge_1",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 62,
        "height": 34,
        "depth": 3,
        "thickness": 3
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, 169, -12.25"
      },
      "notes": [
        "material Clip-On Hinge Softclose color #aeb3bb"
      ]
    },
    {
      "id": "door_front_x_hinge_1_cup",
      "label": "door_front_x_hinge_1_cup",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 35,
        "height": 34,
        "depth": 10,
        "thickness": 10
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, 169, -3.775"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_x_hinge_1_arm",
      "label": "door_front_x_hinge_1_arm",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 30,
        "height": 18,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, 169, -28.5"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_x_hinge_2",
      "label": "door_front_x_hinge_2",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 62,
        "height": 34,
        "depth": 3,
        "thickness": 3
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, -169, -12.25"
      },
      "notes": [
        "material Clip-On Hinge Softclose color #aeb3bb"
      ]
    },
    {
      "id": "door_front_x_hinge_2_cup",
      "label": "door_front_x_hinge_2_cup",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 35,
        "height": 34,
        "depth": 10,
        "thickness": 10
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, -169, -3.775"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "door_front_x_hinge_2_arm",
      "label": "door_front_x_hinge_2_arm",
      "kind": "front",
      "materialRole": "front",
      "sizeMm": {
        "width": 30,
        "height": 18,
        "depth": 12,
        "thickness": 12
      },
      "quantity": 1,
      "paramKeys": [
        "hingeComponentId",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "doorOpen"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-37, -169, -28.5"
      },
      "notes": [
        "material unnamed color #3a3f4b"
      ]
    },
    {
      "id": "leg_FL",
      "label": "leg_FL",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 100,
        "height": 40,
        "depth": 39,
        "thickness": 39
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-350, 50, 186"
      },
      "notes": [
        "material Adjustable Leg 100 mm Black color #1e232b"
      ]
    },
    {
      "id": "leg_FL_clip",
      "label": "leg_FL_clip",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 49,
        "height": 48,
        "depth": 16,
        "thickness": 16
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "boardThickness",
        "clipComponentId",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-350, 40, 186"
      },
      "notes": [
        "material Plinth Clip Standard color #1e232b"
      ]
    },
    {
      "id": "leg_FR",
      "label": "leg_FR",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 100,
        "height": 40,
        "depth": 39,
        "thickness": 39
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "350, 50, 186"
      },
      "notes": [
        "material Adjustable Leg 100 mm Black color #1e232b"
      ]
    },
    {
      "id": "leg_FR_clip",
      "label": "leg_FR_clip",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 49,
        "height": 48,
        "depth": 16,
        "thickness": 16
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "boardThickness",
        "clipComponentId",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "350, 40, 186"
      },
      "notes": [
        "material Plinth Clip Standard color #1e232b"
      ]
    },
    {
      "id": "leg_BL",
      "label": "leg_BL",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 100,
        "height": 40,
        "depth": 39,
        "thickness": 39
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "-350, 50, -220"
      },
      "notes": [
        "material Adjustable Leg 100 mm Black color #1e232b"
      ]
    },
    {
      "id": "leg_BR",
      "label": "leg_BR",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 100,
        "height": 40,
        "depth": 39,
        "thickness": 39
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "350, 50, -220"
      },
      "notes": [
        "material Adjustable Leg 100 mm Black color #1e232b"
      ]
    },
    {
      "id": "leg_BC",
      "label": "leg_BC",
      "kind": "back-panel",
      "materialRole": "body",
      "sizeMm": {
        "width": 100,
        "height": 40,
        "depth": 39,
        "thickness": 39
      },
      "quantity": 1,
      "paramKeys": [
        "width",
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "legComponentId"
      ],
      "formulas": {
        "source": "live_runtime_mesh_bounds",
        "positionMm": "0, 50, -220"
      },
      "notes": [
        "material Adjustable Leg 100 mm Black color #1e232b"
      ]
    }
  ]
} as const;

export function computeGeometry() {
  return geometrySnapshot;
}

export function explainParameterEffects() {
  return geometrySnapshot.parameterEffects;
}