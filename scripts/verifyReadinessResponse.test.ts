import { describe, expect, it } from "vitest";
import { verifyDeploymentReadinessResponse } from "./verifyReadinessResponse";

describe("deployment readiness response verification", () => {
  it("accepts the health and PostgreSQL readiness contracts", () => {
    expect(() => verifyDeploymentReadinessResponse("health", '{"ok":true}')).not.toThrow();
    expect(() => verifyDeploymentReadinessResponse("ready", '{"ok":true,"storage":"postgres","latencyMs":31}')).not.toThrow();
  });

  it("rejects a successful HTML fallback or an unsafe readiness contract", () => {
    expect(() => verifyDeploymentReadinessResponse("ready", "<!doctype html><html></html>"))
      .toThrow("/ready did not return JSON");
    expect(() => verifyDeploymentReadinessResponse("ready", '{"ok":true,"storage":"file","latencyMs":0}'))
      .toThrow("PostgreSQL storage");
    expect(() => verifyDeploymentReadinessResponse("ready", '{"ok":true,"storage":"postgres","latencyMs":999999}'))
      .toThrow("bounded database latency");
  });
});
