import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryReleaseNewsRepository } from "../core/release-news/releaseNewsMemoryRepository";
import { RELEASE_NOTICES } from "../core/release-news/releaseNewsCatalog";
import type { ClientContext } from "../core/client/client-context";
import { handleReleaseNewsApi } from "./releaseNewsEndpoint";

const companyAUser = { clientId: "company-a", userId: "user-1", role: "owner" } as ClientContext;

function request(method: string): http.IncomingMessage {
  return { method, headers: { cookie: "session=test" } } as http.IncomingMessage;
}

describe("release news API", () => {
  it("keeps acknowledgements isolated by company and user and is idempotent under concurrent requests", async () => {
    const repository = createInMemoryReleaseNewsRepository();
    const notice = RELEASE_NOTICES[0];
    const deps = {
      getContext: vi.fn(async () => companyAUser),
      readJsonBody: vi.fn(async () => ({})),
      sendJson: vi.fn(),
      repository,
      now: () => new Date("2026-09-29T10:00:00.000Z")
    };
    const url = new URL(`http://localhost/api/release-news/${notice.id}/acknowledgement`);
    await Promise.all(Array.from({ length: 12 }, () => handleReleaseNewsApi(request("PUT"), {} as http.ServerResponse, url, deps)));
    expect(await repository.listAcknowledged(companyAUser)).toEqual([notice.id]);
    expect(await repository.listAcknowledged({ ...companyAUser, userId: "user-2" })).toEqual([]);
    expect(await repository.listAcknowledged({ ...companyAUser, clientId: "company-b" })).toEqual([]);
  });

  it("rejects unknown notices and returns the current catalogue for the authenticated context", async () => {
    const repository = createInMemoryReleaseNewsRepository();
    const sendJson = vi.fn();
    const deps = {
      getContext: vi.fn(async () => companyAUser),
      readJsonBody: vi.fn(async () => ({})),
      sendJson,
      repository
    };
    await handleReleaseNewsApi(request("PUT"), {} as http.ServerResponse, new URL("http://localhost/api/release-news/unknown/acknowledgement"), deps);
    expect(sendJson).toHaveBeenCalledWith(expect.anything(), 404, { error: "Release notice not found" });
    sendJson.mockClear();
    await handleReleaseNewsApi(request("GET"), {} as http.ServerResponse, new URL("http://localhost/api/release-news"), deps);
    expect(sendJson).toHaveBeenCalledWith(expect.anything(), 200, { notices: RELEASE_NOTICES, acknowledgedNoticeIds: [] });
  });
});
