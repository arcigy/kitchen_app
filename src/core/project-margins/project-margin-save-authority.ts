import { isDeepStrictEqual } from "node:util";
import { ProjectMarginAuthorityError } from "./project-margin-errors";
import { isProjectMarginSettingsState } from "./project-margin-types";

export type ProjectSnapshotMarginSettingsMode = "preserve" | "initialize" | "restore-version";

export function assertFullSaveProjectMarginSettingsAllowed(
  storedQuoteSettings: unknown,
  incomingQuoteSettings: unknown,
  mode: ProjectSnapshotMarginSettingsMode = "preserve"
): void {
  if (mode === "restore-version") return;

  const stored = isProjectMarginSettingsState(storedQuoteSettings) ? storedQuoteSettings : null;
  const incoming = isProjectMarginSettingsState(incomingQuoteSettings) ? incomingQuoteSettings : null;

  if (!stored) {
    if (!incoming) return;
    if (mode === "initialize" && incoming.revision === 0) return;
    throw new ProjectMarginAuthorityError(incoming.revision, 0);
  }

  if (!incoming) {
    throw new ProjectMarginAuthorityError(stored.revision, stored.revision);
  }
  if (incoming.revision === stored.revision && isDeepStrictEqual(incoming, stored)) return;
  throw new ProjectMarginAuthorityError(incoming.revision, stored.revision);
}
