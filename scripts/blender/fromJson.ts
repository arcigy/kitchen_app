import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createStorageService } from "../../src/core/storage/storageService";
import { runBlenderExport } from "../../server/blender/runBlenderExport";

type ArgMap = Record<string, string | boolean>;

const parseArgs = (argv: string[]): ArgMap => {
  const out: ArgMap = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
};

const usage = () => {
  console.log(
    [
      "Usage:",
      "  npm run blender:from-json -- --json <scene.json> [--project <projectId>] [--phase <phaseId>]",
      "",
      "Env:",
      "  BLENDER_PATH=/absolute/path/to/blender (optional)"
    ].join("\n")
  );
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jsonArg = args.json;
  if (typeof jsonArg !== "string" || !jsonArg.trim()) {
    usage();
    process.exitCode = 2;
    return;
  }

  const projectRoot = process.cwd();
  const jsonPath = path.resolve(projectRoot, jsonArg);
  const raw = await readFile(jsonPath, "utf-8");
  const sceneJson = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;

  const context = { userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" } as const;
  const storage = await createStorageService({
    projectRoot,
    context,
    projectId: typeof args.project === "string" ? args.project : undefined,
    phaseId: typeof args.phase === "string" ? args.phase : undefined
  });
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "").replaceAll("-", "").slice(0, 15);

  const res = await runBlenderExport({
    sceneJson,
    storage,
    sceneFileName: `scene-${stamp}.json`,
    blendFileName: `scene-${stamp}.blend`,
    previewFileName: `preview-${stamp}.png`,
    projectRoot,
  });

  console.log(
    JSON.stringify(
      {
        jsonPath: res.jsonPath,
        blendPath: res.blendPath,
        previewPath: res.previewPath
      },
      null,
      2
    )
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
