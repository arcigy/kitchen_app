import { open, unlink } from "node:fs/promises";

export class ModulePackageRevisionConflictError extends Error {
  constructor() { super("Preset medzitým zmenil iný používateľ. Načítajte aktuálnu hodnotu a skúste znovu."); }
}

/** The file repository is used by local installations; lock across processes, not just requests. */
export async function withModulePackageWriteLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const lockPath = `${directory}.write-lock`;
  for (let attempt = 0; attempt < 100; attempt++) {
    let handle;
    try { handle = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }
    try { return await action(); }
    finally { await handle.close(); await unlink(lockPath); }
  }
  throw new Error("Ukladanie presetu práve prebieha. Skúste ho zopakovať.");
}
