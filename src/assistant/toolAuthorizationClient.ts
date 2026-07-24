import type { AssistantToolCall } from "./types";

export async function authorizeAssistantToolCall(call: AssistantToolCall): Promise<void> {
  const response = await fetch("/api/assistant/tool-authorization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ toolId: call.toolId, input: call.input })
  });
  const payload = await response.json().catch(() => null) as { authorized?: boolean; error?: string } | null;
  if (!response.ok || payload?.authorized !== true) {
    throw new Error(payload?.error || `Assistant tool authorization failed with HTTP ${response.status}.`);
  }
}
