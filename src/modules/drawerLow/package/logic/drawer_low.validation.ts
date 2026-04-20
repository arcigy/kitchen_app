export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const defaultDrawerCount = 3;
export const validationRules = [
  {
    "code": "width_positive",
    "condition": "params.width > 0 || params.lengthX > 0",
    "message": "drawer_low width must be positive."
  },
  {
    "code": "height_positive",
    "condition": "params.height > 0",
    "message": "drawer_low height must be positive."
  },
  {
    "code": "depth_positive",
    "condition": "params.depth > 0 || params.lengthZ > 0",
    "message": "drawer_low depth must be positive."
  },
  {
    "code": "drawer_fronts_match_count",
    "condition": "drawerFrontHeights.length === 0 || drawerFrontHeights.length === drawerCount",
    "message": "drawerFrontHeights should be empty or match drawerCount."
  }
] as const;

export function validateParams(input: Record<string, unknown>) {
  const errors: string[] = [];
  const width = typeof input.width === 'number' ? input.width : typeof input.lengthX === 'number' ? input.lengthX : 0;
  const height = typeof input.height === 'number' ? input.height : 0;
  const depth = typeof input.depth === 'number' ? input.depth : typeof input.lengthZ === 'number' ? input.lengthZ : 0;
  const drawerCount = typeof input.drawerCount === 'number' ? Math.max(1, Math.round(input.drawerCount)) : defaultDrawerCount;
  const drawerFrontHeights = Array.isArray(input.drawerFrontHeights)
    ? input.drawerFrontHeights.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : [];
  if (width <= 0) errors.push('Width must be positive.');
  if (height <= 0) errors.push('Height must be positive.');
  if (depth <= 0) errors.push('Depth must be positive.');
  if (drawerFrontHeights.length > 0 && drawerFrontHeights.length !== drawerCount) {
    errors.push('drawerFrontHeights must match drawerCount.');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}