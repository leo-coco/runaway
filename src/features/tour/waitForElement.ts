/**
 * Resolve as soon as `selector` matches an element in the DOM, or `null` after
 * `timeoutMs`. Used by the guided tour to wait for a route change or a modal to
 * mount before highlighting — and to skip a step whose target never appears, so
 * a removed/renamed feature can't break the tour.
 */
export function waitForElement(selector: string, timeoutMs = 6000): Promise<HTMLElement | null> {
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(el);
    };

    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) finish(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
