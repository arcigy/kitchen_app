export class ExternalResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`External response exceeds ${maxBytes} bytes.`);
    this.name = "ExternalResponseTooLargeError";
  }
}

export type ExternalFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  allowRedirects?: boolean;
  fetchImpl?: typeof fetch;
};

async function readLimitedBody(response: Response, maxBytes: number, controller: AbortController): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    controller.abort();
    throw new ExternalResponseTooLargeError(maxBytes);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw new ExternalResponseTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchExternalBytes(
  input: string | URL,
  init: RequestInit,
  options: ExternalFetchOptions
): Promise<{ response: Response; body: Uint8Array }> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) relayAbort();
  else init.signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("External request timed out.")), options.timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(input, {
      ...init,
      redirect: options.allowRedirects ? (init.redirect ?? "follow") : "error",
      signal: controller.signal
    });
    return { response, body: await readLimitedBody(response, options.maxBytes, controller) };
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", relayAbort);
  }
}

export async function fetchExternalText(
  input: string | URL,
  init: RequestInit,
  options: ExternalFetchOptions
): Promise<{ response: Response; text: string }> {
  const { response, body } = await fetchExternalBytes(input, init, options);
  return { response, text: new TextDecoder().decode(body) };
}
