import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCurrentClientProfileForApp } from "./clientProfileLoader";
import { seedClientProfile, seedPinoNobiliaClientProfile } from "../core/client/client-repository";

function createStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    }
  };
}

describe("clientProfileLoader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("window", {
      localStorage: createStorage()
    });
  });

  it("loads the current client profile from the server session endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, profile: seedPinoNobiliaClientProfile }), { status: 200 })
    ));

    const profile = await loadCurrentClientProfileForApp("client_pino_nobilia_vkh_2026");

    expect(profile.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(profile.company.name).toBe("PINO/Nobilia VKH 2026");
  });

  it("falls back to the local seeded profile when the server endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    const profile = await loadCurrentClientProfileForApp(seedClientProfile.clientId);

    expect(profile.clientId).toBe(seedClientProfile.clientId);
    expect(profile.organization.users.some((user) => user.id === "user_arcigy_owner")).toBe(true);
  });
});
