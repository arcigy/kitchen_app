const STALE_ASSET_RELOAD_KEY = "arcigy.stale-asset-reload";

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

export type StaleAssetRecoveryDependencies = {
  storage: ReloadStorage;
  reload(): void;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

function failureIdentity(payload: unknown): string {
  if (payload instanceof Error) return payload.message;
  if (typeof payload === "string") return payload;
  return "unknown-vite-preload-error";
}

export function recoverFromStaleAsset(
  event: VitePreloadErrorEvent,
  dependencies: StaleAssetRecoveryDependencies
): boolean {
  const identity = failureIdentity(event.payload);
  try {
    if (dependencies.storage.getItem(STALE_ASSET_RELOAD_KEY) === identity) return false;
    dependencies.storage.setItem(STALE_ASSET_RELOAD_KEY, identity);
  } catch {
    // A blocked sessionStorage must not create an uncontrolled reload loop.
    return false;
  }

  event.preventDefault();
  dependencies.reload();
  return true;
}

export function installStaleAssetRecovery(target: Window = window): () => void {
  const listener = (event: Event) => {
    recoverFromStaleAsset(event as VitePreloadErrorEvent, {
      storage: target.sessionStorage,
      reload: () => target.location.reload()
    });
  };
  target.addEventListener("vite:preloadError", listener);
  return () => target.removeEventListener("vite:preloadError", listener);
}
