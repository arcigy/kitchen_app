export type LegCounts = { total: number; front: number; rear: number };
export function explicitLegCounts(params: Record<string, unknown>): LegCounts | null {
  if (params.legCountTotal === undefined && params.legCountFront === undefined) return null;
  const total = params.legCountTotal, front = params.legCountFront;
  if (typeof total !== "number" || typeof front !== "number" || !Number.isSafeInteger(total) || !Number.isSafeInteger(front)
    || total < 0 || front < 0 || front > total || total > 1000) throw new Error("Počet nôh musí byť celé nezáporné číslo; predné nohy nesmú prevyšovať celkový počet (najviac 1000).");
  return { total, front, rear: total - front };
}
