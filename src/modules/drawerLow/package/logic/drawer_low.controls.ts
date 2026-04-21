export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const parameterCatalog = {
  "schemaVersion": "module-parameter-catalog.v1",
  "moduleType": "drawer_low",
  "displayName": "Drawer",
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
      "key": "autoFit",
      "group": "general",
      "type": "boolean",
      "required": true,
      "defaultValue": true,
      "description": "Exported parameter auto fit."
    },
    {
      "key": "backGrooveClearanceMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 1,
      "description": "Exported parameter back groove clearance mm."
    },
    {
      "key": "backGrooveDepthMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 8,
      "description": "Exported parameter back groove depth mm."
    },
    {
      "key": "backGrooveOffsetMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 12,
      "description": "Exported parameter back groove offset mm."
    },
    {
      "key": "backGrooveWidthMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 8,
      "description": "Exported parameter back groove width mm."
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
      "key": "bottomGap",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter bottom gap."
    },
    {
      "key": "depth",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 560,
      "description": "Exported parameter depth."
    },
    {
      "key": "drawerBackReserveMm",
      "group": "drawers",
      "type": "number",
      "required": true,
      "defaultValue": 8,
      "description": "Exported parameter drawer back reserve mm."
    },
    {
      "key": "drawerBoxSideHeight",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 110,
      "description": "Exported parameter drawer box side height."
    },
    {
      "key": "drawerBoxThickness",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 13,
      "description": "Exported parameter drawer box thickness."
    },
    {
      "key": "drawerCount",
      "group": "drawers",
      "type": "number",
      "required": true,
      "defaultValue": 3,
      "description": "Exported parameter drawer count."
    },
    {
      "key": "drawerFrontHeights",
      "group": "dimensions",
      "type": "number[]",
      "required": true,
      "defaultValue": [
        185,
        185,
        184
      ],
      "description": "Exported parameter drawer front heights."
    },
    {
      "key": "frontGap",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter front gap."
    },
    {
      "key": "frontStackPreset",
      "group": "fronts",
      "type": "string",
      "required": true,
      "defaultValue": "equal",
      "description": "Exported parameter front stack preset."
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
      "defaultValue": 700,
      "description": "Exported parameter height."
    },
    {
      "key": "heightCarcass",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 662,
      "description": "Exported parameter height carcass."
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
        "bodyKey": "2",
        "frontKey": "3",
        "drawerKey": "5"
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
      "key": "sideClearanceMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 4,
      "description": "Exported parameter side clearance mm."
    },
    {
      "key": "sideGap",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter side gap."
    },
    {
      "key": "topFrontHeightMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 160,
      "description": "Exported parameter top front height mm."
    },
    {
      "key": "topGap",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 2,
      "description": "Exported parameter top gap."
    },
    {
      "key": "type",
      "group": "general",
      "type": "string",
      "required": true,
      "defaultValue": "drawer_low",
      "description": "Exported parameter type."
    },
    {
      "key": "width",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 800,
      "description": "Exported parameter width."
    },
    {
      "key": "worktopThicknessMm",
      "group": "dimensions",
      "type": "number",
      "required": true,
      "defaultValue": 38,
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