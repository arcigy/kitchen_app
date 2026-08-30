import { describe, expect, it } from "vitest";
import type { ClientProfile } from "../client/client-types";
import { effectiveFeatureRelease, isFeatureEnabled, normalizeFeatureRelease } from "./feature-release";

const profile = {
  clientId: "client_arcigy_demo", company: { name: "Arcigy" }, workshop: { address: "x", city: "x", country: "Slovakia" }, contact: {}, branding: {},
  organization: { name: "Arcigy", roles: [], users: [{ id: "branislav", name: "Branislav", position: "Owner", role: "administrator", permissions: [], photoUrl: "x", isActive: true, release: { channel: "founder", enabledFeatures: ["new-editor"] } }] },
  defaults: { currency: "EUR", language: "sk" }, release: { channel: "founder", enabledFeatures: ["shared-preview"] }, createdAt: "2026-01-01", updatedAt: "2026-01-01"
} as ClientProfile;

describe("feature release", () => {
  it("enables a feature only for the selected user or organization", () => {
    expect(isFeatureEnabled(profile, "branislav", "new-editor")).toBe(true);
    expect(isFeatureEnabled(profile, "branislav", "shared-preview")).toBe(true);
    expect(isFeatureEnabled(profile, "other-user", "new-editor")).toBe(false);
    expect(isFeatureEnabled(profile, "branislav", "bad key")).toBe(false);
  });

  it("normalizes malformed release data and merges effective flags", () => {
    expect(normalizeFeatureRelease({ channel: "invalid", enabledFeatures: ["new-editor", "new-editor", "bad key"] })).toEqual({ channel: "stable", enabledFeatures: ["new-editor"] });
    expect(effectiveFeatureRelease(profile, "branislav")).toEqual({ channel: "founder", enabledFeatures: ["new-editor", "shared-preview"] });
  });
});
