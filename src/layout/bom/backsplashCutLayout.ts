export type BacksplashCutPart = { id: string; lengthMm: number; widthMm: number; grain: "length" | "width" | "free" };
export type BacksplashStock = { lengthMm: number; widthMm: number; allowHalf: boolean; kerfMm: number };
export type BacksplashCutPlacement = { partId: string; xMm: number; yMm: number; lengthMm: number; widthMm: number; rotated: boolean };
export type BacksplashCutSheet = { id: string; fraction: 1 | 0.5; lengthMm: number; widthMm: number; placements: BacksplashCutPlacement[] };
export type BacksplashCutLayout = { sheets: BacksplashCutSheet[]; purchasedPieces: number; purchasedAreaM2: number; errors: Array<{ partId: string; message: string }> };
type Rect = { x: number; y: number; w: number; h: number };
type Bin = { sheet: BacksplashCutSheet; free: Rect[] };
const EPS = 1e-6;

function orientations(part: BacksplashCutPart) {
  return (part.grain === "length" ? [false] : part.grain === "width" ? [true] : [false, true]).map(rotated => ({
    rotated, w: rotated ? part.widthMm : part.lengthMm, h: rotated ? part.lengthMm : part.widthMm
  }));
}
function contains(a: Rect, b: Rect): boolean { return a.x <= b.x + EPS && a.y <= b.y + EPS && a.x + a.w >= b.x + b.w - EPS && a.y + a.h >= b.y + b.h - EPS; }
function reserve(bin: Bin, used: Rect): void {
  const free = bin.free.flatMap(rect => {
    if (used.x >= rect.x + rect.w - EPS || used.x + used.w <= rect.x + EPS || used.y >= rect.y + rect.h - EPS || used.y + used.h <= rect.y + EPS) return [rect];
    const pieces: Rect[] = [];
    if (used.x > rect.x) pieces.push({ ...rect, w: used.x - rect.x });
    if (used.x + used.w < rect.x + rect.w) pieces.push({ ...rect, x: used.x + used.w, w: rect.x + rect.w - used.x - used.w });
    if (used.y > rect.y) pieces.push({ ...rect, h: used.y - rect.y });
    if (used.y + used.h < rect.y + rect.h) pieces.push({ ...rect, y: used.y + used.h, h: rect.y + rect.h - used.y - used.h });
    return pieces;
  }).filter(rect => rect.w > EPS && rect.h > EPS);
  bin.free = free.filter((rect, index) => !free.some((other, otherIndex) => otherIndex !== index && contains(other, rect)
    && (!contains(rect, other) || otherIndex < index)));
}
function candidate(bin: Bin, part: BacksplashCutPart, kerf: number) {
  return bin.free.flatMap(rect => orientations(part).filter(orientation => orientation.w + kerf <= rect.w + EPS && orientation.h + kerf <= rect.h + EPS)
    .map(orientation => ({ ...orientation, rect, score: Math.min(rect.w - orientation.w - kerf, rect.h - orientation.h - kerf) })))
    .sort((a, b) => a.score - b.score || a.rect.y - b.rect.y || a.rect.x - b.rect.x || Number(a.rotated) - Number(b.rotated))[0];
}
function pack(parts: readonly BacksplashCutPart[], stock: BacksplashStock, halfFirst: boolean): BacksplashCutSheet[] {
  const bins: Bin[] = [];
  for (const part of parts) {
    let chosen = bins.flatMap(bin => { const fit = candidate(bin, part, stock.kerfMm); return fit ? [{ bin, fit }] : []; })
      .sort((a, b) => a.fit.score - b.fit.score || a.bin.sheet.id.localeCompare(b.bin.sheet.id))[0];
    if (!chosen) {
      const fractions: Array<1 | 0.5> = stock.allowHalf && halfFirst ? [0.5, 1] : [1];
      for (const fraction of fractions) {
        const bin: Bin = { sheet: { id: `stock-${bins.length + 1}`, fraction, lengthMm: stock.lengthMm * fraction,
          widthMm: stock.widthMm, placements: [] }, free: [{ x: 0, y: 0, w: stock.lengthMm * fraction + stock.kerfMm, h: stock.widthMm + stock.kerfMm }] };
        const fit = candidate(bin, part, stock.kerfMm);
        if (fit) { bins.push(bin); chosen = { bin, fit }; break; }
      }
    }
    if (!chosen) throw new Error(`Unexpected unplaceable part ${part.id}.`);
    const { bin, fit } = chosen;
    bin.sheet.placements.push({ partId: part.id, xMm: fit.rect.x, yMm: fit.rect.y, lengthMm: fit.w, widthMm: fit.h, rotated: fit.rotated });
    reserve(bin, { x: fit.rect.x, y: fit.rect.y, w: fit.w + stock.kerfMm, h: fit.h + stock.kerfMm });
  }
  for (const { sheet } of bins) if (stock.allowHalf && sheet.fraction === 1 && sheet.placements.every(part => part.xMm + part.lengthMm <= stock.lengthMm / 2 + EPS)) {
    sheet.fraction = 0.5; sheet.lengthMm = stock.lengthMm / 2;
  }
  return bins.map(bin => bin.sheet);
}

/** Deterministic verified placement, with shared offcuts and no area-only purchasing estimate. */
export function layoutBacksplashCuts(parts: readonly BacksplashCutPart[], stock: BacksplashStock): BacksplashCutLayout {
  const errors: BacksplashCutLayout["errors"] = [];
  if (![stock.lengthMm, stock.widthMm].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(stock.kerfMm) || stock.kerfMm < 0) return { sheets: [], purchasedPieces: 0, purchasedAreaM2: 0,
    errors: parts.map(part => ({ partId: part.id, message: "Chýba platný nákupný formát alebo šírka rezu zásteny." })) };
  const ids = new Set<string>();
  const valid = parts.filter(part => {
    if (ids.has(part.id)) throw new Error(`Duplicate cut part ${part.id}.`);
    ids.add(part.id);
    const fits = [part.lengthMm, part.widthMm].every(value => Number.isFinite(value) && value > 0)
      && orientations(part).some(({ w, h }) => w <= stock.lengthMm + EPS && h <= stock.widthMm + EPS);
    if (!fits) errors.push({ partId: part.id, message: `Dielec ${part.id} sa nezmestí do nákupného formátu pri zadanom smere dekoru.` });
    return fits;
  });
  const orders = [
    (p: BacksplashCutPart) => p.lengthMm * p.widthMm,
    (p: BacksplashCutPart) => Math.max(p.lengthMm, p.widthMm),
    (p: BacksplashCutPart) => p.lengthMm
  ];
  const candidates = orders.flatMap(score => {
    const ordered = [...valid].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    return [pack(ordered, stock, false), ...(stock.allowHalf ? [pack(ordered, stock, true)] : [])];
  });
  const pieces = (sheets: BacksplashCutSheet[]) => sheets.reduce((sum, sheet) => sum + sheet.fraction, 0);
  const sheets = candidates.sort((a, b) => pieces(a) - pieces(b) || a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b)))[0] ?? [];
  return { sheets, errors, purchasedPieces: pieces(sheets), purchasedAreaM2: pieces(sheets) * stock.lengthMm * stock.widthMm / 1_000_000 };
}
