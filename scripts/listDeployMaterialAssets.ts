import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PBR_MATERIAL_IDS, PBR_TEXTURE_FILES } from "../src/materials/pbrMaterialManifest";

const MATERIAL_PROOF_SOURCE_FILES = [
  "src/app/materialPbrOptions.ts",
  "server/workerServer.ts"
] as const;

const MATERIAL_PROOF_BASECOLOR_PATTERN = /assets\/materials\/[^"'`]+?\/maps\/basecolor\.jpg/g;

export async function listDeployMaterialAssets(projectRoot: string): Promise<string[]> {
  const materialProofSources = await Promise.all(MATERIAL_PROOF_SOURCE_FILES.map((relativePath) =>
    readFile(path.join(projectRoot, relativePath), "utf-8")
  ));
  const assets = new Set<string>();

  for (const source of materialProofSources) {
    for (const match of source.matchAll(MATERIAL_PROOF_BASECOLOR_PATTERN)) assets.add(match[0]);
  }
  for (const materialId of PBR_MATERIAL_IDS) {
    for (const fileName of PBR_TEXTURE_FILES) {
      assets.add(`public/materials/${materialId}/${fileName}`);
    }
  }

  const sortedAssets = [...assets].sort();
  await Promise.all(sortedAssets.map(async (relativePath) => {
    try {
      await access(path.join(projectRoot, relativePath));
    } catch {
      throw new Error(`Required deploy material asset is missing: ${relativePath}`);
    }
  }));
  return sortedAssets;
}

async function main(): Promise<void> {
  const assets = await listDeployMaterialAssets(process.cwd());
  process.stdout.write(`${assets.join("\n")}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
