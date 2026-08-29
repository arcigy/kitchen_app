import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCapRoverImageRetentionPlan,
  createDockerInventorySnapshot,
  verifyCapRoverImageRetentionPlan,
  type CapRoverImageRetentionConfig,
  type DockerInventorySnapshot
} from "./caproverImageRetentionPlan";

const ids = Array.from({ length: 12 }, (_, index) => `sha256:${(index + 1).toString(16).padStart(64, "0")}`);
const config: CapRoverImageRetentionConfig = {
  applications: [
    { appName: "arcigy-kitchen-develop", repository: "img-captain-arcigy-kitchen-develop" },
    { appName: "kitchenapp", repository: "img-captain-kitchenapp" }
  ],
  retainedReleaseCount: 4
};

function image(id: string, repository: string, day: number, extraRepositories: string[] = []) {
  return {
    id,
    repositories: [repository, ...extraRepositories],
    createdAt: `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    sizeBytes: day * 100
  };
}

function snapshot(): DockerInventorySnapshot {
  return {
    capturedAt: "2026-07-16T12:00:00.000Z",
    images: [
      image(ids[0], "img-captain-kitchenapp", 16),
      image(ids[1], "img-captain-kitchenapp", 15),
      image(ids[2], "img-captain-kitchenapp", 14),
      image(ids[3], "img-captain-kitchenapp", 13),
      image(ids[4], "img-captain-kitchenapp", 12),
      image(ids[5], "img-captain-kitchenapp", 11),
      image(ids[6], "img-captain-arcigy-kitchen-develop", 16),
      image(ids[7], "img-captain-arcigy-kitchen-develop", 15),
      image(ids[8], "img-captain-arcigy-kitchen-develop", 14),
      image(ids[9], "img-captain-arcigy-kitchen-develop", 13),
      image(ids[10], "img-captain-arcigy-kitchen-develop", 12),
      image(ids[11], "postgres", 10)
    ],
    containers: [
      { id: "container-running", name: "kitchenapp.1", imageId: ids[0], state: "running" },
      { id: "container-stopped", name: "old-kitchenapp", imageId: ids[4], state: "exited" },
      { id: "container-db", name: "kitchenapp-db", imageId: ids[11], state: "running" }
    ]
  };
}

describe("CapRover Docker image retention planning", () => {
  it("keeps current plus three rollback releases and protects stopped-container images", () => {
    const plan = createCapRoverImageRetentionPlan(snapshot(), config, "2026-07-16T12:01:00Z");

    expect(plan.executable).toBe(false);
    expect(plan.retainedReleaseCount).toBe(4);
    expect(plan.candidates.map((entry) => entry.imageId)).toEqual([ids[5], ids[10]]);
    expect(plan.retained.find((entry) => entry.imageId === ids[4])?.reasons).toContain("container_reference:old-kitchenapp");
    expect(plan.estimatedCandidateBytes).toBe(2300);
    expect(plan.unmanagedImageCount).toBe(1);
  });

  it("never proposes images shared with another repository", () => {
    const value = snapshot();
    value.images[5].repositories.push("manual-rollback-archive");
    const plan = createCapRoverImageRetentionPlan(value, config, "2026-07-16T12:01:00Z");

    expect(plan.candidates.map((entry) => entry.imageId)).not.toContain(ids[5]);
    expect(plan.retained.find((entry) => entry.imageId === ids[5])?.reasons).toContain("shared_repository:manual-rollback-archive");
  });

  it("leaves PostgreSQL and every unconfigured repository unmanaged", () => {
    const plan = createCapRoverImageRetentionPlan(snapshot(), config, "2026-07-16T12:01:00Z");
    expect(plan.candidates.map((entry) => entry.imageId)).not.toContain(ids[11]);
    expect(plan.retained.map((entry) => entry.imageId)).not.toContain(ids[11]);
  });

  it("fails closed on an incomplete inventory or shortened image IDs", () => {
    const missing = snapshot();
    missing.images = missing.images.filter((entry) => entry.id !== ids[0]);
    expect(() => createCapRoverImageRetentionPlan(missing, config)).toThrow("absent from the snapshot");

    const shortened = snapshot();
    shortened.images[0].id = ids[0].slice(0, 20);
    expect(() => createCapRoverImageRetentionPlan(shortened, config)).toThrow("full sha256 image ID");
  });

  it("refuses a policy with fewer than three rollback releases", () => {
    expect(() => createCapRoverImageRetentionPlan(snapshot(), { ...config, retainedReleaseCount: 3 }))
      .toThrow("at least three rollback releases");
  });

  it("creates deterministic review hashes and rejects inventory drift", () => {
    const original = snapshot();
    const first = createCapRoverImageRetentionPlan(original, config, "2026-07-16T12:01:00Z");
    const reordered = { ...original, images: [...original.images].reverse(), containers: [...original.containers].reverse() };
    const second = createCapRoverImageRetentionPlan(reordered, config, "2026-07-16T12:02:00Z");

    expect(second.snapshotSha256).toBe(first.snapshotSha256);
    expect(second.approvalFingerprint).toBe(first.approvalFingerprint);
    expect(() => verifyCapRoverImageRetentionPlan(first, reordered, config)).not.toThrow();

    reordered.images[0].sizeBytes += 1;
    expect(() => verifyCapRoverImageRetentionPlan(first, reordered, config)).toThrow("inventory changed");
  });

  it("parses complete Docker inspect output without accepting display-shortened metadata", () => {
    const parsed = createDockerInventorySnapshot([
      { Id: ids[0], RepoTags: ["registry.example:5000/img-captain-kitchenapp:release-1"], Created: "2026-07-16T00:00:00Z", Size: 123 },
      { Id: ids[11], RepoTags: ["postgres:16"], Created: "2026-07-15T00:00:00Z", Size: 456 }
    ], [
      { Id: "container-app", Name: "/kitchenapp.1", Image: ids[0], State: { Status: "running" } },
      { Id: "container-db", Name: "/kitchenapp-db", Image: ids[11], State: { Status: "running" } }
    ], "2026-07-16T12:00:00Z");

    expect(parsed.images[0].repositories).toEqual(["registry.example:5000/img-captain-kitchenapp"]);
    expect(parsed.containers.map((entry) => entry.name)).toEqual(["kitchenapp.1", "kitchenapp-db"]);
  });

  it("contains no Docker deletion or subprocess execution path", async () => {
    const source = await readFile(path.join(process.cwd(), "scripts", "caproverImageRetentionPlan.ts"), "utf8");
    expect(source).not.toMatch(/node:child_process|docker\s+(?:image\s+rm|system\s+prune|image\s+prune)/u);
    expect(source).toContain("permanently read-only");
  });
});
