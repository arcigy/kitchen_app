import { BRIDGE_CHANNEL } from "./messages";

export const PROJECT_MATERIALS_UPDATED_EVENT = "arcigy:supplier-bridge-project-materials-updated";

export type ProjectMaterialsUpdatedNotice = {
  channel: typeof BRIDGE_CHANNEL;
  type: "PROJECT_MATERIALS_UPDATED";
  projectId: string;
};

export function isProjectMaterialsUpdatedNotice(value: unknown): value is ProjectMaterialsUpdatedNotice {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return input.channel === BRIDGE_CHANNEL && input.type === "PROJECT_MATERIALS_UPDATED" &&
    typeof input.projectId === "string" && input.projectId.length > 0 && input.projectId.length <= 200;
}

/** Best-effort notification only; the persisted server assignment remains authoritative. */
export async function notifyOpenArcigyProjectMaterials(projectBaseUrl: string, projectId: string): Promise<void> {
  const origin = new URL(projectBaseUrl).origin;
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  const notice: ProjectMaterialsUpdatedNotice = { channel: BRIDGE_CHANNEL, type: "PROJECT_MATERIALS_UPDATED", projectId };
  await Promise.all(tabs.flatMap((tab) => typeof tab.id === "number"
    ? [chrome.tabs.sendMessage(tab.id, notice).catch(() => undefined)]
    : []));
}
