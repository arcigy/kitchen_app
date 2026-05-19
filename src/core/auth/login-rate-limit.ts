const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type AttemptBucket = {
  failedAttempts: number;
  windowStartedAt: number;
};

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;

export function createLoginRateLimiter(args: { maxFailedAttempts?: number; windowMs?: number; now?: () => number } = {}) {
  const maxFailedAttempts = args.maxFailedAttempts ?? MAX_FAILED_ATTEMPTS;
  const windowMs = args.windowMs ?? WINDOW_MS;
  const now = args.now ?? (() => Date.now());
  const buckets = new Map<string, AttemptBucket>();

  const getBucket = (key: string): AttemptBucket => {
    const current = now();
    const existing = buckets.get(key);
    if (existing && current - existing.windowStartedAt < windowMs) return existing;
    const fresh = { failedAttempts: 0, windowStartedAt: current };
    buckets.set(key, fresh);
    return fresh;
  };

  return {
    isLimited(key: string): boolean {
      return getBucket(key).failedAttempts >= maxFailedAttempts;
    },
    recordFailure(key: string): void {
      getBucket(key).failedAttempts += 1;
    },
    reset(key: string): void {
      buckets.delete(key);
    },
    clear(): void {
      buckets.clear();
    }
  };
}
