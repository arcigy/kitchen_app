import { describe, expect, it } from "vitest";
import { createInMemoryUserActivityRepository } from "./user-activity-repository";
import type { UserActivityPulse } from "./user-activity-types";

const context = { clientId: "client-1", userId: "user-1", role: "designer" } as const;
const options = { offlineThresholdMs: 90_000, maxCreditableGapMs: 45_000 };

function pulse(trackerId: string, sequence: number, state: UserActivityPulse["state"], localDate = "2026-09-02"): UserActivityPulse {
  return { trackerId, sequence, state, localDate, timeZone: "Europe/Bratislava" };
}

describe("user activity repository", () => {
  it("accounts active time once across multiple browser tabs", async () => {
    const repository = createInMemoryUserActivityRepository();
    const tabA = "11111111-1111-4111-8111-111111111111";
    const tabB = "22222222-2222-4222-8222-222222222222";

    await repository.recordPulse(context, pulse(tabA, 1, "active"), new Date("2026-09-02T08:00:00Z"), options);
    await repository.recordPulse(context, pulse(tabA, 2, "active"), new Date("2026-09-02T08:00:30Z"), options);
    await repository.recordPulse(context, pulse(tabB, 1, "active"), new Date("2026-09-02T08:00:30Z"), options);
    await repository.recordPulse(context, pulse(tabA, 3, "active"), new Date("2026-09-02T08:01:00Z"), options);
    await repository.recordPulse(context, pulse(tabB, 2, "active"), new Date("2026-09-02T08:01:00Z"), options);

    const snapshot = repository.snapshot();
    expect(snapshot.daily).toEqual([
      expect.objectContaining({ activeMilliseconds: 60_000, sessionCount: 1 })
    ]);
    expect(snapshot.intervals).toHaveLength(1);
    expect(snapshot.intervals[0]?.activeMilliseconds).toBe(60_000);
  });

  it("ignores replayed sequences and caps a long missing heartbeat", async () => {
    const repository = createInMemoryUserActivityRepository();
    const trackerId = "11111111-1111-4111-8111-111111111111";

    await repository.recordPulse(context, pulse(trackerId, 1, "active"), new Date("2026-09-02T08:00:00Z"), options);
    const accepted = await repository.recordPulse(context, pulse(trackerId, 2, "active"), new Date("2026-09-02T08:02:00Z"), options);
    const replay = await repository.recordPulse(context, pulse(trackerId, 2, "active"), new Date("2026-09-02T08:03:00Z"), options);

    expect(accepted.activeSecondsToday).toBe(45);
    expect(replay.accepted).toBe(false);
    expect(repository.snapshot().daily[0]?.activeMilliseconds).toBe(45_000);
  });

  it("splits active intervals at the user's local day boundary", async () => {
    const repository = createInMemoryUserActivityRepository();
    const trackerId = "11111111-1111-4111-8111-111111111111";

    await repository.recordPulse(context, pulse(trackerId, 1, "active", "2026-09-02"), new Date("2026-09-02T21:59:45Z"), options);
    await repository.recordPulse(context, pulse(trackerId, 2, "active", "2026-09-03"), new Date("2026-09-02T22:00:15Z"), options);

    const snapshot = repository.snapshot();
    expect(snapshot.intervals.map((interval) => interval.localDate)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(snapshot.daily.find((day) => day.localDate === "2026-09-02")?.activeMilliseconds).toBe(30_000);
    expect(snapshot.daily.find((day) => day.localDate === "2026-09-03")?.sessionCount).toBe(1);
  });

  it("closes crashed browser activity after its lease and applies the final credit cap", async () => {
    const repository = createInMemoryUserActivityRepository();
    const trackerId = "11111111-1111-4111-8111-111111111111";
    await repository.recordPulse(context, pulse(trackerId, 1, "active"), new Date("2026-09-02T08:00:00Z"), options);

    expect(await repository.reconcileExpired(new Date("2026-09-02T08:01:00Z"), options)).toBe(0);
    expect(await repository.reconcileExpired(new Date("2026-09-02T08:02:00Z"), options)).toBe(1);

    const snapshot = repository.snapshot();
    expect(snapshot.presence[0]?.state).toBe("offline");
    expect(snapshot.daily[0]?.activeMilliseconds).toBe(45_000);
    expect(snapshot.intervals[0]).toMatchObject({ activeMilliseconds: 45_000, endedAt: "2026-09-02T08:00:45.000Z" });
  });
});
