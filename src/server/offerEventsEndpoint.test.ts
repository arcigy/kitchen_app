import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../core/client/client-context";
import { createInMemoryClientEventRepository } from "../core/client-events/client-event-repository";
import type { ProjectRepository } from "../core/project/project-repository";
import type { ProjectMetadata } from "../core/project/project-types";
import { handleOfferEventsApi } from "./offerEventsEndpoint";

const owner = { clientId: "client_a", userId: "user-1", role: "owner" } as ClientContext;
const viewer = { ...owner, userId: "user-2", role: "viewer" } as ClientContext;

function project(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    version: 1,
    clientId: "client_a",
    projectId: "kitchen-1",
    name: "Kuchyňa",
    location: { address: "Ulica 1" },
    contact: { name: "Zákazník" },
    status: "draft",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    activePhaseId: "phase-1",
    phases: ["phase-1"],
    phaseDetails: [],
    ...overrides
  };
}

function fakeProjects(initial: ProjectMetadata | null) {
  let stored = initial;
  const repository = {
    getProject: vi.fn(async (_ctx: ClientContext, projectId: string) => {
      if (!stored || stored.projectId !== projectId) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return structuredClone(stored);
    }),
    saveProjectMetadata: vi.fn(async (_ctx: ClientContext, metadata: ProjectMetadata) => {
      stored = structuredClone(metadata);
    })
  } as unknown as ProjectRepository;
  return { repository, current: () => stored };
}

function request(method: string, headers: Record<string, string> = {}): http.IncomingMessage {
  return { method, headers: { cookie: "session=test", ...headers } } as unknown as http.IncomingMessage;
}

function deps(context: ClientContext, projects: ProjectRepository, body: unknown) {
  return {
    projectRoot: "/tmp/unused",
    getContext: vi.fn(async () => context),
    readJsonBody: vi.fn(async () => body),
    sendJson: vi.fn(),
    repository: createInMemoryClientEventRepository(),
    createProjectRepository: () => projects,
    // No catalog in unit tests: the price snapshot degrades to an error note instead of blocking.
    createCatalogRepository: () => { throw new Error("catalog unavailable"); },
    loadClientProfile: async () => null,
    now: () => new Date("2026-10-17T12:00:00.000Z")
  };
}

const eventsUrl = new URL("http://localhost/api/projects/kitchen-1/offer-events");
const statusUrl = new URL("http://localhost/api/projects/kitchen-1/offer-status");

describe("offer events API", () => {
  it("records a generated offer PDF once per idempotency key", async () => {
    const { repository: projects } = fakeProjects(project());
    const context = deps(owner, projects, { type: "offer.pdf_generated" });
    const req = request("POST", { "idempotency-key": "pdf-0001-aaaa-bbbb" });
    await handleOfferEventsApi(req, {} as http.ServerResponse, eventsUrl, context);
    await handleOfferEventsApi(req, {} as http.ServerResponse, eventsUrl, context);

    const events = context.repository.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      clientId: "client_a",
      projectId: "kitchen-1",
      actorUserId: "user-1",
      eventType: "offer.pdf_generated",
      createdAt: "2026-10-17T12:00:00.000Z"
    });
    expect(context.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, { ok: true, recorded: false });
  });

  it("rejects unknown event types, missing idempotency keys and foreign projects", async () => {
    const { repository: projects } = fakeProjects(project());
    const unknown = deps(owner, projects, { type: "offer.approved" });
    await handleOfferEventsApi(request("POST", { "idempotency-key": "k-0001-aaaa-bbbb" }), {} as http.ServerResponse, eventsUrl, unknown);
    expect(unknown.sendJson).toHaveBeenCalledWith(expect.anything(), 400, { ok: false, error: "Unknown offer event type." });

    const noKey = deps(owner, projects, { type: "offer.sheet_generated" });
    await handleOfferEventsApi(request("POST"), {} as http.ServerResponse, eventsUrl, noKey);
    expect(noKey.sendJson).toHaveBeenCalledWith(expect.anything(), 400, { ok: false, error: "Idempotency-Key header is required." });

    const missing = deps(owner, fakeProjects(null).repository, { type: "offer.pdf_generated" });
    await handleOfferEventsApi(request("POST", { "idempotency-key": "k-0002-aaaa-bbbb" }), {} as http.ServerResponse, eventsUrl, missing);
    expect(missing.sendJson).toHaveBeenCalledWith(expect.anything(), 404, { ok: false, error: "Project not found." });
    expect([...unknown.repository.list(), ...noKey.repository.list(), ...missing.repository.list()]).toHaveLength(0);
  });

  it("marks an offer as sent, keeps the status idempotent and records a revert", async () => {
    const fake = fakeProjects(project());
    const send = deps(owner, fake.repository, { sent: true });
    await handleOfferEventsApi(request("PUT"), {} as http.ServerResponse, statusUrl, send);
    expect(fake.current()).toMatchObject({ status: "sent", updatedByUserId: "user-1", updatedAt: "2026-10-17T12:00:00.000Z" });
    const [sentEvent] = send.repository.list();
    expect(sentEvent).toMatchObject({ eventType: "offer.marked_sent", phaseId: "phase-1" });
    expect(sentEvent.data).toMatchObject({ priceError: "catalog unavailable" });

    // Marking an already sent offer again changes nothing.
    await handleOfferEventsApi(request("PUT"), {} as http.ServerResponse, statusUrl, send);
    expect(send.repository.list()).toHaveLength(1);

    const revert = deps(owner, fake.repository, { sent: false });
    await handleOfferEventsApi(request("PUT"), {} as http.ServerResponse, statusUrl, revert);
    expect(fake.current()?.status).toBe("draft");
    expect(revert.repository.list().map((event) => event.eventType)).toEqual(["offer.sent_reverted"]);
  });

  it("does not let a viewer change the offer status", async () => {
    const fake = fakeProjects(project());
    const context = deps(viewer, fake.repository, { sent: true });
    await handleOfferEventsApi(request("PUT"), {} as http.ServerResponse, statusUrl, context);
    expect(context.sendJson).toHaveBeenCalledWith(expect.anything(), 403, { ok: false, error: "Viewer role cannot change the offer status." });
    expect(fake.current()?.status).toBe("draft");
    expect(context.repository.list()).toHaveLength(0);
  });

  it("ignores other project routes", async () => {
    const context = deps(owner, fakeProjects(project()).repository, {});
    await expect(handleOfferEventsApi(request("GET"), {} as http.ServerResponse, new URL("http://localhost/api/projects/kitchen-1"), context)).resolves.toBe(false);
    expect(context.getContext).not.toHaveBeenCalled();
  });
});
