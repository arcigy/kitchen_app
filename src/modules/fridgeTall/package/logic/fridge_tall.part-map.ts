export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const manufacturablePartMap = {
  "schemaVersion": "module-manufacturable-parts.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "generatedFrom": "canonical_geometry_contract",
  "parts": [
    {
      "partId": "carcass-side-left",
      "sourceGeometryPartIds": [
        "left-side"
      ],
      "label": "Carcass Side Left",
      "partType": "side-panel",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "boardThickness",
      "dimensionsMm": {
        "length": 1816,
        "width": 600,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "yz",
        "lengthAxis": "y",
        "widthAxis": "z",
        "thicknessAxis": "x",
        "grainAxis": "length"
      },
      "faceRole": {
        "primaryFaceRole": "carcass_exterior_left",
        "secondaryFaceRole": "appliance_niche_interior_left",
        "visibleFaceRole": "front_edge_at_opening"
      },
      "sourceParamKeys": [
        "depth",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "front",
          "eligibility": "candidate",
          "reason": "Front vertical edge is visible at the carcass opening."
        },
        {
          "edgeId": "back",
          "eligibility": "concealed",
          "reason": "Rear edge is resolved against the back panel zone."
        },
        {
          "edgeId": "top",
          "eligibility": "concealed",
          "reason": "Top edge is captured by the top panel assembly."
        },
        {
          "edgeId": "bottom",
          "eligibility": "concealed",
          "reason": "Bottom edge resolves into the base/plinth zone."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "carcass-side-left.hinge-mount",
          "anchorType": "hinge",
          "anchorRole": "mount_zone",
          "mountFace": "appliance_niche_interior_left",
          "relatedAnchorIds": [
            "door-front-upper.hinge-cup-mount",
            "door-front-lower.hinge-cup-mount"
          ],
          "sourceParamKeys": [
            "freezerDoorHeightMm",
            "fridgeDoorGapMm"
          ],
          "notes": [
            "Mounting-side preparation zone used by the integrated fridge hinges; side handing remains a mounting-context detail, not a count rule."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "niche-boundary",
        "zone": "left",
        "relatedParamKeys": [
          "fridgeWidthMm",
          "fridgeSideClearanceMm"
        ]
      }
    },
    {
      "partId": "carcass-side-right",
      "sourceGeometryPartIds": [
        "right-side"
      ],
      "label": "Carcass Side Right",
      "partType": "side-panel",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "boardThickness",
      "dimensionsMm": {
        "length": 1816,
        "width": 600,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "yz",
        "lengthAxis": "y",
        "widthAxis": "z",
        "thicknessAxis": "x",
        "grainAxis": "length"
      },
      "faceRole": {
        "primaryFaceRole": "carcass_exterior_right",
        "secondaryFaceRole": "appliance_niche_interior_right",
        "visibleFaceRole": "front_edge_at_opening"
      },
      "sourceParamKeys": [
        "depth",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "front",
          "eligibility": "candidate",
          "reason": "Front vertical edge is visible at the carcass opening."
        },
        {
          "edgeId": "back",
          "eligibility": "concealed",
          "reason": "Rear edge is resolved against the back panel zone."
        },
        {
          "edgeId": "top",
          "eligibility": "concealed",
          "reason": "Top edge is captured by the top panel assembly."
        },
        {
          "edgeId": "bottom",
          "eligibility": "concealed",
          "reason": "Bottom edge resolves into the base/plinth zone."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "carcass-side-right.hinge-mount",
          "anchorType": "hinge",
          "anchorRole": "mount_zone",
          "mountFace": "appliance_niche_interior_right",
          "relatedAnchorIds": [
            "door-front-upper.hinge-cup-mount",
            "door-front-lower.hinge-cup-mount"
          ],
          "sourceParamKeys": [
            "freezerDoorHeightMm",
            "fridgeDoorGapMm"
          ],
          "notes": [
            "Alternate mounting-side preparation zone used by the integrated fridge hinges; side handing remains a mounting-context detail, not a count rule."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "niche-boundary",
        "zone": "right",
        "relatedParamKeys": [
          "fridgeWidthMm",
          "fridgeSideClearanceMm"
        ]
      }
    },
    {
      "partId": "carcass-top",
      "sourceGeometryPartIds": [
        "top-panel"
      ],
      "label": "Carcass Top",
      "partType": "top-panel",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "boardThickness",
      "dimensionsMm": {
        "length": 600,
        "width": 564,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "xz",
        "lengthAxis": "z",
        "widthAxis": "x",
        "thicknessAxis": "y",
        "grainAxis": "width"
      },
      "faceRole": {
        "primaryFaceRole": "carcass_top_outer",
        "secondaryFaceRole": "appliance_niche_upper_boundary",
        "visibleFaceRole": "front_edge_at_opening"
      },
      "sourceParamKeys": [
        "width",
        "depth",
        "boardThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "front",
          "eligibility": "candidate",
          "reason": "Front horizontal edge is visible at the opening line."
        },
        {
          "edgeId": "left",
          "eligibility": "concealed",
          "reason": "Side edge is captured between left side and top assembly."
        },
        {
          "edgeId": "right",
          "eligibility": "concealed",
          "reason": "Side edge is captured between right side and top assembly."
        },
        {
          "edgeId": "back",
          "eligibility": "concealed",
          "reason": "Rear edge resolves against the back panel zone."
        }
      ],
      "hardwareAnchors": [],
      "nicheRelation": {
        "relationType": "niche-boundary",
        "zone": "top",
        "relatedParamKeys": [
          "fridgeHeightMm",
          "fridgeTopClearanceMm"
        ]
      }
    },
    {
      "partId": "carcass-bottom",
      "sourceGeometryPartIds": [
        "bottom-panel"
      ],
      "label": "Carcass Bottom",
      "partType": "bottom-panel",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "boardThickness",
      "dimensionsMm": {
        "length": 600,
        "width": 564,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "xz",
        "lengthAxis": "z",
        "widthAxis": "x",
        "thicknessAxis": "y",
        "grainAxis": "width"
      },
      "faceRole": {
        "primaryFaceRole": "appliance_niche_lower_boundary",
        "secondaryFaceRole": "underside_service_face",
        "visibleFaceRole": "front_edge_at_opening"
      },
      "sourceParamKeys": [
        "width",
        "depth",
        "boardThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "front",
          "eligibility": "candidate",
          "reason": "Front horizontal edge remains exposed above the plinth line."
        },
        {
          "edgeId": "left",
          "eligibility": "concealed",
          "reason": "Side edge is captured between left side and bottom assembly."
        },
        {
          "edgeId": "right",
          "eligibility": "concealed",
          "reason": "Side edge is captured between right side and bottom assembly."
        },
        {
          "edgeId": "back",
          "eligibility": "concealed",
          "reason": "Rear edge resolves against the back panel zone."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "carcass-bottom.leg-front-left",
          "anchorType": "leg",
          "anchorRole": "counted_instance",
          "instanceGroup": "adjustable-legs",
          "instanceIndex": 1,
          "mountFace": "underside_service_face",
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "legComponentId"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit per-leg anchor generated from width-based fridge leg rule",
            "rationale": "Anchor exists because the current fridge runtime leg layout explicitly places a physical leg in this position."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "legComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Leg component is selected from canonical legComponentId."
            ]
          },
          "notes": [
            "Corner support leg at the front-left service position."
          ]
        },
        {
          "anchorId": "carcass-bottom.leg-front-right",
          "anchorType": "leg",
          "anchorRole": "counted_instance",
          "instanceGroup": "adjustable-legs",
          "instanceIndex": 2,
          "mountFace": "underside_service_face",
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "legComponentId"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit per-leg anchor generated from width-based fridge leg rule",
            "rationale": "Anchor exists because the current fridge runtime leg layout explicitly places a physical leg in this position."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "legComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Leg component is selected from canonical legComponentId."
            ]
          },
          "notes": [
            "Corner support leg at the front-right service position."
          ]
        },
        {
          "anchorId": "carcass-bottom.leg-rear-left",
          "anchorType": "leg",
          "anchorRole": "counted_instance",
          "instanceGroup": "adjustable-legs",
          "instanceIndex": 3,
          "mountFace": "underside_service_face",
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "legComponentId"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit per-leg anchor generated from width-based fridge leg rule",
            "rationale": "Anchor exists because the current fridge runtime leg layout explicitly places a physical leg in this position."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "legComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Leg component is selected from canonical legComponentId."
            ]
          },
          "notes": [
            "Corner support leg at the rear-left service position."
          ]
        },
        {
          "anchorId": "carcass-bottom.leg-rear-right",
          "anchorType": "leg",
          "anchorRole": "counted_instance",
          "instanceGroup": "adjustable-legs",
          "instanceIndex": 4,
          "mountFace": "underside_service_face",
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "legComponentId"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit per-leg anchor generated from width-based fridge leg rule",
            "rationale": "Anchor exists because the current fridge runtime leg layout explicitly places a physical leg in this position."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "legComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Leg component is selected from canonical legComponentId."
            ]
          },
          "notes": [
            "Corner support leg at the rear-right service position."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "niche-boundary",
        "zone": "bottom",
        "relatedParamKeys": [
          "fridgeHeightMm",
          "fridgeBottomClearanceMm",
          "plinthHeight"
        ]
      }
    },
    {
      "partId": "carcass-back",
      "sourceGeometryPartIds": [
        "back-panel"
      ],
      "label": "Carcass Back",
      "partType": "back-panel",
      "boardCandidate": true,
      "edgeBandCandidate": false,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "backThickness",
      "dimensionsMm": {
        "length": 1798,
        "width": 564,
        "thickness": 6
      },
      "orientation": {
        "panelPlane": "xy",
        "lengthAxis": "y",
        "widthAxis": "x",
        "thicknessAxis": "z",
        "grainAxis": "length"
      },
      "faceRole": {
        "primaryFaceRole": "rear_service_face",
        "secondaryFaceRole": "appliance_niche_rear_boundary",
        "visibleFaceRole": null
      },
      "sourceParamKeys": [
        "width",
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "boardThickness",
        "backThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "left",
          "eligibility": "non_candidate",
          "reason": "Back panel edges are captured inside the carcass and not front-finished."
        },
        {
          "edgeId": "right",
          "eligibility": "non_candidate",
          "reason": "Back panel edges are captured inside the carcass and not front-finished."
        },
        {
          "edgeId": "top",
          "eligibility": "non_candidate",
          "reason": "Back panel edges are captured inside the carcass and not front-finished."
        },
        {
          "edgeId": "bottom",
          "eligibility": "non_candidate",
          "reason": "Back panel edges are captured inside the carcass and not front-finished."
        }
      ],
      "hardwareAnchors": [],
      "nicheRelation": {
        "relationType": "niche-boundary",
        "zone": "rear",
        "relatedParamKeys": [
          "fridgeDepthMm"
        ]
      },
      "notes": [
        "Uses body material routing with dedicated fridge back thickness until the slot-based BOM phase."
      ]
    },
    {
      "partId": "door-front-upper",
      "sourceGeometryPartIds": [
        "freezer-door-front"
      ],
      "label": "Door Front Upper",
      "partType": "door-front",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "front",
      "materialKey": "mat.board.front.mdf.white_supermat.18",
      "materialParamKey": "materials.frontKey",
      "thicknessKey": "frontThicknessMm",
      "dimensionsMm": {
        "length": 700,
        "width": 600,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "xy",
        "lengthAxis": "y",
        "widthAxis": "x",
        "thicknessAxis": "z",
        "grainAxis": "length"
      },
      "faceRole": {
        "primaryFaceRole": "visible_front_face",
        "secondaryFaceRole": "appliance_facing_back_face",
        "visibleFaceRole": "customer_visible_front"
      },
      "sourceParamKeys": [
        "width",
        "freezerDoorHeightMm",
        "frontThicknessMm"
      ],
      "edgeTargets": [
        {
          "edgeId": "left",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the upper visible door front."
        },
        {
          "edgeId": "right",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the upper visible door front."
        },
        {
          "edgeId": "top",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the upper visible door front."
        },
        {
          "edgeId": "bottom",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the upper visible door front."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "door-front-upper.handle-mount",
          "anchorType": "handle",
          "anchorRole": "counted_instance",
          "instanceGroup": "door-handles",
          "instanceIndex": 1,
          "mountFace": "visible_front_face",
          "sourceParamKeys": [
            "handleComponentId",
            "handlePositionMm",
            "doorHandleOffsetFromSplitMm"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "one handle anchor on the upper integrated door",
            "rationale": "The upper fridge door exposes exactly one handle mounting location in the current fridge contract."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "handleComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Primary canonical fridge handle contract is handleComponentId + placement params."
            ]
          },
          "notes": [
            "Driven by handleComponentId, handlePositionMm and doorHandleOffsetFromSplitMm."
          ]
        },
        {
          "anchorId": "door-front-upper.hinge-cup-mount",
          "anchorType": "hinge",
          "anchorRole": "cup_preparation_zone",
          "mountFace": "appliance_facing_back_face",
          "relatedAnchorIds": [
            "carcass-side-left.hinge-mount",
            "carcass-side-right.hinge-mount"
          ],
          "sourceParamKeys": [
            "freezerDoorHeightMm",
            "fridgeDoorGapMm"
          ],
          "countRule": {
            "mode": "fixed_per_part",
            "quantity": 3,
            "formula": "3 hinges per upper integrated fridge door",
            "rationale": "Current fridge_tall preview/export contract uses three hinges on the upper door."
          },
          "componentPolicy": {
            "mode": "fixed_component",
            "componentId": "cmp.hinge.fridge_integrated.softclose",
            "bomDisposition": "separate_item",
            "notes": [
              "Mounting plate is treated as included in the hinge assembly for fridge_tall."
            ]
          },
          "notes": [
            "Upper integrated door front requires hinge cup preparation; count is formalized as a per-door canonical rule."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "door-closure",
        "zone": "upper",
        "relatedParamKeys": [
          "freezerDoorHeightMm",
          "fridgeDoorGapMm"
        ]
      }
    },
    {
      "partId": "door-front-lower",
      "sourceGeometryPartIds": [
        "fridge-door-front"
      ],
      "label": "Door Front Lower",
      "partType": "door-front",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "front",
      "materialKey": "mat.board.front.mdf.white_supermat.18",
      "materialParamKey": "materials.frontKey",
      "thicknessKey": "frontThicknessMm",
      "dimensionsMm": {
        "length": 1114,
        "width": 600,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "xy",
        "lengthAxis": "y",
        "widthAxis": "x",
        "thicknessAxis": "z",
        "grainAxis": "length"
      },
      "faceRole": {
        "primaryFaceRole": "visible_front_face",
        "secondaryFaceRole": "appliance_facing_back_face",
        "visibleFaceRole": "customer_visible_front"
      },
      "sourceParamKeys": [
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "freezerDoorHeightMm",
        "fridgeDoorGapMm",
        "frontThicknessMm"
      ],
      "edgeTargets": [
        {
          "edgeId": "left",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the lower visible door front."
        },
        {
          "edgeId": "right",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the lower visible door front."
        },
        {
          "edgeId": "top",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the lower visible door front."
        },
        {
          "edgeId": "bottom",
          "eligibility": "candidate",
          "reason": "Perimeter edge of the lower visible door front."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "door-front-lower.handle-mount",
          "anchorType": "handle",
          "anchorRole": "counted_instance",
          "instanceGroup": "door-handles",
          "instanceIndex": 2,
          "mountFace": "visible_front_face",
          "sourceParamKeys": [
            "handleComponentId",
            "handlePositionMm",
            "doorHandleOffsetFromSplitMm"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "one handle anchor on the lower integrated door",
            "rationale": "The lower fridge door exposes exactly one handle mounting location in the current fridge contract."
          },
          "componentPolicy": {
            "mode": "param_component",
            "componentParamKey": "handleComponentId",
            "bomDisposition": "separate_item",
            "notes": [
              "Primary canonical fridge handle contract is handleComponentId + placement params."
            ]
          },
          "notes": [
            "Driven by handleComponentId, handlePositionMm and doorHandleOffsetFromSplitMm."
          ]
        },
        {
          "anchorId": "door-front-lower.hinge-cup-mount",
          "anchorType": "hinge",
          "anchorRole": "cup_preparation_zone",
          "mountFace": "appliance_facing_back_face",
          "relatedAnchorIds": [
            "carcass-side-left.hinge-mount",
            "carcass-side-right.hinge-mount"
          ],
          "sourceParamKeys": [
            "freezerDoorHeightMm",
            "fridgeDoorGapMm"
          ],
          "countRule": {
            "mode": "fixed_per_part",
            "quantity": 3,
            "formula": "3 hinges per lower integrated fridge door",
            "rationale": "Current fridge_tall preview/export contract uses three hinges on the lower door."
          },
          "componentPolicy": {
            "mode": "fixed_component",
            "componentId": "cmp.hinge.fridge_integrated.softclose",
            "bomDisposition": "separate_item",
            "notes": [
              "Mounting plate is treated as included in the hinge assembly for fridge_tall."
            ]
          },
          "notes": [
            "Lower integrated door front requires hinge cup preparation; count is formalized as a per-door canonical rule."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "door-closure",
        "zone": "lower",
        "relatedParamKeys": [
          "freezerDoorHeightMm",
          "fridgeDoorGapMm"
        ]
      }
    },
    {
      "partId": "plinth-front",
      "sourceGeometryPartIds": [
        "plinth"
      ],
      "label": "Plinth Front",
      "partType": "plinth-panel",
      "boardCandidate": true,
      "edgeBandCandidate": true,
      "materialRole": "body",
      "materialKey": "mat.board.body.dtd.white.18",
      "materialParamKey": "materials.bodyKey",
      "thicknessKey": "boardThickness",
      "dimensionsMm": {
        "length": 564,
        "width": 100,
        "thickness": 18
      },
      "orientation": {
        "panelPlane": "xy",
        "lengthAxis": "x",
        "widthAxis": "y",
        "thicknessAxis": "z",
        "grainAxis": "width"
      },
      "faceRole": {
        "primaryFaceRole": "visible_plinth_front_face",
        "secondaryFaceRole": "plinth_rear_face",
        "visibleFaceRole": "customer_visible_front"
      },
      "sourceParamKeys": [
        "width",
        "plinthHeight",
        "boardThickness"
      ],
      "edgeTargets": [
        {
          "edgeId": "left",
          "eligibility": "candidate",
          "reason": "Plinth side return can remain visible at a cabinet run termination."
        },
        {
          "edgeId": "right",
          "eligibility": "candidate",
          "reason": "Plinth side return can remain visible at a cabinet run termination."
        },
        {
          "edgeId": "top",
          "eligibility": "candidate",
          "reason": "Top edge remains visually exposed at the plinth line."
        },
        {
          "edgeId": "bottom",
          "eligibility": "non_candidate",
          "reason": "Bottom edge sits in the floor/service zone."
        }
      ],
      "hardwareAnchors": [
        {
          "anchorId": "plinth-front.clip-front-left",
          "anchorType": "plinth_clip",
          "anchorRole": "counted_instance",
          "instanceGroup": "plinth-clips",
          "instanceIndex": 1,
          "mountFace": "plinth_rear_face",
          "relatedAnchorIds": [
            "carcass-bottom.leg-front-left"
          ],
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "plinthSetbackMm"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit front plinth clip anchor aligned to a front adjustable leg",
            "rationale": "Current fridge runtime generates plinth clips only on the front-left and front-right leg positions."
          },
          "componentPolicy": {
            "mode": "fixed_component",
            "componentId": "cmp.clip.plinth.standard",
            "bomDisposition": "separate_item",
            "notes": [
              "Fridge_tall uses the standard plinth clip component until a clip selector becomes canonical."
            ]
          },
          "notes": [
            "Front-left plinth clip follows the fridge runtime clip placement on the front-left leg."
          ]
        },
        {
          "anchorId": "plinth-front.clip-front-right",
          "anchorType": "plinth_clip",
          "anchorRole": "counted_instance",
          "instanceGroup": "plinth-clips",
          "instanceIndex": 2,
          "mountFace": "plinth_rear_face",
          "relatedAnchorIds": [
            "carcass-bottom.leg-front-right"
          ],
          "sourceParamKeys": [
            "width",
            "plinthHeight",
            "plinthSetbackMm"
          ],
          "countRule": {
            "mode": "explicit_instance",
            "quantity": 1,
            "formula": "explicit front plinth clip anchor aligned to a front adjustable leg",
            "rationale": "Current fridge runtime generates plinth clips only on the front-left and front-right leg positions."
          },
          "componentPolicy": {
            "mode": "fixed_component",
            "componentId": "cmp.clip.plinth.standard",
            "bomDisposition": "separate_item",
            "notes": [
              "Fridge_tall uses the standard plinth clip component until a clip selector becomes canonical."
            ]
          },
          "notes": [
            "Front-right plinth clip follows the fridge runtime clip placement on the front-right leg."
          ]
        }
      ],
      "nicheRelation": {
        "relationType": "support-base",
        "zone": "front",
        "relatedParamKeys": [
          "plinthHeight",
          "plinthSetbackMm"
        ]
      }
    }
  ],
  "hardwareRules": {
    "hinges": {
      "rulesByDoor": [
        {
          "doorPartId": "door-front-upper",
          "hingeCount": 3,
          "formula": "3 hinges per upper integrated fridge door",
          "rationale": "Formalized from the current fridge_tall preview/export contract, which uses three hinges on the upper door.",
          "hingeComponentId": "cmp.hinge.fridge_integrated.softclose",
          "mountingPlatePolicy": "included_in_hinge_assembly",
          "sourceAnchorIds": [
            "door-front-upper.hinge-cup-mount",
            "carcass-side-left.hinge-mount",
            "carcass-side-right.hinge-mount"
          ]
        },
        {
          "doorPartId": "door-front-lower",
          "hingeCount": 3,
          "formula": "3 hinges per lower integrated fridge door",
          "rationale": "Formalized from the current fridge_tall preview/export contract, which uses three hinges on the lower door.",
          "hingeComponentId": "cmp.hinge.fridge_integrated.softclose",
          "mountingPlatePolicy": "included_in_hinge_assembly",
          "sourceAnchorIds": [
            "door-front-lower.hinge-cup-mount",
            "carcass-side-left.hinge-mount",
            "carcass-side-right.hinge-mount"
          ]
        }
      ]
    },
    "handles": {
      "componentParamKey": "handleComponentId",
      "placementParamKeys": [
        "handlePositionMm",
        "doorHandleOffsetFromSplitMm"
      ],
      "screwPolicySource": "component_definition",
      "sourceAnchorIds": [
        "door-front-upper.handle-mount",
        "door-front-lower.handle-mount"
      ]
    },
    "legs": {
      "componentParamKey": "legComponentId",
      "countRule": "width <= 600 ? 4 : width <= 900 ? 5 : 6",
      "rationale": "Matches the current fridge_tall runtime leg placement rule.",
      "sourceAnchorIds": [
        "carcass-bottom.leg-front-left",
        "carcass-bottom.leg-front-right",
        "carcass-bottom.leg-rear-left",
        "carcass-bottom.leg-rear-right"
      ]
    },
    "plinthClips": {
      "componentId": "cmp.clip.plinth.standard",
      "countRule": "front-left + front-right clip only",
      "rationale": "Matches the current fridge_tall runtime, which clips the plinth only to the two front legs.",
      "sourceAnchorIds": [
        "plinth-front.clip-front-left",
        "plinth-front.clip-front-right"
      ]
    },
    "carcassFasteners": {
      "policy": "excluded_until_joinery_metadata",
      "reason": "No explicit carcass joinery anchors or per-joint count rules exist yet for fridge_tall."
    }
  },
  "summary": {
    "totalParts": 8,
    "boardCandidates": 8,
    "edgeBandCandidates": 7,
    "hardwareAnchorCount": 12
  }
} as const;

export function listManufacturableParts() {
  return manufacturablePartMap.parts;
}

export function summarizeManufacturableParts() {
  return manufacturablePartMap.summary;
}