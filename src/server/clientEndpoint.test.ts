import { describe, expect, it } from "vitest";
import { handleClientProfileApi } from "./clientEndpoint";

describe("clientEndpoint", () => {
  it("returns the seeded PINO client profile for the current tenant session", async () => {
    let sentStatus = 0;
    let sentBody: unknown = null;
    const handled = await handleClientProfileApi(
      { method: "GET", headers: { cookie: "arcigy_client_session=test" } } as never,
      {} as never,
      new URL("http://127.0.0.1/api/client/profile"),
      {
        getContext: async () => ({ clientId: "client_pino_nobilia_vkh_2026", userId: "user_pino_nobilia_owner", role: "owner" }),
        readJsonBody: async () => ({}),
        sendJson: (_res, status, data) => {
          sentStatus = status;
          sentBody = data;
        }
      }
    );

    expect(handled).toBe(true);
    expect(sentStatus).toBe(200);
    expect((sentBody as { profile?: { clientId?: string } }).profile?.clientId).toBe("client_pino_nobilia_vkh_2026");
  });

  it("lets an owner persist the canonical Czech company language", async () => {
    let sentStatus = 0;
    let sentBody: unknown = null;
    const handled = await handleClientProfileApi(
      { method: "PATCH", headers: {} } as never,
      {} as never,
      new URL("http://127.0.0.1/api/client/profile/language"),
      {
        getContext: async () => ({ clientId: "client-1", userId: "owner-1", role: "owner" }),
        readJsonBody: async () => ({ language: "cz" }),
        updateLanguage: async (clientId, language) => ({ clientId, defaults: { language } } as never),
        sendJson: (_res, status, data) => { sentStatus = status; sentBody = data; }
      }
    );

    expect(handled).toBe(true);
    expect(sentStatus).toBe(200);
    expect((sentBody as { profile?: { defaults?: { language?: string } } }).profile?.defaults?.language).toBe("cs");
  });

  it("refuses language changes from non-admin users", async () => {
    let sentStatus = 0;
    const handled = await handleClientProfileApi(
      { method: "PATCH", headers: {} } as never,
      {} as never,
      new URL("http://127.0.0.1/api/client/profile/language"),
      {
        getContext: async () => ({ clientId: "client-1", userId: "member-1", role: "designer" }),
        readJsonBody: async () => ({ language: "en" }),
        sendJson: (_res, status) => { sentStatus = status; }
      }
    );

    expect(handled).toBe(true);
    expect(sentStatus).toBe(403);
  });
});
