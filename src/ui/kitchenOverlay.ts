export function showKitchenOverlay(): () => void {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(59,130,246,0.08)";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "10";
  document.body.appendChild(overlay);

  return () => {
    overlay.remove();
  };
}
