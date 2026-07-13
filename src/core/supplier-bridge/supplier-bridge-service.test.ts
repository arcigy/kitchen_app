import { describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../client/client-context";
import { parseSupplierPrice } from "./supplier-price";
import { createInMemorySupplierBridgeRepository } from "./supplier-bridge-repository";
import { createSupplierBridgeService, SupplierBridgeServiceError } from "./supplier-bridge-service";

const ctx: ClientContext = { clientId: "tenant-a", userId: "user-a", role: "owner" };
const materials = [{
  materialAssignmentId: "material-assignment:corpus",
  query: "Egger H1180 ST37 board 18 mm",
  expectedManufacturer: "Egger",
  expectedDecorCode: "H1180",
  expectedSurfaceCode: "ST37",
  expectedProductType: "board",
  expectedThicknessMm: 18
}];

describe("supplier bridge service integration", () => {
  it("creates, attaches, submits idempotently and explicitly confirms a session", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const applyConfirmedCandidate = vi.fn(async () => undefined);
    const service = createSupplierBridgeService({
      repository,
      applyConfirmedCandidate,
      now: () => new Date("2026-07-10T08:00:00.000Z")
    });
    const created = await service.createSession(ctx, "project-a", "mock-supplier", materials);
    expect(created.view.counts).toMatchObject({ total: 1, pending: 1, processed: 0 });

    const attached = await service.attachSession(created.view.session.id, created.bridgeToken);
    await expect(service.attachSession(created.view.session.id, created.bridgeToken)).rejects.toBeInstanceOf(SupplierBridgeServiceError);
    expect(attached.view.currentItem?.materialAssignmentId).toBe("material-assignment:corpus");

    const itemId = attached.view.currentItem!.id;
    const price = parseSupplierPrice({
      rawPriceText: "60,00 € bez DPH",
      rawUnitText: "za dosku",
      widthMm: 2_000,
      lengthMm: 3_000,
      observedAt: "2026-07-10T08:00:00.000Z"
    });
    const submission = {
      submissionId: "capture-1",
      syncItemId: itemId,
      supplierProductCode: "MOCK-H1180-ST37-18",
      normalizedProduct: {
        displayName: "Egger H1180 ST37 18 mm",
        manufacturer: "Egger",
        decorCode: "H1180",
        surfaceCode: "ST37",
        productType: "board",
        thicknessMm: 18,
        widthMm: 2_000,
        lengthMm: 3_000,
        availability: "available" as const
      },
      sourcePageType: "product" as const,
      sourcePath: "/product/mock-h1180",
      observedAt: "2026-07-10T08:00:00.000Z",
      price: { supplierAccountId: "mock-account", ...price }
    };
    const first = await service.submitCandidate(created.view.session.id, attached.accessToken, submission);
    const replay = await service.submitCandidate(created.view.session.id, attached.accessToken, submission);
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.candidate.id).toBe(first.candidate.id);
    expect(first.view.counts.needsConfirmation).toBe(1);

    const confirmed = await service.confirmCandidate(created.view.session.id, attached.accessToken, itemId, first.candidate.id);
    expect(confirmed.session.status).toBe("completed");
    expect(confirmed.counts).toMatchObject({ completed: 1, processed: 1, pending: 0 });
    expect(applyConfirmedCandidate).toHaveBeenCalledOnce();
    expect(applyConfirmedCandidate).toHaveBeenCalledWith(expect.objectContaining({
      mapping: expect.objectContaining({ supplierProductCode: "MOCK-H1180-ST37-18" }),
      priceObservation: expect.objectContaining({ normalizedAmount: 10, normalizedPriceBasis: "m2" })
    }));
  });

  it("restores status from repository and supports explicit cancellation", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const service = createSupplierBridgeService({
      repository,
      applyConfirmedCandidate: async () => undefined,
      now: () => new Date("2026-07-10T08:00:00.000Z")
    });
    const created = await service.createSession(ctx, "project-a", "mock-supplier", materials);
    const attached = await service.attachSession(created.view.session.id, created.bridgeToken);
    expect((await service.getSessionForExtension(created.view.session.id, attached.accessToken)).counts.pending).toBe(1);
    const cancelled = await service.cancelForExtension(created.view.session.id, attached.accessToken);
    expect(cancelled.session.status).toBe("cancelled");
  });

  it("confirms a manually selected current product without old material identity fields", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const applyConfirmedCandidate = vi.fn(async () => undefined);
    const service = createSupplierBridgeService({ repository, applyConfirmedCandidate, now: () => new Date("2026-07-10T08:00:00.000Z") });
    const created = await service.createSession(ctx, "project-a", "demos", [{
      materialAssignmentId: "material-assignment:corpus",
      query: "corpus",
      expectedManufacturer: null,
      expectedDecorCode: null,
      expectedSurfaceCode: null,
      expectedProductType: "board",
      expectedThicknessMm: null
    }]);
    const attached = await service.attachSession(created.view.session.id, created.bridgeToken);
    const itemId = attached.view.currentItem!.id;
    const submitted = await service.submitCandidate(created.view.session.id, attached.accessToken, {
      submissionId: "capture-current-product",
      syncItemId: itemId,
      supplierProductCode: "142391",
      normalizedProduct: { displayName: "DTDL biela 18 mm", manufacturer: null, decorCode: null, surfaceCode: null, productType: "board", thicknessMm: 18, widthMm: 2070, lengthMm: 2800, availability: "available" },
      sourcePageType: "product",
      sourcePath: "/product/142391/",
      observedAt: "2026-07-10T08:00:00.000Z",
      price: null
    });

    const confirmed = await service.confirmCandidate(created.view.session.id, attached.accessToken, itemId, submitted.candidate.id);

    expect(confirmed.counts.completed).toBe(1);
    expect(applyConfirmedCandidate).toHaveBeenCalledWith(expect.objectContaining({ mapping: null, candidate: expect.objectContaining({ supplierProductCode: "142391" }) }));
  });

  it("confirms an exact supplier ID without requiring board decor mapping fields", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const applyConfirmedCandidate = vi.fn(async () => undefined);
    const service = createSupplierBridgeService({
      repository,
      applyConfirmedCandidate,
      now: () => new Date("2026-07-10T08:00:00.000Z")
    });
    const created = await service.createSession(ctx, "project-a", "demos", [{
      materialAssignmentId: "material-assignment:hinge",
      query: "0001/A-2",
      expectedManufacturer: null,
      expectedDecorCode: null,
      expectedSurfaceCode: null,
      expectedProductType: "component",
      expectedThicknessMm: null,
      exactLookup: { requestId: "lookup-1", supplierId: "demos", supplierProductId: "0001/A-2" }
    }]);
    const attached = await service.attachSession(created.view.session.id, created.bridgeToken);
    const itemId = attached.view.currentItem!.id;
    const submitted = await service.submitCandidate(created.view.session.id, attached.accessToken, {
      submissionId: "capture-exact-1",
      syncItemId: itemId,
      supplierProductCode: "0001/A-2",
      normalizedProduct: {
        displayName: "Exact hinge",
        manufacturer: null,
        decorCode: null,
        surfaceCode: null,
        productType: "component",
        thicknessMm: null,
        widthMm: null,
        lengthMm: null,
        availability: "available"
      },
      sourcePageType: "product",
      sourcePath: "/product/exact-hinge",
      observedAt: "2026-07-10T08:00:00.000Z",
      price: null
    });

    expect(submitted.view.currentItem?.exactLookup).toMatchObject({ supplierProductId: "0001/A-2", lookupStatus: "needs_confirmation" });
    const confirmed = await service.confirmCandidate(created.view.session.id, attached.accessToken, itemId, submitted.candidate.id);
    expect(confirmed.items[0]?.exactLookup?.lookupStatus).toBe("completed");
    expect(applyConfirmedCandidate).toHaveBeenCalledWith(expect.objectContaining({
      mapping: null,
      candidate: expect.objectContaining({ supplierProductCode: "0001/A-2" })
    }));
  });

  it("blocks confirmation when the found product ID differs by even one character", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const service = createSupplierBridgeService({ repository, applyConfirmedCandidate: async () => undefined, now: () => new Date("2026-07-10T08:00:00.000Z") });
    const created = await service.createSession(ctx, "project-a", "demos", [{
      ...materials[0],
      query: "00123-A",
      exactLookup: { requestId: "lookup-mismatch", supplierId: "demos", supplierProductId: "00123-A" }
    }]);
    const attached = await service.attachSession(created.view.session.id, created.bridgeToken);
    const itemId = attached.view.currentItem!.id;
    const submitted = await service.submitCandidate(created.view.session.id, attached.accessToken, {
      submissionId: "capture-mismatch",
      syncItemId: itemId,
      supplierProductCode: "123-A",
      normalizedProduct: {
        displayName: "Wrong product",
        manufacturer: "Egger",
        decorCode: "H1180",
        surfaceCode: "ST37",
        productType: "board",
        thicknessMm: 18,
        widthMm: null,
        lengthMm: null,
        availability: "available"
      },
      sourcePageType: "product",
      sourcePath: "/product/wrong",
      observedAt: "2026-07-10T08:00:00.000Z",
      price: null
    });
    expect(submitted.view.currentItem?.exactLookup?.lookupStatus).toBe("not_found");
    await expect(service.confirmCandidate(created.view.session.id, attached.accessToken, itemId, submitted.candidate.id))
      .rejects.toMatchObject({ status: 422 });
  });

  it("reuses price history when amount, unit and VAT mode did not change", async () => {
    const repository = createInMemorySupplierBridgeRepository();
    const service = createSupplierBridgeService({ repository, applyConfirmedCandidate: async () => undefined, now: () => new Date("2026-07-10T08:00:00.000Z") });
    const exactMaterial = [{
      ...materials[0],
      query: "000-BOARD",
      exactLookup: { requestId: "lookup-price", supplierId: "demos" as const, supplierProductId: "000-BOARD" }
    }];
    const capture = (syncItemId: string, submissionId: string, observedAt: string) => ({
      submissionId,
      syncItemId,
      supplierProductCode: "000-BOARD",
      normalizedProduct: {
        displayName: "Exact board",
        manufacturer: "Egger",
        decorCode: "H1180",
        surfaceCode: "ST37",
        productType: "board",
        thicknessMm: 18,
        widthMm: 2_000,
        lengthMm: 3_000,
        availability: "available" as const
      },
      sourcePageType: "product" as const,
      sourcePath: "/product/000-board",
      observedAt,
      price: {
        supplierAccountId: null,
        amount: 60,
        currency: "EUR",
        priceBasis: "sheet" as const,
        vatMode: "excluded" as const,
        minimumQuantity: null,
        packageQuantity: null,
        rawPriceText: "60 EUR",
        rawUnitText: "sheet",
        normalizedAmount: 10,
        normalizedPriceBasis: "m2" as const,
        normalizationCalculation: "60 / 6",
        normalizationConfidence: 1,
        observedAt
      }
    });

    const first = await service.createSession(ctx, "project-a", "demos", exactMaterial);
    const firstAttachment = await service.attachSession(first.view.session.id, first.bridgeToken);
    const firstResult = await service.submitCandidate(first.view.session.id, firstAttachment.accessToken, capture(firstAttachment.view.currentItem!.id, "capture-price-1", "2026-07-10T08:00:00.000Z"));
    const firstObservationId = firstResult.view.priceObservations[0]!.id;

    const second = await service.createSession(ctx, "project-a", "demos", [{ ...exactMaterial[0]!, exactLookup: { ...exactMaterial[0]!.exactLookup, requestId: "lookup-price-2" } }]);
    const secondAttachment = await service.attachSession(second.view.session.id, second.bridgeToken);
    const secondResult = await service.submitCandidate(second.view.session.id, secondAttachment.accessToken, capture(secondAttachment.view.currentItem!.id, "capture-price-2", "2026-07-10T08:10:00.000Z"));

    expect(secondResult.view.priceObservations[0]?.id).toBe(firstObservationId);
    await expect(repository.findLatestPriceObservation({ tenantId: "tenant-a", supplierId: "demos", supplierProductCode: "000-BOARD" }))
      .resolves.toMatchObject({ id: firstObservationId, observedAt: "2026-07-10T08:00:00.000Z", lastVerifiedAt: "2026-07-10T08:10:00.000Z" });
  });
});
