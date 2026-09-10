import { describe, expect, it, vi } from "vitest";
import type { UserActivityOutboxPayload } from "../src/core/user-activity/user-activity-types";
import {
  buildOdooActivityBatch,
  runUserActivityOdooSync,
  userActivityOdooSyncConfigFromEnv
} from "./userActivityOdooSync";

const presence: UserActivityOutboxPayload = {
  kind: "presence",
  external_key: "presence:client-1:user-1",
  client_external_id: "client-1",
  user_external_id: "user-1",
  state: "active",
  last_seen_at: "2026-09-02T08:00:00.000Z",
  source_updated_at: "2026-09-02T08:00:00.000Z"
};

const env = {
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  DATABASE_SCHEMA: "test",
  ARCIGY_USER_ACTIVITY_ODOO_SYNC_ENABLED: "true",
  ARCIGY_USER_ACTIVITY_ODOO_ENVIRONMENT: "develop",
  ARCIGY_ODOO_URL: "https://odoo.example.com",
  ARCIGY_ODOO_API_KEY: "test-key"
};

describe("user activity Odoo sync", () => {
  it("is fail-closed and rejects insecure Odoo URLs", () => {
    expect(() => userActivityOdooSyncConfigFromEnv({ ...env, ARCIGY_USER_ACTIVITY_ODOO_SYNC_ENABLED: "false" }))
      .toThrow(/SYNC_ENABLED=true/);
    expect(() => userActivityOdooSyncConfigFromEnv({ ...env, ARCIGY_ODOO_URL: "http://odoo.example.com" }))
      .toThrow(/must use HTTPS/);
    expect(() => userActivityOdooSyncConfigFromEnv({
      ...env,
      NODE_ENV: "production",
      APP_ENV: "prod",
      DATABASE_SCHEMA: "prod",
      ARCIGY_USER_ACTIVITY_ODOO_ENVIRONMENT: "develop"
    })).toThrow(/production database can sync only to the main/);
  });

  it("accepts only bounded privacy-safe outbox payloads", () => {
    expect(buildOdooActivityBatch([presence], "2026-09-02T08:00:01.000Z", "develop"))
      .toEqual({
        payload: {
          environment: "develop",
          source_updated_at: "2026-09-02T08:00:01.000Z",
          items: [{ ...presence, environment: "develop", external_key: "develop:presence:client-1:user-1" }]
        }
      });
    expect(() => buildOdooActivityBatch([{ ...presence, typed_text: "secret" }], "2026-09-02T08:00:01.000Z", "develop"))
      .toThrow(/Unexpected activity outbox fields/);
    expect(() => buildOdooActivityBatch([presence, presence], "2026-09-02T08:00:01.000Z", "develop"))
      .toThrow(/duplicate external keys/);
  });

  it("reconciles offline users and acknowledges an idempotent leased batch", async () => {
    const reconcile = vi.fn(async () => 2);
    const lease = vi.fn()
      .mockResolvedValueOnce({ token: "lease-1", items: [presence], attempts: 1 })
      .mockResolvedValueOnce(null);
    const send = vi.fn(async () => undefined);
    const markSent = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const result = await runUserActivityOdooSync(env, {
      reconcile,
      lease,
      send,
      markSent,
      markFailed,
      now: () => new Date("2026-09-02T08:00:01.000Z")
    });

    expect(result).toEqual({ ok: true, reconciled: 2, batches: 1, sent: 1 });
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      {
        payload: {
          environment: "develop",
          source_updated_at: "2026-09-02T08:00:01.000Z",
          items: [{ ...presence, environment: "develop", external_key: "develop:presence:client-1:user-1" }]
        }
      }
    );
    expect(markSent).toHaveBeenCalledOnce();
    expect(markFailed).not.toHaveBeenCalled();
  });
});
