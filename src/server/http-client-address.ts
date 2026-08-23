import type http from "node:http";

export function resolveTrustedProxyHops(
  explicit: number | undefined,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (Number.isSafeInteger(explicit) && Number(explicit) >= 0 && Number(explicit) <= 8) return Number(explicit);
  const configured = Number(env.ARCIGY_TRUSTED_PROXY_HOPS);
  if (Number.isSafeInteger(configured) && configured >= 0 && configured <= 8) return configured;
  // Production requests cross the loopback nginx sidecar and CapRover's edge
  // proxy. Local/test workers trust no forwarding header by default.
  return env.NODE_ENV === "production" ? 2 : 0;
}

export function clientAddressForRequest(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
  trustedProxyHops: number
): string {
  const remoteAddress = req.socket.remoteAddress || "unknown";
  if (trustedProxyHops === 0) return remoteAddress;
  const forwardedHeader = req.headers["x-forwarded-for"];
  const forwarded = (Array.isArray(forwardedHeader) ? forwardedHeader.join(",") : forwardedHeader)
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean) ?? [];
  // The socket itself is one trusted hop; the remaining trusted hops appear
  // at the right side of X-Forwarded-For. Select the address immediately to
  // their left so attacker-prepended values cannot create new limiter keys.
  const forwardedTrustedHops = trustedProxyHops - 1;
  const clientIndex = forwarded.length - forwardedTrustedHops - 1;
  return clientIndex >= 0 ? forwarded[clientIndex]! : remoteAddress;
}
