import { describe, expect, it, vi } from "vitest";
import { createCompanyLanguageController } from "./companyLanguageController";

describe("companyLanguageController", () => {
  it("persists the selected language without a page reload", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const controller = createCompanyLanguageController({ initialLanguage: "sk", fetchFn });

    await controller.changeLanguage("cs");

    expect(fetchFn).toHaveBeenCalledWith("/api/client/profile/language", expect.objectContaining({ method: "PATCH" }));
  });

  it("restores the prior local language when persistence fails", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 403 }));
    const onPersistenceError = vi.fn();
    const controller = createCompanyLanguageController({ initialLanguage: "en", fetchFn, onPersistenceError });

    await expect(controller.changeLanguage("cs")).rejects.toThrow("Company language update failed");

    expect(onPersistenceError).toHaveBeenCalledOnce();
  });
});
