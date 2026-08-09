import type http from "node:http";
import { parseClientSessionCookie } from "../core/client/session-cookie";

export type HttpRequestBudgetPolicy = {
  operation: string;
  method: string;
  pathname: RegExp;
  maxRequests: number;
  windowMs: number;
  maxConcurrent: number;
};

type RequestBucket = {
  windowStartedAt: number;
  requestCount: number;
  inFlight: number;
  lastSeenAt: number;
};

export type HttpRequestBudgetDecision =
  | { allowed: true; operation?: string; registerRelease: (res: http.ServerResponse) => void }
  | { allowed: false; operation: string; retryAfterSeconds: number };

const MINUTE_MS = 60_000;

export const DEFAULT_HTTP_REQUEST_BUDGET_POLICIES: readonly HttpRequestBudgetPolicy[] = [
  { operation: "catalog", method: "GET", pathname: /^\/api\/catalog(?:\/bootstrap)?$/, maxRequests: 120, windowMs: MINUTE_MS, maxConcurrent: 8 },
  { operation: "project-import", method: "POST", pathname: /^\/api\/projects\/import$/, maxRequests: 30, windowMs: MINUTE_MS, maxConcurrent: 4 },
  { operation: "project-save", method: "POST", pathname: /^\/api\/projects\/[^/]+\/save$/, maxRequests: 600, windowMs: MINUTE_MS, maxConcurrent: 16 },
  { operation: "assistant", method: "POST", pathname: /^\/api\/assistant\/(turn|continue|rag\/reindex)$/, maxRequests: 120, windowMs: MINUTE_MS, maxConcurrent: 8 },
  { operation: "blender-export", method: "POST", pathname: /^\/api\/blender\/export$/, maxRequests: 30, windowMs: MINUTE_MS, maxConcurrent: 2 },
  { operation: "feedback-report", method: "POST", pathname: /^\/api\/feedback-reports$/, maxRequests: 10, windowMs: 60 * MINUTE_MS, maxConcurrent: 2 },
  { operation: "demos-external", method: "GET", pathname: /^\/api\/demos\/(material-lookup|material-image)$/, maxRequests: 300, windowMs: MINUTE_MS, maxConcurrent: 16 }
];

function requestScope(req: http.IncomingMessage): string {
  const session = parseClientSessionCookie(req.headers.cookie);
  if (session) return `tenant:${session.clientId}`;
  return `ip:${req.socket?.remoteAddress || "unknown"}`;
}

function policyFor(
  method: string | undefined,
  pathname: string,
  policies: readonly HttpRequestBudgetPolicy[]
): HttpRequestBudgetPolicy | undefined {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  return policies.find((policy) => policy.method === normalizedMethod && policy.pathname.test(pathname));
}

export function createHttpRequestBudget(options: {
  policies?: readonly HttpRequestBudgetPolicy[];
  maxBuckets?: number;
  now?: () => number;
} = {}) {
  const policies = options.policies ?? DEFAULT_HTTP_REQUEST_BUDGET_POLICIES;
  const maxBuckets = options.maxBuckets ?? 10_000;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, RequestBucket>();

  const evictExpiredOrOldestInactive = (current: number): void => {
    let oldestKey: string | undefined;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.inFlight > 0) continue;
      if (current - bucket.lastSeenAt >= MINUTE_MS) {
        buckets.delete(key);
        continue;
      }
      if (bucket.lastSeenAt < oldestSeen) {
        oldestKey = key;
        oldestSeen = bucket.lastSeenAt;
      }
    }
    if (buckets.size >= maxBuckets && oldestKey) buckets.delete(oldestKey);
  };

  const acquire = (req: http.IncomingMessage, url: URL): HttpRequestBudgetDecision => {
    const policy = policyFor(req.method, url.pathname, policies);
    if (!policy) return { allowed: true, registerRelease: () => undefined };

    const current = now();
    const bucketKey = `${policy.operation}\u0000${requestScope(req)}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket && buckets.size >= maxBuckets) evictExpiredOrOldestInactive(current);
    if (!bucket && buckets.size >= maxBuckets) {
      return { allowed: false, operation: policy.operation, retryAfterSeconds: 1 };
    }
    if (!bucket) {
      bucket = { windowStartedAt: current, requestCount: 0, inFlight: 0, lastSeenAt: current };
      buckets.set(bucketKey, bucket);
    }
    if (current - bucket.windowStartedAt >= policy.windowMs) {
      bucket.windowStartedAt = current;
      bucket.requestCount = 0;
    }
    bucket.lastSeenAt = current;

    if (bucket.inFlight >= policy.maxConcurrent) {
      return { allowed: false, operation: policy.operation, retryAfterSeconds: 1 };
    }
    if (bucket.requestCount >= policy.maxRequests) {
      const remainingMs = Math.max(1, policy.windowMs - (current - bucket.windowStartedAt));
      return { allowed: false, operation: policy.operation, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)) };
    }

    bucket.requestCount += 1;
    bucket.inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      bucket!.inFlight = Math.max(0, bucket!.inFlight - 1);
      bucket!.lastSeenAt = now();
    };
    return {
      allowed: true,
      operation: policy.operation,
      registerRelease(res) {
        res.once("finish", release);
        res.once("close", release);
      }
    };
  };

  return {
    acquire,
    size: () => buckets.size,
    clear: () => buckets.clear()
  };
}

export type HttpRequestBudget = ReturnType<typeof createHttpRequestBudget>;
