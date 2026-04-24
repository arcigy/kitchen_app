export const moduleType = "flap_shelves_low";
export const displayName = "Flap";
export const defaultDrawerCount = 0;
export const validationRules = [
  {
    "code": "width_positive",
    "condition": "params.width > 0 || params.lengthX > 0",
    "message": "flap_shelves_low width must be positive."
  },
  {
    "code": "height_positive",
    "condition": "params.height > 0",
    "message": "flap_shelves_low height must be positive."
  },
  {
    "code": "depth_positive",
    "condition": "params.depth > 0 || params.lengthZ > 0",
    "message": "flap_shelves_low depth must be positive."
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
  return {
    valid: errors.length === 0,
    errors
  };
}