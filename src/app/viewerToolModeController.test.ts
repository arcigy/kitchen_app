// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createViewerToolModeController } from "./viewerToolModeController";

it("keeps the grab cursor through render synchronization and restores the tool cursor after a drag", () => {
  const canvasEl = document.createElement("canvas");
  let drag: "pending" | "dragging" | null = "pending";
  const controller = createViewerToolModeController({ canvasEl, getInsertMode: () => false,
    getObjectDragState: () => drag, syncNavigationControls: vi.fn() });
  controller.syncCursor();
  expect(canvasEl.style.cursor.endsWith("grab")).toBe(true);
  drag = "dragging";
  controller.syncCursor();
  controller.syncCursor();
  expect(canvasEl.style.cursor.endsWith("grabbing")).toBe(true);
  drag = null;
  controller.syncCursor();
  expect(canvasEl.style.cursor.endsWith("default")).toBe(true);
});
