const TRANSIENT_POSTGRES_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300",
  "57P01",
  "57P02",
  "57P03"
]);

const TRANSIENT_SYSTEM_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT"
]);

const TRANSIENT_MESSAGE_PARTS = [
  "connection terminated",
  "connection timeout",
  "connection timed out",
  "connection refused",
  "connection reset",
  "database system is starting up",
  "pool is draining",
  "remaining connection slots are reserved",
  "timeout exceeded when trying to connect"
];

type ErrorWithCause = Error & { cause?: unknown; code?: unknown };

function errorChain(error: unknown): ErrorWithCause[] {
  const chain: ErrorWithCause[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    chain.push(current as ErrorWithCause);
    current = (current as ErrorWithCause).cause;
  }
  return chain;
}

export function isTransientPostgresError(error: unknown): boolean {
  return errorChain(error).some((item) => {
    const code = typeof item.code === "string" ? item.code.toUpperCase() : "";
    if (TRANSIENT_POSTGRES_CODES.has(code) || TRANSIENT_SYSTEM_CODES.has(code)) return true;
    const message = item.message.toLowerCase();
    return TRANSIENT_MESSAGE_PARTS.some((part) => message.includes(part));
  });
}
