import type { ClientProfile, FeatureReleaseSettings } from "../client/client-types";

const FEATURE_KEY = /^[a-z][a-z0-9-]{2,80}$/u;

export function normalizeFeatureRelease(value: unknown, fallbackChannel: FeatureReleaseSettings["channel"] = "stable"): FeatureReleaseSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const channel = record.channel === "founder" ? "founder" : fallbackChannel;
  const enabledFeatures = Array.isArray(record.enabledFeatures)
    ? [...new Set(record.enabledFeatures.filter((item): item is string => typeof item === "string" && FEATURE_KEY.test(item)))].sort()
    : [];
  return { channel, enabledFeatures };
}

export function isFeatureEnabled(profile: ClientProfile, userId: string, featureKey: string): boolean {
  if (!FEATURE_KEY.test(featureKey)) return false;
  const userRelease = profile.organization.users.find((user) => user.id === userId)?.release;
  return Boolean(userRelease?.enabledFeatures.includes(featureKey) || profile.release?.enabledFeatures.includes(featureKey));
}

export function effectiveFeatureRelease(profile: ClientProfile, userId: string): FeatureReleaseSettings {
  const userRelease = profile.organization.users.find((user) => user.id === userId)?.release;
  return normalizeFeatureRelease({
    channel: userRelease?.channel ?? profile.release?.channel,
    enabledFeatures: [...(profile.release?.enabledFeatures ?? []), ...(userRelease?.enabledFeatures ?? [])]
  }, profile.release?.channel ?? "stable");
}
