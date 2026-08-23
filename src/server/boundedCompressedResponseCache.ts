export class BoundedCompressedResponseCache<Key> {
  private readonly entries = new Map<string, { body: Buffer; bytes: number }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private totalBytes = 0;

  constructor(
    private readonly serializeKey: (key: Key) => string,
    private readonly maxEntries: number,
    private readonly maxCompressedBytes: number
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("Compressed response cache maxEntries must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(maxCompressedBytes) || maxCompressedBytes < 1) {
      throw new Error("Compressed response cache maxCompressedBytes must be a positive safe integer.");
    }
  }

  get(key: Key): Buffer | null {
    const serializedKey = this.serializeKey(key);
    const cached = this.entries.get(serializedKey);
    if (!cached) return null;

    this.entries.delete(serializedKey);
    this.entries.set(serializedKey, cached);
    return cached.body;
  }

  set(key: Key, body: Buffer): void {
    const serializedKey = this.serializeKey(key);
    const existing = this.entries.get(serializedKey);
    if (existing) {
      this.entries.delete(serializedKey);
      this.totalBytes -= existing.bytes;
    }

    if (body.byteLength > this.maxCompressedBytes) return;
    const cached = { body, bytes: body.byteLength };
    this.entries.set(serializedKey, cached);
    this.totalBytes += cached.bytes;

    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxCompressedBytes) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.totalBytes -= oldest?.bytes ?? 0;
    }
  }

  coalesce<T>(key: string, create: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = create().finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
    this.totalBytes = 0;
  }
}
