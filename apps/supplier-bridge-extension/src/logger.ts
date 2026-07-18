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

export function formatBridgeLog(level: BridgeLogLevel, event: string, details: Record<string, unknown> = {}): string {
  const payload = {
    scope: "arcigy-supplier-bridge",
    level,
    event,
    at: new Date().toISOString(),
    ...sanitize(details)
  };
  // chrome://extensions renders logged objects only as "[object Object]".
  // A bounded JSON string preserves the safe diagnostic details in its Errors view.
  return `[Arcigy Supplier Bridge] ${JSON.stringify(payload)}`;
}

export function bridgeLog(level: BridgeLogLevel, event: string, details: Record<string, unknown> = {}): void {
  if (level === "debug" && !supplierBridgeBuild.debug) return;
  const message = formatBridgeLog(level, event, details);
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else if (level === "info") console.info(message);
  else console.debug(message);
}
