import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeElement, installFakeDocument } from "../../app/testUtils/propertiesPanelHarness";
import {
  createProjectDeleteActionButton,
  createProjectDeleteDialog,
  createProjectVersionActionButton,
  dispatchProjectSelection
} from "./projectManager";

function findByText(root: FakeElement, text: string): FakeElement | null {
  if (root.textContent === text) return root;
  for (const child of root.children) {
    const match = findByText(child, text);
    if (match) return match;
  }
  return null;
}

describe("project manager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates project version action buttons with current text button behavior", () => {
    installFakeDocument();

    const button = createProjectVersionActionButton("Pozriet") as unknown as FakeElement;

    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Pozriet");
  });

  it("waits for workspace startup and propagates startup failures to the caller", async () => {
    let finishStartup: (() => void) | undefined;
    const startup = new Promise<void>((resolve) => {
      finishStartup = resolve;
    });
    const onSelect = vi.fn(async () => startup);
    const pending = dispatchProjectSelection(onSelect, { kind: "blank" });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(onSelect).toHaveBeenCalledWith({ kind: "blank" });
    expect(settled).toBe(false);

    finishStartup?.();
    await expect(pending).resolves.toBeUndefined();
    await expect(dispatchProjectSelection(async () => {
      throw new Error("Catalog load failed");
    }, { kind: "blank" })).rejects.toThrow("Catalog load failed");
  });

  it("opens the custom delete flow without using a native browser confirmation", () => {
    installFakeDocument();
    const onDelete = vi.fn();
    const button = createProjectDeleteActionButton(onDelete) as unknown as FakeElement;

    button.click();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(button.classList.contains("project-manager-project-menu-danger")).toBe(true);
  });

  it("uses an Arcigy modal and deletes only after its destructive action is clicked", async () => {
    installFakeDocument();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const dialog = createProjectDeleteDialog("Kitchen A", onConfirm) as unknown as FakeElement;
    const confirm = findByText(dialog, "Áno, odstrániť projekt");
    const cancel = findByText(dialog, "Zrušiť");

    expect(dialog.className).toBe("project-delete-overlay");
    expect(findByText(dialog, "Kitchen A")).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toBeNull();
    expect(cancel).not.toBeNull();

    confirm?.click();
    await vi.waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
