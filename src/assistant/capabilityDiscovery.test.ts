import { describe, expect, it } from "vitest";
import { discoverAssistantCapabilities } from "./capabilityDiscovery";
import { assistantToolMetadataForOrchestrator } from "./toolRegistry";
import type { AssistantClientContext } from "./types";

const context: AssistantClientContext = {
  projectId: "project_1",
  phaseId: null,
  viewMode: "2d",
  activeViewerTab: "floorplan",
  layoutTool: "select",
  selectedKind: null,
  selectedKitchenGroupId: null,
  activeKitchenGroupId: null,
  selectedInstanceIds: [],
  selectedWallIds: [],
  selectedParams: [],
  catalogSummary: { materialCount: 0, componentCount: 0, moduleCount: 0, moduleTypes: [] }
};

describe("assistant capability discovery", () => {
  it("narrows a kitchen request to its capability pack while retaining independent verification", () => {
    const discovery = discoverAssistantCapabilities({
      message: "Vytvor kuchyňu a vypočítaj cenu.",
      clientContext: { ...context, activeKitchenGroupId: "kg_1" },
      availableTools: assistantToolMetadataForOrchestrator()
    });

    expect(discovery.packIds).toContain("kitchen-pricing");
    expect(discovery.toolIds).toContain("kitchen.create");
    expect(discovery.toolIds).toContain("pricing.getSummary");
    expect(discovery.toolIds).toContain("validation.inspectProject");
    expect(discovery.fallbackToFullRegistry).toBe(false);
  });

  it("keeps all registered tools only when no domain can be identified", () => {
    const metadata = assistantToolMetadataForOrchestrator();
    const discovery = discoverAssistantCapabilities({
      message: "Prosím pomôž mi s niečím úplne neznámym.",
      clientContext: context,
      availableTools: metadata
    });

    expect(discovery.fallbackToFullRegistry).toBe(true);
    expect(discovery.toolIds).toHaveLength(metadata.length);
  });
});
