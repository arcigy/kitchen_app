import type { ClientEvent } from "./client-event-types";

export interface ClientEventRepository {
  /** Stores the event once; a repeated event ID or idempotency key is ignored. */
  record(event: ClientEvent): Promise<{ recorded: boolean }>;
}

export function createInMemoryClientEventRepository(): ClientEventRepository & { list(): ClientEvent[] } {
  const events: ClientEvent[] = [];
  return {
    async record(event) {
      const duplicate = events.some((existing) =>
        existing.clientId === event.clientId && (
          (existing.projectId === event.projectId && existing.eventId === event.eventId)
          || (event.idempotencyKey !== null && existing.idempotencyKey === event.idempotencyKey)
        ));
      if (duplicate) return { recorded: false };
      events.push(structuredClone(event));
      return { recorded: true };
    },
    list: () => events.map((event) => structuredClone(event))
  };
}
