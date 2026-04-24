export const moduleType = "swing_shelves_low";
export const displayName = "Shelf Doors";
export const hardwareBomSnapshot = {
  "schemaVersion": "module-hardware-bom.v1",
  "moduleType": "swing_shelves_low",
  "displayName": "Shelf Doors",
  "generatedAt": "2026-04-24T16:38:04.892Z",
  "items": [
    {
      "id": "door-handles",
      "itemType": "hardware",
      "category": "hardware",
      "name": "Bar Handle 160 mm Black Door Handle Set",
      "description": "Handle assemblies mounted to the exported door fronts.",
      "pricingBasis": "piece",
      "pricingUnit": "pcs",
      "quantity": 2,
      "pricingQuantity": 2,
      "formulas": {
        "quantity": "count(partMap.hardwareAnchors[type=handle])",
        "pricingQuantity": "quantity"
      },
      "materialGroup": "handle",
      "component": {
        "entityType": "component",
        "catalogId": "cmp.handle.bar.160.black",
        "componentType": "handle",
        "geometryId": "geo.handle.bar.160",
        "name": "Bar Handle 160 Black",
        "displayName": "Bar Handle 160 mm Black",
        "brand": "Forma",
        "series": "Barline",
        "variant": "160 mm",
        "color": "Black",
        "pricingBasis": "piece",
        "pricingUnit": "pcs",
        "defaultQuantity": 1,
        "nominalLengthMm": 160,
        "nominalHeightMm": null,
        "preview": {
          "colorHex": "#1e232b",
          "roughness": 0.45,
          "metalness": 0.55
        }
      },
      "catalogRef": {
        "entityType": "component",
        "catalogId": "cmp.handle.bar.160.black",
        "displayName": "Bar Handle 160 mm Black",
        "group": "handle",
        "pricingBasis": "piece",
        "pricingUnit": "pcs"
      },
      "pricingLookup": {
        "catalogType": "hardware_piece",
        "key": "cmp.handle.bar.160.black",
        "sourceCatalogId": "cmp.handle.bar.160.black",
        "sourceEntityType": "component",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-left",
        "door-front-right"
      ],
      "notes": [
        "door-front-left.handle-mount: explicit handle anchor",
        "door-front-right.handle-mount: explicit handle anchor"
      ]
    },
    {
      "id": "door-hinges",
      "itemType": "hardware",
      "category": "hardware",
      "name": "Clip-On Hinge Softclose",
      "description": "Door hinge assemblies for the exported swing fronts.",
      "pricingBasis": "piece",
      "pricingUnit": "pcs",
      "quantity": 4,
      "pricingQuantity": 4,
      "formulas": {
        "quantity": "door-front-left: hingeCountPerDoor + door-front-right: hingeCountPerDoor",
        "pricingQuantity": "quantity"
      },
      "materialGroup": "hinge",
      "component": {
        "entityType": "component",
        "catalogId": "cmp.hinge.clip_on.softclose",
        "componentType": "hinge",
        "geometryId": "geo.hinge.clip_on.softclose",
        "name": "Clip-On Hinge Softclose",
        "displayName": "Clip-On Hinge Softclose",
        "brand": "HingeWorks",
        "series": "Clip",
        "variant": "110 degree softclose",
        "color": "Nickel",
        "pricingBasis": "piece",
        "pricingUnit": "pcs",
        "defaultQuantity": 1,
        "nominalLengthMm": null,
        "nominalHeightMm": null,
        "preview": {
          "colorHex": "#aeb3bb",
          "roughness": 0.25,
          "metalness": 0.88
        }
      },
      "catalogRef": {
        "entityType": "component",
        "catalogId": "cmp.hinge.clip_on.softclose",
        "displayName": "Clip-On Hinge Softclose",
        "group": "hinge",
        "pricingBasis": "piece",
        "pricingUnit": "pcs"
      },
      "pricingLookup": {
        "catalogType": "hardware_piece",
        "key": "cmp.hinge.clip_on.softclose",
        "sourceCatalogId": "cmp.hinge.clip_on.softclose",
        "sourceEntityType": "component",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-left",
        "carcass-side-left",
        "door-front-right",
        "carcass-side-right"
      ],
      "notes": [
        "door-front-left: Swing shelf door hinge count follows hingeCountPerDoor.",
        "door-front-right: Swing shelf door hinge count follows hingeCountPerDoor.",
        "Mounting plates are included in the hinge assembly."
      ]
    },
    {
      "id": "adjustable-legs",
      "itemType": "hardware",
      "category": "hardware",
      "name": "Adjustable Leg 100 mm Black",
      "description": "Adjustable support legs for the floor-mounted shelf module.",
      "pricingBasis": "piece",
      "pricingUnit": "pcs",
      "quantity": 4,
      "pricingQuantity": 4,
      "formulas": {
        "quantity": "4",
        "pricingQuantity": "quantity"
      },
      "materialGroup": "leg",
      "component": {
        "entityType": "component",
        "catalogId": "cmp.leg.adjustable.100.black",
        "componentType": "leg",
        "geometryId": "geo.leg.adjustable.100",
        "name": "Adjustable Leg 100 Black",
        "displayName": "Adjustable Leg 100 mm Black",
        "brand": "BaseTech",
        "series": "Level",
        "variant": "100 mm adjustable",
        "color": "Black",
        "pricingBasis": "piece",
        "pricingUnit": "pcs",
        "defaultQuantity": 1,
        "nominalLengthMm": null,
        "nominalHeightMm": 100,
        "preview": {
          "colorHex": "#1e232b",
          "roughness": 0.45,
          "metalness": 0.55
        }
      },
      "catalogRef": {
        "entityType": "component",
        "catalogId": "cmp.leg.adjustable.100.black",
        "displayName": "Adjustable Leg 100 mm Black",
        "group": "leg",
        "pricingBasis": "piece",
        "pricingUnit": "pcs"
      },
      "pricingLookup": {
        "catalogType": "hardware_piece",
        "key": "cmp.leg.adjustable.100.black",
        "sourceCatalogId": "cmp.leg.adjustable.100.black",
        "sourceEntityType": "component",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-bottom"
      ],
      "notes": [
        "carcass-bottom.leg-front-left: explicit leg anchor",
        "carcass-bottom.leg-front-right: explicit leg anchor",
        "carcass-bottom.leg-rear-left: explicit leg anchor",
        "carcass-bottom.leg-rear-right: explicit leg anchor"
      ]
    },
    {
      "id": "plinth-clips",
      "itemType": "hardware",
      "category": "hardware",
      "name": "Plinth Clip Standard",
      "description": "Front plinth clips resolved from explicit fridge clip anchors.",
      "pricingBasis": "piece",
      "pricingUnit": "pcs",
      "quantity": 2,
      "pricingQuantity": 2,
      "formulas": {
        "quantity": "2",
        "pricingQuantity": "quantity"
      },
      "materialGroup": "plinth_clip",
      "component": {
        "entityType": "component",
        "catalogId": "cmp.clip.plinth.standard",
        "componentType": "plinth_clip",
        "geometryId": "geo.plinth_clip.standard",
        "name": "Plinth Clip Standard",
        "displayName": "Plinth Clip Standard",
        "brand": "BaseTech",
        "series": "ClipFix",
        "variant": "Standard clip",
        "color": "Black",
        "pricingBasis": "piece",
        "pricingUnit": "pcs",
        "defaultQuantity": 1,
        "nominalLengthMm": null,
        "nominalHeightMm": null,
        "preview": {
          "colorHex": "#1e232b",
          "roughness": 0.45,
          "metalness": 0.55
        }
      },
      "catalogRef": {
        "entityType": "component",
        "catalogId": "cmp.clip.plinth.standard",
        "displayName": "Plinth Clip Standard",
        "group": "plinth_clip",
        "pricingBasis": "piece",
        "pricingUnit": "pcs"
      },
      "pricingLookup": {
        "catalogType": "hardware_piece",
        "key": "cmp.clip.plinth.standard",
        "sourceCatalogId": "cmp.clip.plinth.standard",
        "sourceEntityType": "component",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "plinth-front",
        "carcass-bottom"
      ],
      "notes": [
        "plinth-front.clip-front-left: explicit plinth clip anchor",
        "plinth-front.clip-front-right: explicit plinth clip anchor"
      ]
    }
  ],
  "summary": {
    "totalItems": 4,
    "hardwarePieces": 12
  },
  "notes": [
    "Hinge mounting plates are explicitly treated as included in the hinge assembly for fridge_tall.",
    "No carcass-fastener-set item: No explicit carcass joinery anchors or fastener count rules are exported for swing_shelves_low."
  ]
} as const;

export function generateHardwareBom() {
  return hardwareBomSnapshot;
}

export function summarizeHardwareBom() {
  return hardwareBomSnapshot.summary;
}