const INACTIVE = "window-inactive";

/** Mirrors the window's activity onto the root element so the stylesheet can grey out selections. */
export function trackWindowActivity(): () => void {
  const root = document.documentElement;
  const sync = () => root.classList.toggle(INACTIVE, document.hidden || !document.hasFocus());
  const deactivate = () => root.classList.add(INACTIVE);
  const activate = () => root.classList.remove(INACTIVE);
  window.addEventListener("blur", deactivate);
  window.addEventListener("focus", activate);
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => {
    window.removeEventListener("blur", deactivate);
    window.removeEventListener("focus", activate);
    document.removeEventListener("visibilitychange", sync);
  };
}
