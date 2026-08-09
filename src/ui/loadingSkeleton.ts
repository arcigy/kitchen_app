export type LoadingSkeletonVariant = "screen" | "project-list" | "workspace" | "phase" | "icon";

export type LoadingSkeletonMode = "replace" | "overlay" | "class";

export type LoadingSkeletonOptions = {
  variant: LoadingSkeletonVariant;
  label: string;
  mode?: LoadingSkeletonMode;
};

export type LoadingSkeletonHandle = {
  setStatus: (label: string) => void;
  clear: () => void;
  fail: (label: string) => void;
  isCurrent: () => boolean;
};

type SkeletonHost = HTMLElement & {
  __arcigyLoadingSkeletonToken?: symbol;
};

function blocksFor(variant: LoadingSkeletonVariant): string {
  if (variant === "screen" || variant === "workspace") {
    return `
      <div class="arcigy-loading-skeleton__topbar"></div>
      <div class="arcigy-loading-skeleton__body">
        <div class="arcigy-loading-skeleton__sidebar"></div>
        <div class="arcigy-loading-skeleton__canvas"></div>
        <div class="arcigy-loading-skeleton__properties"></div>
      </div>
    `;
  }
  if (variant === "project-list") {
    return `
      <div class="arcigy-loading-skeleton__line arcigy-loading-skeleton__line--title"></div>
      <div class="arcigy-loading-skeleton__cards"><i></i><i></i><i></i></div>
    `;
  }
  if (variant === "phase") {
    return `
      <div class="arcigy-loading-skeleton__line arcigy-loading-skeleton__line--title"></div>
      <div class="arcigy-loading-skeleton__line"></div>
      <div class="arcigy-loading-skeleton__line arcigy-loading-skeleton__line--short"></div>
      <div class="arcigy-loading-skeleton__cards"><i></i><i></i><i></i></div>
    `;
  }
  return "";
}

function skeletonMarkup(variant: LoadingSkeletonVariant, label: string): string {
  return `
    <div class="arcigy-loading-skeleton arcigy-loading-skeleton--${variant}" data-loading-skeleton="${variant}" role="status" aria-live="polite">
      <span class="sr-only" data-loading-skeleton-status>${escapeHtml(label)}</span>
      ${blocksFor(variant)}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

/**
 * Mounts the shared Arcigy loading treatment without allowing an older async
 * request to remove a newer loading state from the same host.
 */
export function mountLoadingSkeleton(host: HTMLElement, options: LoadingSkeletonOptions): LoadingSkeletonHandle {
  const target = host as SkeletonHost;
  const token = Symbol("arcigy-loading-skeleton");
  const mode = options.mode ?? (options.variant === "icon" ? "class" : "replace");
  target.__arcigyLoadingSkeletonToken = token;
  target.setAttribute("aria-busy", "true");
  target.classList.add("arcigy-loading-skeleton-host", `arcigy-loading-skeleton-host--${options.variant}`);

  let skeleton: HTMLElement | null = null;
  if (mode === "class") {
    target.dataset.loadingSkeleton = options.variant;
  } else if (mode === "replace") {
    target.innerHTML = skeletonMarkup(options.variant, options.label);
    skeleton = target.querySelector<HTMLElement>("[data-loading-skeleton]");
  } else {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = skeletonMarkup(options.variant, options.label);
    skeleton = wrapper.firstElementChild as HTMLElement | null;
    if (!skeleton) throw new Error("Could not mount loading skeleton.");
    skeleton.classList.add("arcigy-loading-skeleton--overlay");
    target.appendChild(skeleton);
  }

  const isCurrent = () => target.__arcigyLoadingSkeletonToken === token;
  const setStatus = (label: string) => {
    if (!isCurrent()) return;
    skeleton?.querySelector<HTMLElement>("[data-loading-skeleton-status]")?.replaceChildren(label);
  };
  const clear = () => {
    if (!isCurrent()) return;
    target.__arcigyLoadingSkeletonToken = undefined;
    (target as HTMLElement & { removeAttribute?: (name: string) => void }).removeAttribute?.("aria-busy");
    target.classList.remove("arcigy-loading-skeleton-host", `arcigy-loading-skeleton-host--${options.variant}`);
    delete target.dataset.loadingSkeleton;
    if (mode === "overlay") skeleton?.remove();
    else if (mode === "replace") target.replaceChildren();
  };
  const fail = (label: string) => {
    if (!isCurrent()) return;
    setStatus(label);
    target.setAttribute("aria-busy", "false");
  };

  return { setStatus, clear, fail, isCurrent };
}
