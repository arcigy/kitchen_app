import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createFileSupplierBridgeRepository } from "./supplier-bridge-file-repository";
import { createSupplierBridgeService } from "./supplier-bridge-service";
import { validateSupplierBridgeTenantState } from "./supplier-bridge-validation";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("supplier bridge file repository", () => {
  it("roundtrips tenant-scoped session and token state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-supplier-bridge-"));
    roots.push(root);
    const context: ClientContext = { clientId: "tenant-file", userId: "user-file", role: "owner" };
    const service = createSupplierBridgeService({
      repository: createFileSupplierBridgeRepository(root),
      applyConfirmedCandidate: async () => undefined,
      now: () => new Date("2026-07-10T08:00:00.000Z")
    });
    const created = await service.createSession(context, "project-file", "mock-supplier", [{
      materialAssignmentId: "material-assignment:front",
      query: "Mock front",
      expectedManufacturer: "Mock",
      expectedDecorCode: "F01",
      expectedSurfaceCode: "MAT",
      expectedProductType: "board",
      expectedThicknessMm: 18
    }]);
    await service.attachSession(created.view.session.id, created.bridgeToken);

    const filePath = path.join(root, "storage", "clients", context.clientId, "supplier-bridge", "state.json");
    const state = validateSupplierBridgeTenantState(JSON.parse(await readFile(filePath, "utf-8")) as unknown);
    expect(state.sessions).toHaveLength(1);
    expect(state.items).toHaveLength(1);
    expect(state.tokens).toHaveLength(2);
    expect(state.tokens.find((token) => token.kind === "bridge_once")?.usedAt).toBe("2026-07-10T08:00:00.000Z");
    expect(JSON.stringify(state)).not.toContain(created.bridgeToken);
  });
});
