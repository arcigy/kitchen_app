import type { AssistantToolCall, AssistantToolDefinition } from "./types";
import { getAssistantToolDefinition } from "./toolRegistry";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateValue(value: unknown, schema: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  const type = schema.type;
  if (type === "object") {
    if (!isRecord(value)) return [`${path} must be an object.`];
    const properties = isRecord(schema.properties) ? schema.properties as Record<string, JsonSchema> : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    for (const key of required) if (!(key in value)) errors.push(`${path}.${key} is required.`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) errors.push(`${path}.${key} is not allowed.`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value && isRecord(child)) errors.push(...validateValue(value[key], child, `${path}.${key}`));
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array.`];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    if (isRecord(schema.items)) value.forEach((item, index) => errors.push(...validateValue(item, schema.items as JsonSchema, `${path}[${index}]`)));
  } else if (type === "string") {
    if (typeof value !== "string") return [`${path} must be a string.`];
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${path} is too short.`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push(`${path} is too long.`);
  } else if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${path} must be a finite number.`];
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}.`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}.`);
  } else if (type === "boolean" && typeof value !== "boolean") {
    return [`${path} must be a boolean.`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`);
  return errors;
}

export function validateAssistantToolInput(definition: AssistantToolDefinition, input: unknown): string[] {
  return validateValue(input, definition.inputSchema, "input");
}

export function validateAssistantToolCall(call: AssistantToolCall): { definition: AssistantToolDefinition | null; errors: string[] } {
  const definition = getAssistantToolDefinition(call.toolId);
  if (!definition) return { definition: null, errors: [`Assistant tool ${call.toolId} is not registered.`] };
  return { definition, errors: validateAssistantToolInput(definition, call.input) };
}
