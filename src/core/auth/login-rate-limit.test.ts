import { describe, expect, it } from "vitest";
import { createLoginRateLimiter } from "./login-rate-limit";

describe("login rate-limit storage", () => {
  it("bounds attacker-controlled username and address keys", () => {
    const limiter = createLoginRateLimiter({ maxBuckets: 2, maxFailedAttempts: 2 });
    limiter.recordFailure("ip-a:user-a");
    limiter.recordFailure("ip-b:user-b");
    limiter.recordFailure("ip-c:user-c");
    limiter.recordFailure("ip-d:user-d");

    expect(limiter.size()).toBe(2);
    expect(limiter.isLimited("ip-e:user-e")).toBe(true);
  });

  it("reclaims expired buckets and resets the overflow window", () => {
    let current = 0;
    const limiter = createLoginRateLimiter({ maxBuckets: 1, maxFailedAttempts: 1, windowMs: 100, now: () => current });
    limiter.recordFailure("first");
    limiter.recordFailure("overflow");
    expect(limiter.isLimited("another-overflow")).toBe(true);

    current = 101;
    expect(limiter.isLimited("fresh")).toBe(false);
    expect(limiter.size()).toBe(1);
  });
});
