import { describe, expect, it } from "vitest";
import { getVendorPreferredPlacementContext, hasVendorPlacementRules, validateVendorPlacementCandidate } from "./vendorPlacementRules";

describe("vendorPlacementRules", () => {
  it("prefers appliance zone for tall appliance vendor modules", () => {
    const params = {
      kitchenModuleRole: "tall",
      vendorPlacementZone: "tall_appliance",
      vendorRequiresApplianceOpening: true
    };

    expect(hasVendorPlacementRules(params)).toBe(true);
    expect(getVendorPreferredPlacementContext(params, "kitchen_wall")).toBe("appliance_zone");
    expect(validateVendorPlacementCandidate(params, "appliance_zone").valid).toBe(true);
    expect(validateVendorPlacementCandidate(params, "kitchen_wall")).toMatchObject({
      valid: false,
      errors: ["Vendor module requires an appliance zone placement."]
    });
  });

  it("requires kitchen corner placement for corner-tagged vendor modules", () => {
    const params = {
      kitchenModuleRole: "base",
      vendorPlacementZone: "corner_low",
      vendorRequiresCorner: true
    };

    expect(getVendorPreferredPlacementContext(params, "kitchen_wall")).toBe("kitchen_corner");
    expect(validateVendorPlacementCandidate(params, "kitchen_corner").valid).toBe(true);
    expect(validateVendorPlacementCandidate(params, "kitchen_wall")).toMatchObject({
      valid: false,
      errors: ["Vendor module requires a corner placement."]
    });
  });

  it("keeps wall-attached accessory modules on wall-aligned contexts", () => {
    const params = {
      kitchenModuleRole: "top",
      vendorFeatureTags: ["cover_panel"],
      vendorRequiresWallAttachment: true
    };

    expect(getVendorPreferredPlacementContext(params, "floor")).toBe("kitchen_wall");
    expect(validateVendorPlacementCandidate(params, "kitchen_wall").valid).toBe(true);
    expect(validateVendorPlacementCandidate(params, "floor")).toMatchObject({
      valid: false,
      errors: ["Vendor module must stay attached to a wall-aligned placement."]
    });
  });
});
