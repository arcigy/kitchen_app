import { describe, expect, it } from "vitest";
import { createPinoSideCabinetTenantPackage } from "./pinoSideCabinet";

describe("PINO side cabinet tenant package", () => {
  it("exposes grouped catalog selection and kitchen placement metadata", () => {
    const modulePackage = createPinoSideCabinetTenantPackage();
    const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
    const groupId = modulePackage.parameters.parameters.find((parameter) => parameter.key === "groupId");
    const placementZone = modulePackage.parameters.parameters.find((parameter) => parameter.key === "placementZone");
    const binding = modulePackage.behavior?.contextBindings?.[0];

    expect(modulePackage.module.moduleType).toBe("pino_side_cabinet");
    expect(modulePackage.placement.allowedContexts).toContain("kitchen_wall");
    expect(modulePackage.placement.allowedContexts).toContain("appliance_zone");
    expect([...parameterKeys]).toEqual(
      expect.arrayContaining(["groupId", "definitionId", "articleCode", "catalogKey", "width", "handleComponentId", "hingeComponentId", "runnerComponentId"])
    );
    expect(groupId?.type).toBe("select");
    expect(groupId?.options?.length).toBeGreaterThanOrEqual(5);
    expect(placementZone?.defaultValue).toBe("tall");
    expect(binding?.contextType).toBe("kitchenGroup");
    expect(binding?.parameterSync?.map((rule) => rule.targetParameter)).toEqual(expect.arrayContaining(["depth", "plinthHeight"]));
    expect(binding?.componentSync?.map((rule) => rule.targetParameter)).toEqual(expect.arrayContaining(["handleComponentId"]));
  });
});
