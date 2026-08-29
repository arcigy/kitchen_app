import type { AssistantChatMessage } from "../../assistant/types";

export type AssistantChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantChatMessage[];
};

const MAX_THREADS = 24;
const MAX_MESSAGES_PER_THREAD = 120;

function safeText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f]/gu, " ").trim().slice(0, maxLength);
}

function titleFromMessage(message: string): string {
  const value = safeText(message, 56);
  return value || "Nový chat";
}

export function assistantChatStorageKey(projectId: string | null, phaseId: string | null): string {
  return `arcigy.assistant.threads.v1:${projectId ?? "workspace"}:${phaseId ?? "default"}`;
}

export class AssistantChatThreadStore {
  private readonly storageKey: string;
  private threads: AssistantChatThread[];

  constructor(projectId: string | null, phaseId: string | null, private readonly storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage) {
    this.storageKey = assistantChatStorageKey(projectId, phaseId);
    this.threads = this.read();
  }

  list(): AssistantChatThread[] {
    return this.threads.map((thread) => ({ ...thread, messages: [...thread.messages] }));
  }

  get(threadId: string): AssistantChatThread | null {
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    return thread ? { ...thread, messages: [...thread.messages] } : null;
  }

  create(initialMessage = ""): AssistantChatThread {
    const now = new Date().toISOString();
    const thread: AssistantChatThread = {
      id: `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: titleFromMessage(initialMessage),
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    this.threads = [thread, ...this.threads].slice(0, MAX_THREADS);
    this.write();
    return { ...thread, messages: [] };
  }

  append(threadId: string, message: AssistantChatMessage): AssistantChatThread | null {
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return null;
    const content = safeText(message.content, 12_000);
    if (!content) return { ...thread, messages: [...thread.messages] };
    thread.messages = [...thread.messages, { role: message.role, content }].slice(-MAX_MESSAGES_PER_THREAD);
    if (message.role === "user" && thread.messages.filter((item) => item.role === "user").length === 1) thread.title = titleFromMessage(content);
    thread.updatedAt = new Date().toISOString();
    this.threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.write();
    return { ...thread, messages: [...thread.messages] };
  }

  private read(): AssistantChatThread[] {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_THREADS).flatMap((candidate): AssistantChatThread[] => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const record = candidate as Record<string, unknown>;
        if (typeof record.id !== "string" || typeof record.title !== "string" || !Array.isArray(record.messages)) return [];
        const messages = record.messages.flatMap((item): AssistantChatMessage[] => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const message = item as Record<string, unknown>;
          const role = message.role;
          const content = typeof message.content === "string" ? safeText(message.content, 12_000) : "";
          return (role === "user" || role === "assistant" || role === "tool") && content ? [{ role, content }] : [];
        }).slice(-MAX_MESSAGES_PER_THREAD);
        return [{
          id: safeText(record.id, 100),
          title: safeText(record.title, 56) || "Nový chat",
          createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
          messages
        }];
      });
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.threads));
    } catch {
      // Chat history is a convenience only; quota/privacy mode must not block the assistant.
    }
  }
}
