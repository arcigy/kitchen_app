import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";

/** Readers see either the previous complete file or the new complete file. */
export async function writeModulePackageFile(filePath: string, contents: string | Uint8Array): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(contents); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, filePath);
    const directory = await open(path.dirname(filePath), "r");
    try { await directory.sync(); }
    finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}
