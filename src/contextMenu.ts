import { isTextTarget } from "./keys/keymap";

/** Window chrome: toolbars, the sidebar, the board and panel headers. */
const CHROME = ".toolbar, .pane-toolbar, .sidebar, .board, .markbar, .drawer-head";

/** Whether a right-click over `target` keeps the web view's own menu: text fields and content outside the chrome. */
export function keepsContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (isTextTarget(target)) return true;
  return target.closest(CHROME) === null;
}

/** Turns off the web view's context menu over window chrome. */
export function suppressChromeContextMenu(): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (!keepsContextMenu(e.target)) e.preventDefault();
  };
  document.addEventListener("contextmenu", onContextMenu);
  return () => document.removeEventListener("contextmenu", onContextMenu);
}
