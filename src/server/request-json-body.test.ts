import { Readable } from "node:stream";
import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { getJsonBodyLimitBytes, readJsonRequestBody, RequestBodyTooLargeError } from "./request-json-body";

function request(body: string, args: { url?: string; contentLength?: number } = {}): http.IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]);
  Object.assign(stream, {
    headers: args.contentLength === undefined ? {} : { "content-length": String(args.contentLength) },
    url: args.url ?? "/api/auth/login"
  });
  return stream as http.IncomingMessage;
}

describe("JSON request body limits", () => {
  afterEach(() => {
    delete process.env.HTTP_JSON_BODY_MAX_MB;
    delete process.env.HTTP_PROJECT_IMPORT_BODY_MAX_MB;
    delete process.env.PROJECT_FILE_MAX_TOTAL_ASSET_MB;
  });

  it("parses a body below the configured general limit", async () => {
    process.env.HTTP_JSON_BODY_MAX_MB = "1";
    await expect(readJsonRequestBody(request(JSON.stringify({ ok: true })))).resolves.toEqual({ ok: true });
  });

  it("rejects declared and streamed bodies above the general limit", async () => {
    process.env.HTTP_JSON_BODY_MAX_MB = "0.0001";
    await expect(readJsonRequestBody(request("{}", { contentLength: 1_000 })))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
    await expect(readJsonRequestBody(request(JSON.stringify({ value: "x".repeat(1_000) }))))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("keeps project imports large enough for the configured base64 asset bundle", () => {
    process.env.PROJECT_FILE_MAX_TOTAL_ASSET_MB = "150";
    process.env.HTTP_JSON_BODY_MAX_MB = "1";
    const importLimit = getJsonBodyLimitBytes({ url: "/api/projects/import" });
    const regularLimit = getJsonBodyLimitBytes({ url: "/api/projects/project-1/save" });
    expect(importLimit).toBeGreaterThanOrEqual(216 * 1024 * 1024);
    expect(regularLimit).toBe(1024 * 1024);
  });

  it("keeps browser telemetry bodies narrowly bounded", () => {
    process.env.HTTP_JSON_BODY_MAX_MB = "64";
    expect(getJsonBodyLimitBytes({ url: "/api/client-metrics?ignored=1" })).toBe(8 * 1024);
  });
});
