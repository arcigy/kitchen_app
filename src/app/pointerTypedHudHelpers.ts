export type PointerTypedHudElement = {
  textContent: string | null;
  style: {
    display: string;
    left: string;
    top: string;
  };
};

export function updatePointerTypedHud(
  hud: PointerTypedHudElement,
  typedMm: string,
  point: { x: number; y: number }
): boolean {
  if (typedMm.trim().length === 0) {
    hud.style.display = "none";
    return false;
  }

  hud.textContent = `${typedMm} mm`;
  hud.style.left = `${point.x}px`;
  hud.style.top = `${point.y}px`;
  hud.style.display = "block";
  return true;
}

export function applyTypedMillimeterKey(
  typedMm: string,
  key: string,
  maxLength = 8
): { handled: boolean; typedMm: string; changed: boolean } {
  const isDigit = key.length === 1 && key >= "0" && key <= "9";
  if (isDigit) {
    return {
      handled: true,
      typedMm: `${typedMm}${key}`.slice(0, maxLength),
      changed: typedMm.length < maxLength
    };
  }

  if (key === "Backspace") {
    const nextTypedMm = typedMm.slice(0, Math.max(0, typedMm.length - 1));
    return {
      handled: true,
      typedMm: nextTypedMm,
      changed: nextTypedMm !== typedMm
    };
  }

  return { handled: false, typedMm, changed: false };
}
