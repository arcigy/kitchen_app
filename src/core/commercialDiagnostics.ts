export type CommercialTiming = {
  stage: "save" | "calculation" | "materials-read" | "margins-read" | "render";
  durationMs: number;
  outcome: "success" | "cancelled" | "error";
  at: string;
};

const timings: CommercialTiming[] = [];

export function recordCommercialTiming(stage: CommercialTiming["stage"], startedAt: number, outcome: CommercialTiming["outcome"]): void {
  recordCommercialDuration(stage, performance.now() - startedAt, outcome);
}

export function recordCommercialDuration(stage: CommercialTiming["stage"], durationMs: number, outcome: CommercialTiming["outcome"]): void {
  timings.push({ stage, durationMs: Math.round(durationMs), outcome, at: new Date().toISOString() });
  if (timings.length > 60) timings.shift();
}

export function commercialTimings(): CommercialTiming[] {
  const cutoff = Date.now() - 120_000;
  return timings.filter(timing => Date.parse(timing.at) >= cutoff).map(timing => ({ ...timing }));
}

export function clearCommercialTimings(): void { timings.length = 0; }
