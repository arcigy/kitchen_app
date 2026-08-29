import { describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../core/client/client-context";
import { handleClientAppDataRevisionApi } from "./clientAppDataRevisionEndpoint";

const context: ClientContext = {
  clientId: "client_revision_test",
  userId: "user_revision_test",
  role: "owner"
};

describe("client app data revision endpoint", () => {
  it("ignores unrelated routes without authenticating", async () => {
    const getContext = vi.fn();
    const handled = await handleClientAppDataRevisionApi(
      { method: "POST", headers: {} } as never,
      {} as never,
      new URL("http://localhost/api/app-data/revision"),
      { projectRoot: process.cwd(), getContext, sendJson: vi.fn() }
    );

    expect(handled).toBe(false);
    expect(getContext).not.toHaveBeenCalled();
  });

  it("derives the tenant only from the authenticated context", async () => {
    const sendJson = vi.fn();
    const getContext = vi.fn(async () => context);
    const response = {} as never;
    const handled = await handleClientAppDataRevisionApi(
      { method: "GET", headers: { cookie: "session=test" } } as never,
      response,
      new URL("http://localhost/api/app-data/revision?clientId=foreign"),
      { projectRoot: process.cwd(), getContext, sendJson }
    );

    expect(handled).toBe(true);
    expect(getContext).toHaveBeenCalledWith("session=test");
    expect(sendJson).toHaveBeenCalledWith(
      response,
      200,
      expect.objectContaining({
        ok: true,
        revision: expect.objectContaining({
          clientId: context.clientId,
          catalog: null,
          modules: expect.objectContaining({ count: 0, storageRevision: expect.any(String) })
        })
      })
    );
  });
});
