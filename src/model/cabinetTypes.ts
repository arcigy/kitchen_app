export const MODULE_TYPES = [] as const;
export type ModuleType = string;

export type ModuleParams = {
  type: string;
} & Record<string, unknown>;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  throw new Error(`No imported modules are registered: ${type}`);
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  return params;
}

export function validateModule(_params: ModuleParams): string[] {
  return [];
}
