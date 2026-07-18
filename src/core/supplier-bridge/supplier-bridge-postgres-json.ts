export function supplierBridgePostgresText(value: string): string {
  return value.replace(/\u0000/g, "");
}

export function supplierBridgePostgresValues(...values: unknown[]): unknown[] {
  return values.map((value) => typeof value === "string" ? supplierBridgePostgresText(value) : value);
}

/** Serializes a value that is safe for PostgreSQL json/jsonb input. */
export function stringifySupplierBridgeJson(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => (
    typeof nestedValue === "string" ? supplierBridgePostgresText(nestedValue) : nestedValue
  ));
  if (serialized === undefined) throw new TypeError("Supplier Bridge JSON value is not serializable.");
  return serialized;
}
