import { describe, expect, it } from "vitest";
import { layoutBacksplashCuts, type BacksplashCutPart, type BacksplashStock } from "./backsplashCutLayout";
const stock: BacksplashStock = { lengthMm: 2800, widthMm: 1300, allowHalf: true, kerfMm: 3 };
const part = (id: string, lengthMm: number, widthMm: number, grain: BacksplashCutPart["grain"] = "length"): BacksplashCutPart => ({ id, lengthMm, widthMm, grain });

function verify(parts: BacksplashCutPart[], spec = stock) {
  const result = layoutBacksplashCuts(parts, spec);
  const placed = result.sheets.flatMap(sheet => sheet.placements);
  expect([...placed.map(item => item.partId), ...result.errors.map(item => item.partId)].sort()).toEqual(parts.map(item => item.id).sort());
  for (const sheet of result.sheets) {
    expect(sheet.lengthMm).toBe(spec.lengthMm * sheet.fraction); expect(sheet.widthMm).toBe(spec.widthMm);
    for (const a of sheet.placements) {
      const source = parts.find(part => part.id === a.partId)!;
      expect([a.lengthMm, a.widthMm]).toEqual(a.rotated ? [source.widthMm, source.lengthMm] : [source.lengthMm, source.widthMm]);
      if (source.grain !== "free") expect(a.rotated).toBe(source.grain === "width");
      expect(a.xMm).toBeGreaterThanOrEqual(0); expect(a.yMm).toBeGreaterThanOrEqual(0);
      expect(a.xMm + a.lengthMm).toBeLessThanOrEqual(sheet.lengthMm + 0.000001);
      expect(a.yMm + a.widthMm).toBeLessThanOrEqual(sheet.widthMm + 0.000001);
      for (const b of sheet.placements.filter(b => b !== a)) expect(
        a.xMm + a.lengthMm + spec.kerfMm <= b.xMm + 0.000001 || b.xMm + b.lengthMm + spec.kerfMm <= a.xMm + 0.000001
        || a.yMm + a.widthMm + spec.kerfMm <= b.yMm + 0.000001 || b.yMm + b.widthMm + spec.kerfMm <= a.yMm + 0.000001
      ).toBe(true);
    }
  }
  expect(result.purchasedPieces).toBe(result.sheets.reduce((sum, sheet) => sum + sheet.fraction, 0));
  expect(result.purchasedAreaM2).toBeCloseTo(result.sheets.reduce((sum, sheet) => sum + sheet.lengthMm * sheet.widthMm / 1e6, 0));
  return result;
}
describe("backsplash stock cutting", () => {
  it("shares one half-length/full-width format between multiple parts", () => {
    expect(verify([part("a", 1200, 600), part("b", 1200, 600)]).purchasedPieces).toBe(0.5);
  });
  it("shares a whole format and does not charge a separate blank for every piece", () => {
    expect(verify([part("a", 1800, 600), part("b", 1800, 600)]).purchasedPieces).toBe(1);
  });
  it("accounts for the saw kerf, while allowing a blank exactly as large as the format", () => {
    expect(verify([part("a", 2800, 1300)]).purchasedPieces).toBe(1);
    expect(verify([part("a", 1400, 650), part("b", 1400, 650)]).purchasedPieces).toBe(1);
    expect(verify([part("a", 1400, 650), part("b", 1400, 650)], { ...stock, allowHalf: false }).purchasedPieces).toBe(2);
    expect(verify([part("a", 1400, 650), part("b", 1400, 650)], { ...stock, kerfMm: 0 }).purchasedPieces).toBe(0.5);
  });
  it("only rotates when permitted by the decor and reports oversize or missing formats", () => {
    const result = verify([part("fixed", 1200, 1800), part("free", 1200, 1800, "free")]);
    expect(result.errors.map(error => error.partId)).toEqual(["fixed"]);
    expect(layoutBacksplashCuts([part("x", 100, 100)], { ...stock, widthMm: 0 }).errors).toHaveLength(1);
  });
  it("is deterministic regardless of source order and places every part once without overlap", () => {
    const parts = Array.from({ length: 35 }, (_, i) => part(`p${i}`, 240 + i * 23, 150 + (i % 7) * 45, i % 3 ? "length" : "free"));
    expect(verify(parts)).toEqual(verify([...parts].reverse()));
  });
});
