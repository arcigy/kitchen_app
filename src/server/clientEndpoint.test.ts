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
});
