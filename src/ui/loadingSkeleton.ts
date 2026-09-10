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

function blocksFor(variant: LoadingSkeletonVariant, mode: LoadingSkeletonMode): string {
  // A full-screen or overlay load must never pretend to know the geometry of
  // the view below it. The old generic three-column mockup jumped around when
  // it was mounted over project-manager and workspace layouts. Keep those
  // states anchored to one small activity surface instead.
  if (variant === "screen" || variant === "workspace" || mode === "overlay") {
    return `
      <div class="arcigy-loading-skeleton__activity" data-loading-skeleton-activity>
        <span class="arcigy-loading-skeleton__spinner" aria-hidden="true"></span>
        <span class="arcigy-loading-skeleton__activity-label">Načítavam</span>
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

function skeletonMarkup(variant: LoadingSkeletonVariant, label: string, mode: LoadingSkeletonMode): string {
  return `
    <div class="arcigy-loading-skeleton arcigy-loading-skeleton--${variant} arcigy-loading-skeleton--${mode}" data-loading-skeleton="${variant}" role="status" aria-live="polite">
      <span class="sr-only" data-loading-skeleton-status>${escapeHtml(label)}</span>
      ${blocksFor(variant, mode)}
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
  // An interrupted request must not leave an older overlay above the next
  // view. Only direct children belong to this host; nested loading states own
  // themselves and are deliberately left alone.
  Array.from(target.children)
    .filter((child) => child instanceof HTMLElement && child.hasAttribute("data-loading-skeleton"))
    .forEach((child) => child.remove());
  target.__arcigyLoadingSkeletonToken = token;
  target.setAttribute("aria-busy", "true");
  target.classList.add("arcigy-loading-skeleton-host", `arcigy-loading-skeleton-host--${options.variant}`);
  if (mode === "overlay") target.classList.add("arcigy-loading-skeleton-host--overlay");
  else target.classList.remove("arcigy-loading-skeleton-host--overlay");

  let skeleton: HTMLElement | null = null;
  if (mode === "class") {
    target.dataset.loadingSkeleton = options.variant;
  } else if (mode === "replace") {
    target.innerHTML = skeletonMarkup(options.variant, options.label, mode);
    skeleton = target.querySelector<HTMLElement>("[data-loading-skeleton]");
  } else {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = skeletonMarkup(options.variant, options.label, mode);
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
    if (mode === "overlay") target.classList.remove("arcigy-loading-skeleton-host--overlay");
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
