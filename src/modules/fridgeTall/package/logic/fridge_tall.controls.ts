export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const parameterCatalog = {
  "schemaVersion": "module-parameter-catalog.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "groups": [
    {
      "key": "general",
      "label": "General",
      "description": "Primary module identity and behavior parameters."
    },
    {
      "key": "dimensions",
      "label": "Dimensions",
      "description": "Overall sizing, spacing, thicknesses and clearances."
    },
    {
      "key": "materials",
      "label": "Materials",
      "description": "Material and finish parameters."
    },
    {
      "key": "fronts",
      "label": "Fronts & Doors",
      "description": "Front, handle and opening-related parameters."
    },
    {
      "key": "drawers",
      "label": "Drawers",
      "description": "Drawer stack, boxes and runner-related parameters."
    },
    {
      "key": "placement",
      "label": "Placement",
      "description": "Scene placement and mounting parameters."
    },
    {
      "key": "other",
      "label": "Other",
      "description": "Parameters that do not fit the main module groups."
    }
  ],
  "parameters": [
    {
      "key": "__fridgeHandleSplitScaleVersion",
      "group": "fronts",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter   fridge handle split scale version."
    },
    {
      "key": "assemblyContext",
      "group": "general",
      "type": "string",
      "required": true,
      "defaultValue": "kitchen",
      "description": "Exported parameter assembly context."
    },
    {
      "key": "backThickness",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 6,
      "description": "Exported parameter back thickness."
    },
    {
      "key": "boardThickness",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 18,
      "description": "Exported parameter board thickness."
    },
    {
      "key": "depth",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 600,
      "description": "Exported parameter depth."
    },
    {
      "key": "doorHandleOffsetFromSplitMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 0,
      "description": "Exported parameter door handle offset from split mm."
    },
    {
      "key": "doorOpen",
      "group": "fronts",
      "type": "boolean",
      "required": true,
      "defaultValue": false,
      "description": "Exported parameter door open."
    },
    {
      "key": "freezerDoorHeightMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 700,
      "description": "Exported parameter freezer door height mm."
    },
    {
      "key": "fridgeBottomClearanceMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 5,
      "description": "Exported parameter fridge bottom clearance mm."
    },
    {
      "key": "fridgeDepthMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 550,
      "description": "Exported parameter fridge depth mm."
    },
    {
      "key": "fridgeDoorGapMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter fridge door gap mm."
    },
    {
      "key": "fridgeHeightMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 1770,
      "description": "Exported parameter fridge height mm."
    },
    {
      "key": "fridgeSideClearanceMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter fridge side clearance mm."
    },
    {
      "key": "fridgeTopClearanceMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 5,
      "description": "Exported parameter fridge top clearance mm."
    },
    {
      "key": "fridgeWidthMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 560,
      "description": "Exported parameter fridge width mm."
    },
    {
      "key": "frontThicknessMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 18,
      "description": "Exported parameter front thickness mm."
    },
    {
      "key": "handleComponentId",
      "group": "fronts",
      "type": "string",
      "required": true,
      "defaultValue": "cmp.handle.bar.160.black",
      "description": "Exported parameter handle component id."
    },
    {
      "key": "handleLengthMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 160,
      "description": "Exported parameter handle length mm."
    },
    {
      "key": "handlePositionMm",
      "group": "fronts",
      "type": "number",
      "required": true,
      "defaultValue": 60,
      "description": "Exported parameter handle position mm."
    },
    {
      "key": "handleProjectionMm",
      "group": "fronts",
      "type": "number",
      "required": true,
      "defaultValue": 14,
      "description": "Exported parameter handle projection mm."
    },
    {
      "key": "handleSizeMm",
      "group": "fronts",
      "type": "number",
      "required": true,
      "defaultValue": 12,
      "description": "Exported parameter handle size mm."
    },
    {
      "key": "handleType",
      "group": "fronts",
      "type": "string",
      "required": true,
      "defaultValue": "bar",
      "description": "Exported parameter handle type."
    },
    {
      "key": "height",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 1916,
      "description": "Exported parameter height."
    },
    {
      "key": "hingeComponentId",
      "group": "fronts",
      "type": "string",
      "required": true,
      "defaultValue": "cmp.hinge.fridge_integrated.softclose",
      "description": "Exported parameter hinge component id."
    },
    {
      "key": "kitchenModuleRole",
      "group": "general",
      "type": "string",
      "required": true,
      "defaultValue": "tall",
      "description": "Exported parameter kitchen module role."
    },
    {
      "key": "legComponentId",
      "group": "general",
      "type": "string",
      "required": true,
      "defaultValue": "cmp.leg.adjustable.100.black",
      "description": "Exported parameter leg component id."
    },
    {
      "key": "materials",
      "group": "materials",
      "type": "object",
      "required": true,
      "defaultValue": {
        "bodyKey": "mat.board.body.dtd.white.18",
        "bodyColor": "#f3f3ef",
        "frontKey": "mat.board.front.mdf.white_supermat.18",
        "frontColor": "#d7d9dd"
      },
      "description": "Exported parameter materials."
    },
    {
      "key": "plinthHeight",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 100,
      "description": "Exported parameter plinth height."
    },
    {
      "key": "plinthSetbackMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 60,
      "description": "Exported parameter plinth setback mm."
    },
    {
      "key": "requiresWorktop",
      "group": "placement",
      "type": "boolean",
      "required": true,
      "defaultValue": false,
      "description": "Exported parameter requires worktop."
    },
    {
      "key": "type",
      "group": "general",
      "type": "string",
      "required": true,
      "defaultValue": "fridge_tall",
      "description": "Exported parameter type."
    },
    {
      "key": "width",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 600,
      "description": "Exported parameter width."
    },
    {
      "key": "worktopThicknessMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 0,
      "description": "Exported parameter worktop thickness mm."
    }
  ]
} as const;

export function listEditableParameters() {
  return parameterCatalog.parameters.map((parameter) => ({
    key: parameter.key,
    group: parameter.group,
    type: parameter.type,
    defaultValue: parameter.defaultValue
  }));
}