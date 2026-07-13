export type StableElementWaitOptions = {
  timeoutMs?: number;
  stableForMs?: number;
  requireVisible?: boolean;
  requireText?: boolean;
};

function visible(element: Element): boolean {
  const html = element as HTMLElement;
  const style = html.ownerDocument.defaultView?.getComputedStyle(html);
  if (html.hidden || style?.display === "none" || style?.visibility === "hidden") return false;
  const rect = html.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function waitForStableElement<T extends Element = Element>(
  document: Document,
  selectors: readonly string[],
  options: StableElementWaitOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const stableForMs = options.stableForMs ?? 300;
  const requireVisible = options.requireVisible ?? true;
  const requireText = options.requireText ?? false;
  if (selectors.length === 0) return Promise.reject(new Error("At least one stable element selector is required."));

  return new Promise((resolve, reject) => {
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    let lastElement: T | null = null;
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer(() => evaluate());
    const timeout = setTimeout(() => finish(new Error(`Stable supplier element was not found within ${timeoutMs} ms.`)), timeoutMs);

    const finish = (error?: Error, element?: T) => {
      clearTimeout(timeout);
      if (stableTimer) clearTimeout(stableTimer);
      observer.disconnect();
      if (error) reject(error);
      else resolve(element!);
    };
    const evaluate = () => {
      const element = selectors
        .map((selector) => document.querySelector<T>(selector))
        .find((candidate): candidate is T => !!candidate &&
          (!requireVisible || visible(candidate)) &&
          (!requireText || !!candidate.textContent?.trim())) ?? null;
      if (!element) {
        lastElement = null;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = null;
        return;
      }
      if (element !== lastElement && stableTimer) clearTimeout(stableTimer);
      lastElement = element;
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => {
        const stillPresent = selectors.some((selector) => document.querySelector(selector) === element);
        if (stillPresent && (!requireVisible || visible(element)) && (!requireText || !!element.textContent?.trim())) finish(undefined, element);
        else evaluate();
      }, stableForMs);
    };

    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    evaluate();
  });
}
