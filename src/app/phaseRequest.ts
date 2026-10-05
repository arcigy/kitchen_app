import { recordCommercialTiming, type CommercialTiming } from "../core/commercialDiagnostics";

export const PHASE_READ_TIMEOUT_MS = 15_000;
export const PHASE_WRITE_TIMEOUT_MS = 30_000;

export class PhaseRequestTimeoutError extends Error {
  constructor() {
    super("Server neodpovedal včas. Skúste načítanie zopakovať.");
    this.name = "PhaseRequestTimeoutError";
  }
}

export function isPhaseCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Settles even when an injected operation ignores cancellation or never responds. */
export async function runPhaseRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; stage?: CommercialTiming["stage"] } = {}
): Promise<T> {
  const abort = new AbortController();
  const startedAt = performance.now();
  let outcome: CommercialTiming["outcome"] = "success";
  const cancel = () => abort.abort(new DOMException("Načítanie bolo zrušené.", "AbortError"));
  const timeout = setTimeout(() => abort.abort(new PhaseRequestTimeoutError()), options.timeoutMs ?? PHASE_READ_TIMEOUT_MS);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let rejectOnAbort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(abort.signal.reason);
    abort.signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (abort.signal.aborted) rejectOnAbort();
  });
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      abort.signal.throwIfAborted();
      return operation(abort.signal);
    })]);
  } catch (error) {
    outcome = isPhaseCancellation(error) ? "cancelled" : "error";
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
    abort.signal.removeEventListener("abort", rejectOnAbort);
    if (options.stage) recordCommercialTiming(options.stage, startedAt, outcome);
  }
}

export type PhaseLoadState =
  | { kind: "closed" }
  | { kind: "loading" | "refreshing"; scope: string }
  | { kind: "ready"; scope: string }
  | { kind: "error"; scope: string; message: string };
