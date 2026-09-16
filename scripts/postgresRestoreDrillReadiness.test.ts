import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { waitForPostgres } from "./runPostgresRestoreDrill";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("restore drill PostgreSQL readiness", () => {
  it("waits past socket-only initialization until the TCP server is ready", async () => {
    vi.useFakeTimers();
    let tcpReady = false;
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      const hostIndex = args.indexOf("--host");
      const usesTcp = hostIndex >= 0 && args[hostIndex + 1] === "127.0.0.1";
      return { status: usesTcp && !tcpReady ? 1 : 0 } as ReturnType<typeof spawnSync>;
    });
    let ready = false;
    const waiting = waitForPostgres("arcigy-restore-drill-test", "test_db")
      .then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ready).toBe(false);
    tcpReady = true;
    await vi.advanceTimersByTimeAsync(500);
    await waiting;
    expect(ready).toBe(true);
  });

  it("fails within the deadline when PostgreSQL never accepts TCP", async () => {
    vi.useFakeTimers();
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    const failure = expect(waitForPostgres("arcigy-restore-drill-test", "test_db"))
      .rejects.toThrow("did not become ready within 60 seconds");
    await vi.advanceTimersByTimeAsync(60_000);
    await failure;
  });
});
