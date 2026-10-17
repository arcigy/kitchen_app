// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createOfferSentButton, type PanelOfferTracking } from "./offerSentButton";

function tracking(status: string | null, setSent: PanelOfferTracking["setSent"]): PanelOfferTracking {
  return {
    currentProject: () => (status === null ? null : { status }),
    recordExport: vi.fn(async () => true),
    setSent
  };
}

describe("offer sent button", () => {
  it("is not shown without an open project", () => {
    expect(createOfferSentButton(tracking(null, vi.fn()))).toBeNull();
  });

  it("marks the offer as sent and lets the user undo it", async () => {
    let status = "draft";
    const setSent = vi.fn(async (sent: boolean) => {
      status = sent ? "sent" : "draft";
      return { status };
    });
    const button = createOfferSentButton(tracking(status, setSent))!;
    expect(button.textContent).toBe("Označiť ako odoslanú");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Odoslaná zákazníkovi ✓"));
    expect(setSent).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Označiť ako odoslanú"));
    expect(setSent).toHaveBeenLastCalledWith(false);
  });

  it("keeps the state and tells the user when saving fails", async () => {
    const button = createOfferSentButton(tracking("sent", vi.fn(async () => { throw new Error("offline"); })))!;
    expect(button.textContent).toBe("Odoslaná zákazníkovi ✓");
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Nepodarilo sa uložiť, skúste znova"));
    expect(button.disabled).toBe(false);
  });
});
