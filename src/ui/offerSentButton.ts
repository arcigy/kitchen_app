/** Offer tracking as seen by the pricing panel; implemented by src/app/project/offerTracking.ts. */
export type PanelOfferTracking = {
  currentProject(): { status: string } | null;
  recordExport(kind: "pdf" | "sheet"): Promise<unknown>;
  setSent(sent: boolean): Promise<{ status: string }>;
};

const LABEL_NOT_SENT = "Označiť ako odoslanú";
const LABEL_SENT = "Odoslaná zákazníkovi ✓";

/**
 * Toggle that marks the open project's offer as sent to the end customer (and back, for mistakes).
 * Returns null when no project is open, because the status lives on the project.
 */
export function createOfferSentButton(tracking: PanelOfferTracking): HTMLButtonElement | null {
  const project = tracking.currentProject();
  if (!project) return null;
  let sent = project.status === "sent";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bom-dev__button bom-dev__button--secondary";
  button.dataset.offerSent = "";
  const paint = () => {
    button.textContent = sent ? LABEL_SENT : LABEL_NOT_SENT;
    button.setAttribute("aria-pressed", String(sent));
    button.title = sent
      ? "Ponuka je označená ako odoslaná zákazníkovi. Kliknutím označenie zrušíte."
      : "Označí ponuku tohto projektu ako odoslanú zákazníkovi.";
  };
  paint();
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const updated = await tracking.setSent(!sent);
      sent = updated.status === "sent";
      paint();
    } catch {
      button.textContent = "Nepodarilo sa uložiť, skúste znova";
    } finally {
      button.disabled = false;
    }
  });
  return button;
}
