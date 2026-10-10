export type NormalizedFeedbackText = {
  title: string;
  description: string;
  comment: string;
};

const hasMeaningfulContent = (value: string) => /[\p{L}\p{N}]/u.test(value);

export function normalizeFeedbackText(titleValue: unknown = "", descriptionValue: unknown = "", commentValue: unknown = ""): NormalizedFeedbackText | null {
  if (typeof titleValue !== "string" || typeof descriptionValue !== "string" || typeof commentValue !== "string") return null;
  const title = titleValue.trim();
  const description = descriptionValue.trim();
  const comment = commentValue.trim();
  if (title.length > 180 || description.length > 8_000 || comment.length > 4_000) return null;
  if (!hasMeaningfulContent(title) && !hasMeaningfulContent(description)) return null;
  return {
    title: title || description.slice(0, 180),
    description,
    comment
  };
}
