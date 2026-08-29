export type WardrobeDimensionEdit =
  | { kind: "verticalGap"; aPartId: string; bPartId: string }
  | { kind: "horizontalGap"; aPartId: string; bPartId: string }
  | { kind: "partDepth"; partId: string };

export function parseWardrobeDimensionEdit(value: unknown): WardrobeDimensionEdit | null {
  if (!value || typeof value !== "object") return null;
  const edit = value as Partial<WardrobeDimensionEdit>;
  if (edit.kind === "verticalGap" && "aPartId" in edit && "bPartId" in edit) return edit as WardrobeDimensionEdit;
  if (edit.kind === "horizontalGap" && "aPartId" in edit && "bPartId" in edit) return edit as WardrobeDimensionEdit;
  if (edit.kind === "partDepth" && "partId" in edit) return edit as WardrobeDimensionEdit;
  return null;
}
