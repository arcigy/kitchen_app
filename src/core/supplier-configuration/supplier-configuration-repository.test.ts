import { describe, expect, it } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createInMemorySupplierConfigurationRepository } from "./supplier-configuration-repository";

const supplier = { supplierId: "shared", displayName: "Shared supplier", startUrl: "https://supplier.example/", adapterKey: "shared", sortOrder: 10 };

describe("client supplier configuration", () => {
  it("allows one supplier for multiple clients without exposing it to an unassigned client", async () => {
    const repository = createInMemorySupplierConfigurationRepository({ client_a: [supplier], client_b: [supplier] });
    const ctx = (clientId: string): ClientContext => ({ clientId, userId: `user_${clientId}`, role: "owner" });

    await expect(repository.listEnabledForClient(ctx("client_a"))).resolves.toEqual([supplier]);
    await expect(repository.listEnabledForClient(ctx("client_b"))).resolves.toEqual([supplier]);
    await expect(repository.listEnabledForClient(ctx("client_c"))).resolves.toEqual([]);
  });
});
