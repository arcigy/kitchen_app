import type { SupplierSourcePageType } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type {
  DiagnosticField,
  DiagnosticFieldCapture,
  DiagnosticNodeSnapshot
} from "./messages";

export const MAX_DIAGNOSTIC_EXPORT_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 240;
const MAX_ATTRIBUTE_LENGTH = 180;
const SENSITIVE_ATTRIBUTE = /(?:token|authorization|cookie|session|password|passwd|secret|email|phone|user|account)/i;

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted-token]");
}

function cssEscape(value: string): string {
  const escape = (globalThis.CSS as { escape?: (input: string) => string } | undefined)?.escape;
  return typeof escape === "function" ? escape(value) : value.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`);
}

function safeAttributes(element: Element): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const allowed = name === "id" || name === "class" || name.startsWith("data-") || name.startsWith("aria-");
    if (!allowed || SENSITIVE_ATTRIBUTE.test(name) || SENSITIVE_ATTRIBUTE.test(attribute.value)) continue;
    result[name] = truncate(redactSensitiveText(attribute.value), MAX_ATTRIBUTE_LENGTH);
  }
  return result;
}

function candidateSelectors(element: Element, attributes: Record<string, string>): string[] {
  const selectors: string[] = [];
  if (element.id && !SENSITIVE_ATTRIBUTE.test(element.id)) selectors.push(`#${cssEscape(element.id)}`);
  const classes = [...element.classList].filter((name) => !SENSITIVE_ATTRIBUTE.test(name)).slice(0, 2);
  if (classes.length > 0) selectors.push(`${element.tagName.toLowerCase()}.${classes.map(cssEscape).join(".")}`);
  for (const [name, value] of Object.entries(attributes).filter(([name]) => name.startsWith("data-")).slice(0, 2)) {
    selectors.push(`${element.tagName.toLowerCase()}[${cssEscape(name)}="${cssEscape(value)}"]`);
  }
  selectors.push(element.tagName.toLowerCase());
  return [...new Set(selectors)].slice(0, 5);
}

export function sanitizeDiagnosticElement(element: Element): DiagnosticNodeSnapshot {
  const attributes = safeAttributes(element);
  const passwordInput = element instanceof HTMLInputElement && element.type === "password";
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id && !SENSITIVE_ATTRIBUTE.test(element.id) ? truncate(element.id, 120) : null,
    classes: [...element.classList].filter((name) => !SENSITIVE_ATTRIBUTE.test(name)).slice(0, 6),
    attributes,
    textContent: passwordInput ? "" : truncate(redactSensitiveText(element.textContent ?? ""), MAX_TEXT_LENGTH),
    candidateSelectors: candidateSelectors(element, attributes)
  };
}

export function captureDiagnosticField(
  element: Element,
  field: DiagnosticField,
  pageType: SupplierSourcePageType,
  extensionVersion: string
): DiagnosticFieldCapture {
  const parents: DiagnosticNodeSnapshot[] = [];
  let parent = element.parentElement;
  while (parent && parents.length < 2) {
    parents.push(sanitizeDiagnosticElement(parent));
    parent = parent.parentElement;
  }
  const siblings = element.parentElement
    ? [...element.parentElement.children].filter((candidate) => candidate !== element).slice(0, 2).map(sanitizeDiagnosticElement)
    : [];
  return {
    field,
    selected: sanitizeDiagnosticElement(element),
    parents,
    siblings,
    pathname: element.ownerDocument.defaultView?.location.pathname ?? "/",
    pageType,
    extensionVersion
  };
}

export function createDiagnosticExport(args: {
  pageType: SupplierSourcePageType;
  extensionVersion: string;
  fields: Partial<Record<DiagnosticField, DiagnosticFieldCapture>>;
  page?: { supplierId: string; origin: string; pathname: string; sessionStatus: "logged_in" | "logged_out" | "unknown" };
}): { json: string; bytes: number } {
  const payload = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    pageType: args.pageType,
    extensionVersion: args.extensionVersion,
    ...(args.page ? { page: args.page } : {}),
    fields: args.fields
  };
  const json = JSON.stringify(payload, null, 2);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_DIAGNOSTIC_EXPORT_BYTES) throw new Error("Diagnostic export exceeds the 64 KB safety limit.");
  return { json, bytes };
}
