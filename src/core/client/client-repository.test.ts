import { describe, expect, it } from "vitest";
import { createLocalClientRepository } from "./client-repository";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    }
  };
}

describe("createLocalClientRepository", () => {
  it("returns the seeded PINO/Nobilia client profile for the Postgres tenant client id", () => {
    const repository = createLocalClientRepository(createMemoryStorage());
    const profile = repository.getByClientId("client_pino_nobilia_vkh_2026");

    expect(profile?.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(profile?.company.name).toBe("PINO/Nobilia VKH 2026");
    expect(profile?.organization.users[0]?.id).toBe("user_pino_nobilia_owner");
    expect(profile?.organization.users[0]?.photoUrl).toBe("/organization/pino-nobilia.png");
  });
});
