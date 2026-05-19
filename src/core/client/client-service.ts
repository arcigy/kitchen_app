import { assertCanAccessClient, canEditClientProfile, type ClientContext } from "./client-context";
import type { ClientProfile, ClientProfileInput } from "./client-types";
import type { ClientRepository } from "./client-repository";

export type ClientService = {
  getCurrentClientProfile: () => ClientProfile;
  saveCurrentClientProfile: (input: ClientProfileInput) => ClientProfile;
};

export function createClientService(args: {
  context: ClientContext;
  repository: ClientRepository;
}): ClientService {
  const { context, repository } = args;

  return {
    getCurrentClientProfile() {
      const profile = repository.getByClientId(context.clientId);
      if (!profile) throw new Error("Client profile was not found.");
      assertCanAccessClient(context, profile.clientId);
      return profile;
    },
    saveCurrentClientProfile(input) {
      if (!canEditClientProfile(context)) {
        throw new Error("Current session cannot edit the client profile.");
      }

      const existing = repository.getByClientId(context.clientId);
      const now = new Date().toISOString();
      return repository.save({
        ...input,
        clientId: context.clientId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }
  };
}
