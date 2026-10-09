// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { CreateProjectRequest } from "../../app/project/projectApi";
import { openCreateProjectDialog } from "./createProjectDialog";

describe("create project dialog", () => {
  it("submits with only the project name and marks no other field as required", async () => {
    const onCreate = vi.fn(async (_input: CreateProjectRequest) => undefined);
    openCreateProjectDialog({ onCreate });
    const form = document.querySelector<HTMLFormElement>(".project-dialog");
    const inputs = form?.querySelectorAll<HTMLInputElement>("input");
    if (!form || !inputs?.length) throw new Error("Create project dialog did not render.");

    expect([...inputs].map((input) => input.required)).toEqual([true, false, false, false, false, false, false, false, false]);
    inputs[0]!.value = "Minimal project";
    form.requestSubmit();

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith({
      name: "Minimal project",
      address: "",
      city: "",
      postalCode: "",
      country: "",
      contactName: "",
      email: "",
      phone: "",
      notes: ""
    });
  });
});
