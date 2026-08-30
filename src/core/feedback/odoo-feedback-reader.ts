const MAX_DIAGNOSTICS_BYTES = 20 * 1024 * 1024;

export function parseOdooDiagnostics(base64: string): Record<string, unknown> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_DIAGNOSTICS_BYTES) throw new Error("Odoo diagnostics attachment is outside the allowed size.");
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Odoo diagnostics attachment is not an object.");
  return value as Record<string, unknown>;
}

export function boundedLimit(value: string | undefined): number {
  const parsed = Number(value ?? 20);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 20;
}
