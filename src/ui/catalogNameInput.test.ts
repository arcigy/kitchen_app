// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createCatalogNameInput } from "./catalogNameInput";

afterEach(() => document.body.replaceChildren());
const choices = [{ id: "mat.one", displayName: "Biela doska" }, { id: "mat.two", displayName: "Dubová doska" }];

it("shows one human label and commits the catalog ID after a valid name selection", async () => {
  const onChange = vi.fn();
  const field = createCatalogNameInput({ value: "mat.one", choices, lookup: vi.fn(), onChange, placeholder: "Materiál" });
  document.body.append(field);
  const input = field.querySelector("input")!;
  expect(input.value).toBe("Biela doska");
  expect(field.querySelector("small")!.hidden).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  input.value = "Dubová doska";
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith("mat.two"));
  expect(input.value).toBe("Dubová doska");
});

it("restores the previous name on an invalid choice and never changes its saved ID", async () => {
  const onChange = vi.fn();
  const lookup = vi.fn(async () => null);
  const field = createCatalogNameInput({ value: "mat.one", choices, lookup, onChange, placeholder: "Materiál" });
  const input = field.querySelector("input")!;
  input.value = "neexistuje";
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(input.value).toBe("Biela doska"));
  expect(onChange).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
  expect(field.textContent).toContain("Pôvodný výber zostal zachovaný");
});

it("preserves an unavailable saved ID without requesting it or exposing internal IDs", () => {
  const onChange = vi.fn();
  const lookup = vi.fn();
  const field = createCatalogNameInput({ value: "mat.remote", choices, lookup, onChange, placeholder: "Materiál" });
  expect(field.querySelector("input")!.value).toBe("");
  expect(field.textContent).toContain("Výber zostal zachovaný");
  expect(field.textContent).not.toContain("mat.remote");
  expect(lookup).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it("does not replace a newer edit with a slow lookup response", async () => {
  let resolve!: (choice: { id: string; displayName: string }) => void;
  const onChange = vi.fn();
  const field = createCatalogNameInput({ value: "mat.remote", choices, lookup: () => new Promise(done => { resolve = done; }), onChange, placeholder: "Materiál" });
  const input = field.querySelector("input")!;
  input.value = "mat.remote";
  input.dispatchEvent(new Event("change"));
  input.value = "Dubová doska";
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new Event("change"));
  resolve({ id: "mat.remote", displayName: "Stará doska" });
  await Promise.resolve();
  expect(input.value).toBe("Dubová doska");
  expect(onChange).toHaveBeenCalledExactlyOnceWith("mat.two");
});

it("resolves an explicitly requested remote choice before committing its ID", async () => {
  const onChange = vi.fn();
  const field = createCatalogNameInput({ value: "mat.one", choices, lookup: async () => ({ id: "mat.remote", displayName: "Vzdialená doska" }), onChange, placeholder: "Materiál" });
  const input = field.querySelector("input")!;
  input.value = "mat.remote";
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(input.value).toBe("Vzdialená doska"));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("mat.remote");
});

it("does not arbitrarily choose between distinct materials with the same display name", () => {
  const onChange = vi.fn();
  const field = createCatalogNameInput({ value: "mat.one", choices: [...choices, { id: "mat.three", displayName: "Dubová doska" }], lookup: vi.fn(), onChange, placeholder: "Materiál" });
  const input = field.querySelector("input")!;
  input.value = "Dubová doska";
  input.dispatchEvent(new Event("change"));
  expect(input.value).toBe("Biela doska");
  expect(onChange).not.toHaveBeenCalled();
  expect(field.textContent).toContain("Názov nie je jednoznačný");
});
