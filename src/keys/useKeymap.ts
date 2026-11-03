import { useEffect, useMemo, useRef } from "react";
import type { ActionId } from "./actions";
import { ACTIONS } from "./actions";
import type { KeyContext, Keymap } from "./keymap";
import { actionContext, isMacPlatform, isModBinding, isTextTarget, keepsNativeKeys, matches, normalizeEvent } from "./keymap";
import { hasMenuBar, menuChords } from "../menu";

/** A handler returns `false` when it did not act, which leaves the key to the browser. */
export type Handler = () => boolean | void;
export type Handlers = Partial<Record<ActionId, Handler>>;

const NATIVE_KEYS = ["enter", "space", "tab"];

const EDITING_KEYS = ["c", "x", "v", "a", "f", "z"];

/** Editing chords belong to a focused text field. */
function isEditingChord(normalized: string, isMac: boolean): boolean {
  const prefix = isMac ? "meta+" : "ctrl+";
  return normalized.startsWith(prefix) && EDITING_KEYS.includes(normalized.slice(prefix.length));
}

/**
 * Keys a focused text field passes on to the keymap. On macOS Ctrl chords are the
 * system's text-editing keys (Ctrl+A, Ctrl+E, Ctrl+K and others), so only ⌘ chords pass.
 */
function firesInTextField(normalized: string, isMac: boolean): boolean {
  if (normalized === "escape") return true;
  if (isEditingChord(normalized, isMac)) return false;
  const modifiers = normalized.split("+").slice(0, -1);
  if (isMac) return modifiers.includes("meta");
  return modifiers.includes("ctrl") || modifiers.includes("meta");
}

/**
 * The handler a key press runs in `context`: an action limited to that context wins, then an action
 * that applies everywhere.
 */
export function findHandler(
  keymap: Keymap,
  handlers: Handlers,
  context: KeyContext,
  normalized: string,
  isMac: boolean,
): Handler | undefined {
  const matching = ACTIONS.map((a) => a.id).filter(
    (id) => handlers[id] && keymap[id].some((b) => matches(b, normalized, isMac)),
  );
  // A key written literally, such as tsk's Ctrl+N, wins over a `mod` alias that resolves to the same chord.
  const literal = matching.filter((id) => keymap[id].some((b) => !isModBinding(b) && matches(b, normalized, isMac)));
  const bound = literal.length > 0 ? literal : matching;
  const scoped = bound.find((id) => actionContext(id).includes(context));
  const chosen = scoped ?? bound.find((id) => actionContext(id).length === 0);
  return chosen ? handlers[chosen] : undefined;
}

/**
 * Runs the handler bound to each key press. With a menu bar, the menu owns the chords it shows
 * as key equivalents: the keymap leaves those keys alone so the menu command runs once.
 */
export function useKeymap(
  keymap: Keymap,
  handlers: Handlers,
  context: KeyContext,
  isMac: boolean = isMacPlatform(),
  menuBar: boolean = hasMenuBar(isMac),
): void {
  const owned = useMemo(() => (menuBar ? menuChords(keymap) : []), [menuBar, keymap]);
  const latest = useRef({ keymap, handlers, context, isMac, owned });
  latest.current = { keymap, handlers, context, isMac, owned };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { keymap, handlers, context, isMac, owned } = latest.current;
      const normalized = normalizeEvent(e, isMac);
      if (owned.includes(normalized)) return;
      if (isTextTarget(e.target) && !firesInTextField(normalized, isMac)) return;
      if (NATIVE_KEYS.includes(normalized) && keepsNativeKeys(e.target)) return;
      const handler = findHandler(keymap, handlers, context, normalized, isMac);
      if (!handler) return;
      const acted = handler() !== false;
      if (acted) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
