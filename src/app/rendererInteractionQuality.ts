export type RendererInteractionQualityController = {
  beginInteraction: () => void;
  endInteraction: () => void;
  dispose: () => void;
  isReduced: () => boolean;
};

type TimerHost = {
  setTimeout: (handler: () => void, timeout?: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export function createRendererInteractionQualityController(args: {
  fullPixelRatio: number;
  reducedPixelRatio: number;
  setPixelRatio: (pixelRatio: number) => void;
  restoreDelayMs?: number;
  timerHost?: TimerHost;
}): RendererInteractionQualityController {
  const timerHost = args.timerHost ?? globalThis;
  const fullPixelRatio = Math.max(0.25, args.fullPixelRatio);
  const reducedPixelRatio = Math.min(fullPixelRatio, Math.max(0.25, args.reducedPixelRatio));
  const restoreDelayMs = Math.max(0, args.restoreDelayMs ?? 180);
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  let reduced = false;

  const clearRestoreTimer = () => {
    if (restoreTimer == null) return;
    timerHost.clearTimeout(restoreTimer);
    restoreTimer = null;
  };

  const applyFullQuality = () => {
    clearRestoreTimer();
    if (!reduced) return;
    reduced = false;
    args.setPixelRatio(fullPixelRatio);
  };

  return {
    beginInteraction: () => {
      clearRestoreTimer();
      if (reduced || reducedPixelRatio === fullPixelRatio) return;
      reduced = true;
      args.setPixelRatio(reducedPixelRatio);
    },
    endInteraction: () => {
      clearRestoreTimer();
      if (!reduced) return;
      restoreTimer = timerHost.setTimeout(() => {
        restoreTimer = null;
        applyFullQuality();
      }, restoreDelayMs);
    },
    dispose: applyFullQuality,
    isReduced: () => reduced
  };
}
