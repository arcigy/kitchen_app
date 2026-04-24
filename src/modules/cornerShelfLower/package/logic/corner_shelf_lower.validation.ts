export const moduleType = "corner_shelf_lower";
export const displayName = "Corner";
export const validationRules = [
  {
    "code": "width_positive",
    "condition": "params.lengthX > 0",
    "message": "corner_shelf_lower lengthX must be positive."
  },
  {
    "code": "height_positive",
    "condition": "params.height > 0",
    "message": "corner_shelf_lower height must be positive."
  },
  {
    "code": "depth_positive",
    "condition": "params.depth > 0 && params.lengthZ > 0",
    "message": "corner_shelf_lower depth and lengthZ must be positive."
  },
  {
    "code": "plinth_not_exceed_carcass",
    "condition": "params.plinthHeight <= (params.heightCarcass - 2 * params.boardThickness)",
    "message": "plinthHeight must fit inside the carcass height."
  },
  {
    "code": "door_height_positive",
    "condition": "(params.heightCarcass - params.plinthHeight - params.topGap - params.bottomGap) > 0",
    "message": "Corner door height must stay positive."
  }
] as const;

export function validateParams(input: Record<string, unknown>) {
  const errors: string[] = [];
  const width = typeof input.lengthX === 'number' ? input.lengthX : 0;
  const height = typeof input.height === 'number' ? input.height : 0;
  const depth = typeof input.depth === 'number' ? input.depth : 0;
  const lengthZ = typeof input.lengthZ === 'number' ? input.lengthZ : 0;
  const heightCarcass = typeof input.heightCarcass === 'number' ? input.heightCarcass : 0;
  const boardThickness = typeof input.boardThickness === 'number' ? input.boardThickness : 0;
  const plinthHeight = typeof input.plinthHeight === 'number' ? input.plinthHeight : 0;
  const topGap = typeof input.topGap === 'number' ? input.topGap : 0;
  const bottomGap = typeof input.bottomGap === 'number' ? input.bottomGap : 0;
  if (width <= 0) errors.push('Width must be positive.');
  if (height <= 0) errors.push('Height must be positive.');
  if (depth <= 0) errors.push('Depth must be positive.');
  if (lengthZ <= 0) errors.push('Length Z must be positive.');
  if (plinthHeight > Math.max(0, heightCarcass - 2 * boardThickness)) errors.push('Plinth height is too large.');
  if (heightCarcass - plinthHeight - topGap - bottomGap <= 0) errors.push('Door opening height must stay positive.');
  return {
    valid: errors.length === 0,
    errors
  };
}
