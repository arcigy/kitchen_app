import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type UnknownRecord = Record<string, unknown>;

export type DockerImageInventoryItem = {
  id: string;
  repositories: string[];
  createdAt: string;
  sizeBytes: number;
};

export type DockerContainerInventoryItem = {
  id: string;
  name: string;
  imageId: string;
  state: string;
};

export type DockerInventorySnapshot = {
  capturedAt: string;
  images: DockerImageInventoryItem[];
  containers: DockerContainerInventoryItem[];
};

export type CapRoverApplicationImage = {
  appName: string;
  repository: string;
};

export type CapRoverImageRetentionConfig = {
  applications: CapRoverApplicationImage[];
  retainedReleaseCount: number;
};

export type CapRoverImageRetentionEntry = {
  imageId: string;
  repositories: string[];
  createdAt: string;
  sizeBytes: number;
  appNames: string[];
  reasons: string[];
};

export type CapRoverImageRetentionPlan = {
  schemaVersion: "arcigy.caprover-image-retention-plan.v1";
  generatedAt: string;
  capturedAt: string;
  retainedReleaseCount: number;
  applications: CapRoverApplicationImage[];
  snapshotSha256: string;
  approvalFingerprint: string;
  retained: CapRoverImageRetentionEntry[];
  candidates: CapRoverImageRetentionEntry[];
  unmanagedImageCount: number;
  unmanagedImageBytes: number;
  estimatedCandidateBytes: number;
  executable: false;
  warning: string;
};

export const DEFAULT_ARCIGY_IMAGE_RETENTION_CONFIG: CapRoverImageRetentionConfig = {
  applications: [
    { appName: "arcigy-kitchen-develop", repository: "img-captain-arcigy-kitchen-develop" },
    { appName: "kitchenapp", repository: "img-captain-kitchenapp" }
  ],
  retainedReleaseCount: 4
};

const FULL_IMAGE_ID = /^sha256:[a-f0-9]{64}$/u;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`CapRover image retention planning failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function requireFullImageId(value: unknown, label: string): string {
  if (typeof value !== "string" || !FULL_IMAGE_ID.test(value)) {
    fail(`${label} must be a full sha256 image ID.`);
  }
  return value;
}

function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function repositoryFromTag(tag: string): string {
  const digestIndex = tag.indexOf("@");
  if (digestIndex > 0) return tag.slice(0, digestIndex);
  const slashIndex = tag.lastIndexOf("/");
  const colonIndex = tag.lastIndexOf(":");
  return colonIndex > slashIndex ? tag.slice(0, colonIndex) : tag;
}

function normalizeApplications(applications: CapRoverApplicationImage[]): CapRoverApplicationImage[] {
  if (applications.length === 0) fail("at least one exact application repository is required.");
  const normalized = applications.map((application, index) => {
    const appName = application.appName?.trim();
    const repository = application.repository?.trim();
    if (!appName || !repository || repository === "<none>") {
      fail(`application ${index} must have a non-empty appName and repository.`);
    }
    return { appName, repository };
  }).sort((left, right) => left.appName.localeCompare(right.appName));
  if (new Set(normalized.map((item) => item.appName)).size !== normalized.length) fail("application names must be unique.");
  if (new Set(normalized.map((item) => item.repository)).size !== normalized.length) fail("application repositories must be unique.");
  return normalized;
}

function normalizeSnapshot(snapshot: DockerInventorySnapshot): DockerInventorySnapshot {
  const capturedAt = requireIsoDate(snapshot.capturedAt, "capturedAt");
  if (!Array.isArray(snapshot.images) || snapshot.images.length === 0) fail("image inventory is empty.");
  if (!Array.isArray(snapshot.containers) || snapshot.containers.length === 0) {
    fail("container inventory is empty; running and stopped container references cannot be proven.");
  }

  const images = snapshot.images.map((image, index) => {
    const id = requireFullImageId(image.id, `image ${index} id`);
    const repositories = [...new Set(image.repositories.map((item) => item.trim()).filter(Boolean))].sort();
    if (repositories.length === 0) repositories.push("<none>");
    return {
      id,
      repositories,
      createdAt: requireIsoDate(image.createdAt, `image ${id} createdAt`),
      sizeBytes: requireNonNegativeInteger(image.sizeBytes, `image ${id} sizeBytes`)
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(images.map((image) => image.id)).size !== images.length) fail("image IDs must be unique.");

  const containers = snapshot.containers.map((container, index) => {
    const id = typeof container.id === "string" ? container.id.trim() : "";
    const name = typeof container.name === "string" ? container.name.trim() : "";
    const state = typeof container.state === "string" ? container.state.trim() : "";
    if (!id || !name || !state) fail(`container ${index} must have id, name, and state.`);
    return {
      id,
      name,
      imageId: requireFullImageId(container.imageId, `container ${name} imageId`),
      state
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(containers.map((container) => container.id)).size !== containers.length) fail("container IDs must be unique.");

  const imageIds = new Set(images.map((image) => image.id));
  const missing = containers.find((container) => !imageIds.has(container.imageId));
  if (missing) fail(`container ${missing.name} references an image absent from the snapshot.`);
  return { capturedAt, images, containers };
}

function parseImageInspect(payload: unknown): DockerImageInventoryItem[] {
  if (!Array.isArray(payload) || payload.length === 0) fail("Docker image inspect payload is empty.");
  return payload.map((item, index) => {
    if (!isRecord(item)) fail(`Docker image inspect item ${index} is invalid.`);
    const repoTags = item.RepoTags;
    if (repoTags !== null && repoTags !== undefined && !Array.isArray(repoTags)) fail(`Docker image inspect item ${index} has invalid RepoTags.`);
    const repositories = Array.isArray(repoTags)
      ? [...new Set(repoTags.map((tag) => {
        if (typeof tag !== "string" || !tag.trim()) fail(`Docker image inspect item ${index} has an invalid repository tag.`);
        return repositoryFromTag(tag.trim());
      }))]
      : ["<none>"];
    return {
      id: requireFullImageId(item.Id, `Docker image inspect item ${index} Id`),
      repositories,
      createdAt: requireIsoDate(item.Created, `Docker image inspect item ${index} Created`),
      sizeBytes: requireNonNegativeInteger(item.Size, `Docker image inspect item ${index} Size`)
    };
  });
}

function parseContainerInspect(payload: unknown): DockerContainerInventoryItem[] {
  if (!Array.isArray(payload) || payload.length === 0) fail("Docker container inspect payload is empty.");
  return payload.map((item, index) => {
    if (!isRecord(item) || !isRecord(item.State)) fail(`Docker container inspect item ${index} is invalid.`);
    const id = typeof item.Id === "string" ? item.Id.trim() : "";
    const name = typeof item.Name === "string" ? item.Name.replace(/^\//u, "").trim() : "";
    const state = typeof item.State.Status === "string" ? item.State.Status.trim() : "";
    if (!id || !name || !state) fail(`Docker container inspect item ${index} must have Id, Name, and State.Status.`);
    return {
      id,
      name,
      imageId: requireFullImageId(item.Image, `Docker container ${name} Image`),
      state
    };
  });
}

export function createDockerInventorySnapshot(
  imageInspectPayload: unknown,
  containerInspectPayload: unknown,
  capturedAt: string
): DockerInventorySnapshot {
  return normalizeSnapshot({
    capturedAt,
    images: parseImageInspect(imageInspectPayload),
    containers: parseContainerInspect(containerInspectPayload)
  });
}

export function createCapRoverImageRetentionPlan(
  rawSnapshot: DockerInventorySnapshot,
  rawConfig: CapRoverImageRetentionConfig = DEFAULT_ARCIGY_IMAGE_RETENTION_CONFIG,
  generatedAt = new Date().toISOString()
): CapRoverImageRetentionPlan {
  if (!Number.isSafeInteger(rawConfig.retainedReleaseCount) || rawConfig.retainedReleaseCount < 4) {
    fail("retainedReleaseCount must keep the current release plus at least three rollback releases.");
  }
  const applications = normalizeApplications(rawConfig.applications);
  const snapshot = normalizeSnapshot(rawSnapshot);
  const generated = requireIsoDate(generatedAt, "generatedAt");
  const imageById = new Map(snapshot.images.map((image) => [image.id, image]));
  const referencedIds = new Set(snapshot.containers.map((container) => container.imageId));
  const repositoryOwners = new Map(applications.map((application) => [application.repository, application]));
  const managedIds = new Set<string>();
  const retainedReasons = new Map<string, Set<string>>();
  const candidateApps = new Map<string, Set<string>>();

  for (const application of applications) {
    const releases = snapshot.images
      .filter((image) => image.repositories.includes(application.repository))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
    if (releases.length === 0) fail(`snapshot has no images for exact repository ${application.repository}.`);
    for (const release of releases) managedIds.add(release.id);
    for (const release of releases.slice(0, rawConfig.retainedReleaseCount)) {
      const reasons = retainedReasons.get(release.id) ?? new Set<string>();
      reasons.add(`retained_release:${application.appName}`);
      retainedReasons.set(release.id, reasons);
    }
    for (const release of releases.slice(rawConfig.retainedReleaseCount)) {
      const apps = candidateApps.get(release.id) ?? new Set<string>();
      apps.add(application.appName);
      candidateApps.set(release.id, apps);
    }
  }

  for (const imageId of managedIds) {
    const image = imageById.get(imageId)!;
    const reasons = retainedReasons.get(imageId) ?? new Set<string>();
    if (referencedIds.has(imageId)) {
      const names = snapshot.containers.filter((container) => container.imageId === imageId).map((container) => container.name).sort();
      reasons.add(`container_reference:${names.join(",")}`);
    }
    const foreignRepositories = image.repositories.filter((repository) => repository !== "<none>" && !repositoryOwners.has(repository));
    if (foreignRepositories.length > 0) reasons.add(`shared_repository:${foreignRepositories.join(",")}`);
    const managedRepositories = image.repositories.filter((repository) => repositoryOwners.has(repository));
    if (managedRepositories.length > 1) reasons.add(`shared_arcigy_repository:${managedRepositories.join(",")}`);
    if (reasons.size > 0) retainedReasons.set(imageId, reasons);
  }

  const candidates = [...candidateApps.entries()]
    .filter(([imageId]) => !retainedReasons.has(imageId))
    .map(([imageId, appNames]) => {
      const image = imageById.get(imageId)!;
      return {
        imageId,
        repositories: image.repositories,
        createdAt: image.createdAt,
        sizeBytes: image.sizeBytes,
        appNames: [...appNames].sort(),
        reasons: ["older_than_retained_release_window", "not_referenced_by_any_container", "exact_managed_repository_only"]
      } satisfies CapRoverImageRetentionEntry;
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.imageId.localeCompare(right.imageId));

  const retained = [...managedIds]
    .filter((imageId) => retainedReasons.has(imageId))
    .map((imageId) => {
      const image = imageById.get(imageId)!;
      const appNames = image.repositories.map((repository) => repositoryOwners.get(repository)?.appName).filter((value): value is string => !!value).sort();
      return {
        imageId,
        repositories: image.repositories,
        createdAt: image.createdAt,
        sizeBytes: image.sizeBytes,
        appNames,
        reasons: [...retainedReasons.get(imageId)!].sort()
      } satisfies CapRoverImageRetentionEntry;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.imageId.localeCompare(right.imageId));

  const unmanaged = snapshot.images.filter((image) => !managedIds.has(image.id));
  const snapshotSha256 = sha256(canonicalJson(snapshot));
  const approvalFingerprint = sha256(canonicalJson({
    schemaVersion: "arcigy.caprover-image-retention-plan.v1",
    applications,
    retainedReleaseCount: rawConfig.retainedReleaseCount,
    snapshotSha256,
    retained: retained.map((entry) => ({ imageId: entry.imageId, reasons: entry.reasons })),
    candidates: candidates.map((entry) => entry.imageId)
  }));

  return {
    schemaVersion: "arcigy.caprover-image-retention-plan.v1",
    generatedAt: generated,
    capturedAt: snapshot.capturedAt,
    retainedReleaseCount: rawConfig.retainedReleaseCount,
    applications,
    snapshotSha256,
    approvalFingerprint,
    retained,
    candidates,
    unmanagedImageCount: unmanaged.length,
    unmanagedImageBytes: unmanaged.reduce((sum, image) => sum + image.sizeBytes, 0),
    estimatedCandidateBytes: candidates.reduce((sum, image) => sum + image.sizeBytes, 0),
    executable: false,
    warning: "Read-only plan only. Re-capture and verify the full inventory immediately before requesting approval; remove only explicitly approved full image IDs one by one."
  };
}

export function verifyCapRoverImageRetentionPlan(
  plan: CapRoverImageRetentionPlan,
  snapshot: DockerInventorySnapshot,
  config: CapRoverImageRetentionConfig = DEFAULT_ARCIGY_IMAGE_RETENTION_CONFIG
): void {
  const fresh = createCapRoverImageRetentionPlan(snapshot, config, plan.generatedAt);
  if (fresh.snapshotSha256 !== plan.snapshotSha256) fail("inventory changed after the reviewed snapshot.");
  if (fresh.approvalFingerprint !== plan.approvalFingerprint) fail("reviewed plan fingerprint does not match the current plan.");
  if (canonicalJson(fresh.candidates) !== canonicalJson(plan.candidates)) fail("candidate list differs from the reviewed plan.");
}

function readFlag(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) fail(`missing required ${name} path.`);
  return value;
}

function readOptionalFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`missing ${name} path.`);
  return value;
}

function parseRetentionPlan(value: unknown): CapRoverImageRetentionPlan {
  if (!isRecord(value)
    || value.schemaVersion !== "arcigy.caprover-image-retention-plan.v1"
    || typeof value.generatedAt !== "string"
    || typeof value.snapshotSha256 !== "string"
    || typeof value.approvalFingerprint !== "string"
    || !Array.isArray(value.candidates)) {
    fail("reviewed plan file is invalid.");
  }
  return value as CapRoverImageRetentionPlan;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--write") || args.includes("--execute") || args.includes("--delete")) {
    fail("this tool is permanently read-only and cannot delete Docker images.");
  }
  const imagePath = path.resolve(readFlag(args, "--images"));
  const containerPath = path.resolve(readFlag(args, "--containers"));
  const capturedAt = readFlag(args, "--captured-at");
  const reviewedPlanPath = readOptionalFlag(args, "--verify-plan");
  const [imagePayload, containerPayload] = await Promise.all([
    readFile(imagePath, "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(containerPath, "utf8").then((value) => JSON.parse(value) as unknown)
  ]);
  const snapshot = createDockerInventorySnapshot(imagePayload, containerPayload, capturedAt);
  if (reviewedPlanPath) {
    const reviewedPlan = parseRetentionPlan(JSON.parse(await readFile(path.resolve(reviewedPlanPath), "utf8")) as unknown);
    verifyCapRoverImageRetentionPlan(reviewedPlan, snapshot);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      snapshotSha256: reviewedPlan.snapshotSha256,
      approvalFingerprint: reviewedPlan.approvalFingerprint,
      candidateImageIds: reviewedPlan.candidates.map((candidate) => candidate.imageId)
    }, null, 2)}\n`);
    return;
  }
  const plan = createCapRoverImageRetentionPlan(snapshot);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
