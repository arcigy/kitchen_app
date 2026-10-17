/**
 * Feedback report types. They follow the client success view in Odoo: a wrong price, something that
 * does not work, and a wish. Older clients and drafts may still send the legacy values.
 */
// The first entry is the form default; it matches the former default "bug".
export const FEEDBACK_KINDS = [
  { value: "usability_error", label: "Niečo nefunguje / chyba použiteľnosti" },
  { value: "price_error", label: "Chyba v cene" },
  { value: "wish", label: "Želanie / návrh" },
  { value: "question", label: "Otázka / podpora" },
  { value: "other", label: "Iné" }
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

const LEGACY_FEEDBACK_KIND_MAP: Readonly<Record<string, FeedbackKind>> = {
  bug: "usability_error",
  feature_request: "wish",
  improvement: "wish"
};

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return FEEDBACK_KINDS.some((kind) => kind.value === value);
}

/** Accepts current values and maps legacy ones; returns null for anything else. */
export function normalizeFeedbackKind(value: unknown): FeedbackKind | null {
  if (isFeedbackKind(value)) return value;
  return typeof value === "string" ? LEGACY_FEEDBACK_KIND_MAP[value] ?? null : null;
}
