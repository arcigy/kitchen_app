import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type UnknownRecord = Record<string, unknown>;

export type CapRoverUnusedImageDeletePayload = {
  imageIds: string[];
};

const FULL_IMAGE_ID = /^sha256:[a-f0-9]{64}$/u;
const MAX_DELETE_CANDIDATES = 500;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`CapRover unused-image cleanup refused: ${message}`);
}

function unwrapSuccessfulResponse(payload: unknown): unknown {
  if (isRecord(payload) && "status" in payload) {
    if (payload.status !== 100) fail("API response does not report success.");
    return payload.data;
  }
  return payload;
}

export function createCapRoverUnusedImageDeletePayload(
  payload: unknown
): CapRoverUnusedImageDeletePayload {
  const response = unwrapSuccessfulResponse(payload);
  if (!isRecord(response) || !Array.isArray(response.unusedImages)) {
    fail("API response has no unusedImages inventory.");
  }
  if (response.unusedImages.length > MAX_DELETE_CANDIDATES) {
    fail(`candidate count exceeds the safety limit of ${MAX_DELETE_CANDIDATES}.`);
  }

  const imageIds = response.unusedImages.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || !FULL_IMAGE_ID.test(item.id)) {
      fail(`candidate ${index} does not contain a full Docker image ID.`);
    }
    return item.id;
  });

  if (new Set(imageIds).size !== imageIds.length) {
    fail("candidate inventory contains duplicate image IDs.");
  }
  return { imageIds };
}

export function validateCapRoverUnusedImageDeleteResponse(payload: unknown): void {
  const response = unwrapSuccessfulResponse(payload);
  if (!isRecord(response)) fail("delete response is not an object.");
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const inputPath = process.argv[3];
  if (!mode || !inputPath) {
    throw new Error("Usage: tsx scripts/caproverUnusedImageCleanup.ts <plan|verify> <response.json> [delete-payload.json]");
  }
  const payload = JSON.parse(await readFile(path.resolve(inputPath), "utf-8")) as unknown;

  if (mode === "verify") {
    validateCapRoverUnusedImageDeleteResponse(payload);
    process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
    return;
  }
  if (mode !== "plan") fail(`unsupported mode ${mode}.`);

  const outputPath = process.argv[4];
  if (!outputPath) fail("plan mode requires an output path.");
  const deletePayload = createCapRoverUnusedImageDeletePayload(payload);
  await writeFile(path.resolve(outputPath), `${JSON.stringify(deletePayload)}\n`, {
    encoding: "utf-8",
    mode: 0o600
  });
  process.stdout.write(`${JSON.stringify({ ok: true, candidateCount: deletePayload.imageIds.length })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
