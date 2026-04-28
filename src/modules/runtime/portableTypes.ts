export type PortableJsonValue =
  | string
  | number
  | boolean
  | null
  | PortableJsonValue[]
  | { [key: string]: PortableJsonValue };

type PortableRecord = Record<string, PortableJsonValue>;

type PortableValidationResult =
  | string[]
  | {
      valid?: boolean;
      errors?: string[];
    };

function isPortableRecord(value: unknown): value is PortableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function mergeValue(defaultValue: PortableJsonValue, nextValue: unknown): PortableJsonValue {
  if (nextValue === undefined) return cloneValue(defaultValue);

  if (Array.isArray(defaultValue)) {
    return Array.isArray(nextValue) ? cloneValue(nextValue as PortableJsonValue[]) : cloneValue(defaultValue);
  }

  if (isPortableRecord(defaultValue)) {
    if (!isPortableRecord(nextValue)) return cloneValue(defaultValue);
    const merged: PortableRecord = {};
    const keys = new Set([...Object.keys(defaultValue), ...Object.keys(nextValue)]);
    for (const key of keys) {
      const base = defaultValue[key];
      const next = nextValue[key];
      if (base === undefined) {
        merged[key] = cloneValue(next as PortableJsonValue);
        continue;
      }
      merged[key] = mergeValue(base, next);
    }
    return merged;
  }

  if (
    nextValue === null ||
    typeof nextValue === "string" ||
    typeof nextValue === "number" ||
    typeof nextValue === "boolean"
  ) {
    return nextValue;
  }

  return cloneValue(defaultValue);
}

export function makePortableDefaultParams<T extends PortableRecord & { type?: string }>(defaults: T, moduleType: string): T {
  const next = cloneValue(defaults);
  next.type = moduleType;
  return next;
}

export function normalizePortableParams<T extends PortableRecord & { type?: string }>(
  defaults: T,
  input: unknown,
  moduleType: string
): T {
  const merged = mergeValue(defaults, input) as T;
  merged.type = moduleType;
  return merged;
}

export function validatePortableParams(
  params: Record<string, unknown>,
  validate: (input: Record<string, unknown>) => PortableValidationResult
): string[] {
  const result = validate(params);
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.errors)) return result.errors;
  return result.valid === false ? ["Portable validation reported an invalid state."] : [];
}
