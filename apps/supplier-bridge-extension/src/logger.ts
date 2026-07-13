import { supplierBridgeBuild } from "./config";

type BridgeLogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /(?:token|cookie|authorization|password|secret|rawDom|html|personal)/i;

function sanitize(details: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") result[key] = value.slice(0, 240);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

export function bridgeLog(level: BridgeLogLevel, event: string, details: Record<string, unknown> = {}): void {
  if (level === "debug" && !supplierBridgeBuild.debug) return;
  const payload = {
    scope: "arcigy-supplier-bridge",
    event,
    at: new Date().toISOString(),
    ...sanitize(details)
  };
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else if (level === "info") console.info(payload);
  else console.debug(payload);
}
