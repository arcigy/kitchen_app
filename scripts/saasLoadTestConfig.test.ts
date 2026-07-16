import { describe, expect, it } from "vitest";
import { resolveSaasLoadTestConfig } from "./saasLoadTestConfig";

const isolated = {
  ALLOW_ARCIGY_LOAD_TEST: "true",
  LOAD_TEST_TARGET_ENV: "isolated"
};

describe("SaaS load test safety config", () => {
  it("refuses to run without both explicit safety acknowledgements", () => {
    expect(() => resolveSaasLoadTestConfig({})).toThrow("ALLOW_ARCIGY_LOAD_TEST");
    expect(() => resolveSaasLoadTestConfig({ ALLOW_ARCIGY_LOAD_TEST: "true" })).toThrow("LOAD_TEST_TARGET_ENV");
  });

  it("defaults to a bounded local health scenario", () => {
    const config = resolveSaasLoadTestConfig(isolated);
    expect(config.baseUrl.origin).toBe("http://127.0.0.1:5180");
    expect(config).toMatchObject({ scenario: "health", concurrency: 10, durationSeconds: 60, rampSeconds: 10 });
  });

  it("refuses remote and known production targets by default", () => {
    expect(() => resolveSaasLoadTestConfig({
      ...isolated,
      LOAD_TEST_BASE_URL: "https://isolated-load.example/"
    })).toThrow("ALLOW_REMOTE_LOAD_TEST");
    expect(() => resolveSaasLoadTestConfig({
      ...isolated,
      ALLOW_REMOTE_LOAD_TEST: "true",
      LOAD_TEST_BASE_URL: "https://arcigy-kitchen-develop.example/"
    })).toThrow("LOAD_TEST_PRODUCTION_CONFIRMATION");
  });

  it("requires credentials and a synthetic project for authenticated scenarios", () => {
    expect(() => resolveSaasLoadTestConfig({ ...isolated, LOAD_TEST_SCENARIO: "project-list" })).toThrow("ARCIGY_LOAD_TEST_USERNAME");
    expect(() => resolveSaasLoadTestConfig({
      ...isolated,
      LOAD_TEST_SCENARIO: "project-open",
      ARCIGY_LOAD_TEST_USERNAME: "load-user",
      ARCIGY_LOAD_TEST_PASSWORD: "secret"
    })).toThrow("ARCIGY_LOAD_TEST_PROJECT_ID");
  });

  it("validates workload bounds", () => {
    expect(() => resolveSaasLoadTestConfig({ ...isolated, LOAD_TEST_CONCURRENCY: "5001" })).toThrow("LOAD_TEST_CONCURRENCY");
    expect(() => resolveSaasLoadTestConfig({ ...isolated, LOAD_TEST_ERROR_RATE_THRESHOLD: "1.1" })).toThrow("LOAD_TEST_ERROR_RATE_THRESHOLD");
  });
});

