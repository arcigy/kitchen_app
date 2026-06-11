import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeElement, installFakeDocument } from "../../app/testUtils/propertiesPanelHarness";
import { createProjectExitDialogElement } from "./projectExitGuard";

describe("project exit guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates exit dialog action buttons with current labels and choices", () => {
    installFakeDocument();
    const onChoose = vi.fn();

    const { overlay, saveButton } = createProjectExitDialogElement(onChoose);
    const dialog = (overlay as unknown as FakeElement).children[0]!;
    const actions = dialog.children[2]!;
    const [cancelButton, discardButton, createdSaveButton] = actions.children;

    expect(dialog.className).toBe("project-exit-dialog");
    expect(dialog.attributes.get("role")).toBe("dialog");
    expect(dialog.attributes.get("aria-modal")).toBe("true");
    expect(dialog.attributes.get("aria-label")).toBe("Zatvorit projekt");
    expect(cancelButton.textContent).toBe("Zrusit");
    expect(cancelButton.type).toBe("button");
    expect(cancelButton.dataset.projectExit).toBe("cancel");
    expect(discardButton.textContent).toBe("Zavriet bez ulozenia");
    expect(discardButton.type).toBe("button");
    expect(discardButton.dataset.projectExit).toBe("discard");
    expect(createdSaveButton).toBe(saveButton as unknown as FakeElement);
    expect(createdSaveButton.textContent).toBe("Ulozit a zavriet");
    expect(createdSaveButton.type).toBe("button");
    expect(createdSaveButton.dataset.projectExit).toBe("save");

    cancelButton.click();
    discardButton.click();
    createdSaveButton.click();

    expect(onChoose).toHaveBeenNthCalledWith(1, "cancel");
    expect(onChoose).toHaveBeenNthCalledWith(2, "discard");
    expect(onChoose).toHaveBeenNthCalledWith(3, "save");
  });
});
