import { describe, expect, it } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createProjectMetadata } from "./project-metadata";
import { assertValidCreateProjectInput, assertValidProjectMetadata } from "./project-validation";

const client: ClientContext = { userId: "user_test", clientId: "client_test", role: "owner" };

describe("project creation input", () => {
  it("requires only the project name and canonicalizes omitted contact and location details", () => {
    const input = { name: "  Minimal project  ", location: {}, contact: {} };

    expect(() => assertValidCreateProjectInput(input)).not.toThrow();

    const project = createProjectMetadata(client, input);
    expect(project.name).toBe("Minimal project");
    expect(project.location).toEqual({ address: "" });
    expect(project.contact).toEqual({ name: "" });
    expect(() => assertValidProjectMetadata(project)).not.toThrow();
  });

  it("rejects a blank project name but accepts optional address and contact details", () => {
    expect(() => assertValidCreateProjectInput({ name: " \t", location: {}, contact: {} })).toThrow("project name is required.");
  });

  it("still validates an email when the optional email field is supplied", () => {
    expect(() => assertValidCreateProjectInput({
      name: "Minimal project",
      location: {},
      contact: { email: "not-an-email" }
    })).toThrow("project contact email is invalid.");
  });
});
