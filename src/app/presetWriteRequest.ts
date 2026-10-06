/** Keep the exact operation on an uncertain retry, and share double-clicks. */
export function createPresetWriteRequest() {
  const requests = new Map<string, { body: string; pending?: Promise<Response> }>();
  const keyFor = (url: string, method: string, payload: Record<string, unknown>) => {
    const { expectedPackageHash: _revision, ...intent } = payload;
    return `${method}:${url}:${JSON.stringify(intent)}`;
  };
  const send = (url: string, method: "POST" | "PATCH", payload: Record<string, unknown>): Promise<Response> => {
    const key = keyFor(url, method, payload);
    let request = requests.get(key);
    if (request?.pending) return request.pending.then(response => response.clone());
    if (!request) {
      if (requests.size >= 32) throw new Error("Príliš veľa neoverených zápisov presetov. Obnovte katalóg a overte uložené hodnoty.");
      request = { body: JSON.stringify({ ...payload, operationId: crypto.randomUUID() }) };
      requests.set(key, request);
    }
    const retained = request;
    const pending = fetch(url, { method, headers: { "Content-Type": "application/json" }, body: retained.body, signal: AbortSignal.timeout(30_000) })
      .then(response => {
        // A revision conflict confirms this operation did not commit. Once the
        // user loads current data, their explicit retry may use that revision.
        if (response.status === 409) requests.delete(key);
        return response;
      })
      .finally(() => { retained.pending = undefined; });
    retained.pending = pending;
    return pending.then(response => response.clone());
  };
  return { send, confirm: (url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) => requests.delete(keyFor(url, method, payload)) };
}
