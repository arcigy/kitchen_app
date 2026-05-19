import type { AppSession, ClientRole } from "./client-types";

export type ClientContext = {
  userId: string;
  clientId: string;
  role: ClientRole;
};

export function createClientContext(session: AppSession): ClientContext {
  return {
    userId: session.userId,
    clientId: session.clientId,
    role: session.role
  };
}

export function assertCanAccessClient(context: ClientContext, clientId: string): void {
  if (context.clientId !== clientId) {
    throw new Error("Current session cannot access the requested client.");
  }
}

export function canEditClientProfile(context: ClientContext): boolean {
  return context.role === "owner" || context.role === "admin";
}
