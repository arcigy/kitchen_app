export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const defaultDrawerCount = 0;
export const validationRules = [
  {
    "code": "width_positive",
    "condition": "params.width > 0 || params.lengthX > 0",
    "message": "fridge_tall width must be positive."
  },
  {
    "code": "height_positive",
    "condition": "params.height > 0",
    "message": "fridge_tall height must be positive."
  },
  {
    "code": "depth_positive",
    "condition": "params.depth > 0 || params.lengthZ > 0",
    "message": "fridge_tall depth must be positive."
  },
  {
    "code": "freezer_door_height_positive",
    "condition": "params.freezerDoorHeightMm > 0",
    "message": "freezerDoorHeightMm must be positive."
  },
  {
    "code": "fridge_door_gap_non_negative",
    "condition": "params.fridgeDoorGapMm >= 0",
    "message": "fridgeDoorGapMm must be non-negative."
  }
] as const;

export function validateParams(input: Record<string, unknown>) {
  const errors: string[] = [];
  const width = typeof input.width === 'number' ? input.width : typeof input.lengthX === 'number' ? input.lengthX : 0;
  const height = typeof input.height === 'number' ? input.height : 0;
  const depth = typeof input.depth === 'number' ? input.depth : typeof input.lengthZ === 'number' ? input.lengthZ : 0;
  if (width <= 0) errors.push('Width must be positive.');
  if (height <= 0) errors.push('Height must be positive.');
  if (depth <= 0) errors.push('Depth must be positive.');
  const freezerDoorHeightMm = typeof input.freezerDoorHeightMm === 'number' ? input.freezerDoorHeightMm : 0;
  const fridgeDoorGapMm = typeof input.fridgeDoorGapMm === 'number' ? input.fridgeDoorGapMm : 0;
  if (freezerDoorHeightMm <= 0) errors.push('freezerDoorHeightMm must be positive.');
  if (fridgeDoorGapMm < 0) errors.push('fridgeDoorGapMm must be >= 0.');
  return {
    valid: errors.length === 0,
    errors
  };
}