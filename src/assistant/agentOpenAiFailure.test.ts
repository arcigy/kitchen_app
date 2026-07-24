import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchExternalTextMock } = vi.hoisted(() => ({ fetchExternalTextMock: vi.fn() }));
vi.mock("../server/external-http", () => ({ fetchExternalText: fetchExternalTextMock }));

import { runAssistantTurn } from "./agent";
import type { AssistantClientContext } from "./types";

const clientContext: AssistantClientContext = {
  projectId: "project_a",
  phaseId: "phase_a",
  viewMode: "2d",
  activeViewerTab: "floorplan",
  layoutTool: "select",
  selectedKind: null,
  selectedKitchenGroupId: null,
  activeKitchenGroupId: null,
  selectedInstanceIds: [],
  selectedWallIds: [],
  selectedParams: [],
  catalogSummary: { materialCount: 2, componentCount: 1, moduleCount: 4, moduleTypes: ["drawer_low"] }
};

afterEach(() => {
  delete process.env.OPENAI_ASSISTANT_TEST_LIVE;
  delete process.env.OPENAI_API_KEY;
  fetchExternalTextMock.mockReset();
});

describe("assistant OpenAI provider failures", () => {
  it("shows a quota message instead of unrelated RAG content", async () => {
    process.env.OPENAI_ASSISTANT_TEST_LIVE = "true";
    process.env.OPENAI_API_KEY = "test-only-key";
    fetchExternalTextMock.mockResolvedValue({
      response: { ok: false, status: 429 },
      text: JSON.stringify({
        error: {
          message: "provider detail",
          code: "insufficient_quota"
        }
      })
    });

    const response = await runAssistantTurn({
      message: "Aká je presná aktuálna cena tohto projektu podľa BOM?",
      clientContext,
      ragChunks: [{
        id: "unrelated",
        source: "docs/module-package.md",
        title: "Module package",
        text: "Unrelated module package content.",
        tags: ["modules"],
        updatedAt: "2026-07-23T00:00:00.000Z"
      }]
    });

    expect(response).toMatchObject({
      ok: true,
      phase: "failed",
      toolCalls: [],
      plan: null,
      requiresConfirmation: false
    });
    expect(response.assistantMessage).toContain("AI služba nie je dostupná");
    expect(response.assistantMessage).toContain("vyčerpanú kvótu");
    expect(response.assistantMessage).not.toContain("Unrelated module package content");
    expect(response.ragSources).toEqual([]);
  });
});
