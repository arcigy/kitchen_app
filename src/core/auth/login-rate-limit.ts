const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type AttemptBucket = {
  failedAttempts: number;
  windowStartedAt: number;
};

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;

export function createLoginRateLimiter(args: {
  maxFailedAttempts?: number;
  windowMs?: number;
  maxBuckets?: number;
  now?: () => number;
} = {}) {
  const maxFailedAttempts = args.maxFailedAttempts ?? MAX_FAILED_ATTEMPTS;
  const windowMs = args.windowMs ?? WINDOW_MS;
  const maxBuckets = args.maxBuckets ?? 10_000;
  const now = args.now ?? (() => Date.now());
  const buckets = new Map<string, AttemptBucket>();
  let overflowBucket: AttemptBucket = { failedAttempts: 0, windowStartedAt: now() };

  const currentBucket = (bucket: AttemptBucket, current: number): AttemptBucket => {
    if (current - bucket.windowStartedAt < windowMs) return bucket;
    bucket.failedAttempts = 0;
    bucket.windowStartedAt = current;
    return bucket;
  };

  const pruneExpired = (current: number): void => {
    for (const [key, bucket] of buckets) {
      if (current - bucket.windowStartedAt >= windowMs) buckets.delete(key);
    }
  };

  const getBucket = (key: string): AttemptBucket => {
    const current = now();
    const existing = buckets.get(key);
    if (existing) return currentBucket(existing, current);
    if (buckets.size >= maxBuckets) pruneExpired(current);
    if (buckets.size >= maxBuckets) return currentBucket(overflowBucket, current);
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
      overflowBucket = { failedAttempts: 0, windowStartedAt: now() };
    },
    size(): number {
      return buckets.size;
    }
  };
}
