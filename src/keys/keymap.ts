import type { ActionId } from "./actions";
import { ACTIONS } from "./actions";

export type Keymap = Record<ActionId, string[]>;
export type KeyContext = "board" | "task" | "block" | "review";

export const DEFAULT_KEYMAP: Keymap = {
  "nav.down": ["j", "arrowdown"],
  "nav.up": ["k", "arrowup"],
  "task.open": ["enter", "l", "arrowright"],
  "task.close": ["escape", "h", "arrowleft"],
  capture: ["+"],
  "edit.title": ["ctrl+e"],
  "status.start": ["ctrl+s", "mod+l"],
  "status.ready": ["ctrl+n"],
  "status.open": ["ctrl+o"],
  "status.done": ["ctrl+d"],
  "status.block": ["ctrl+b"],
  "status.review": ["ctrl+r"],
  undo: ["ctrl+u", "mod+z"],
  archive: ["ctrl+f"],
  assign: ["@"],
  reply: ["r"],
  "drawer.done": ["d", "mod+shift+d"],
  group: ["g"],
  sort: ["s"],
  "view.desk": ["1"],
  "view.lastProject": ["2"],
  "view.all": ["3"],
  "focus.projects": ["p"],
  "focus.threads": ["t"],
  "focus.assignees": ["a"],
  "focus.toggle": ["ctrl+tab"],
  search: ["/"],
  palette: [":", "mod+k"],
  "mark.mode": ["shift+m"],
  "mark.toggle": ["space"],
  "mark.up": ["shift+arrowup"],
  "mark.down": ["shift+arrowdown"],
  "step.add": ["ctrl+a"],
  "step.moveUp": ["alt+arrowup"],
  "step.moveDown": ["alt+arrowdown"],
  "option.1": ["1"],
  "option.2": ["2"],
  "option.3": ["3"],
  "option.4": ["4"],
  "option.5": ["5"],
  "option.6": ["6"],
  "option.7": ["7"],
  "option.8": ["8"],
  "option.9": ["9"],
  waitsOn: ["w"],
  "review.approve": ["ctrl+d"],
  "review.sendBack": ["ctrl+s"],
  settings: ["mod+,"],
  "sidebar.toggle": ["ctrl+meta+s", "ctrl+alt+s"],
  "zoom.in": [],
  "zoom.out": [],
  "zoom.reset": [],
  "help.docs": [],
};

/**
 * Keys added on macOS. Their Ctrl form is taken elsewhere: by tsk's own chords (Ctrl+O, Ctrl+D,
 * Ctrl+R, Ctrl+F, Ctrl+N) or by Redo on Windows (Ctrl+Y).
 */
const MAC_KEYMAP: Partial<Keymap> = {
  "task.open": ["mod+o"],
  capture: ["mod+n"],
  search: ["mod+f"],
  "status.ready": ["mod+y"],
  "status.done": ["mod+d"],
  "status.review": ["mod+r"],
};

/**
 * Keys added off macOS, where Ctrl+Shift chords are free for these actions. Zoom has its keys here
 * only: on macOS the View menu zooms.
 */
const OTHER_KEYMAP: Partial<Keymap> = {
  "status.block": ["mod+shift+b"],
  archive: ["mod+shift+e"],
  "zoom.in": ["mod+="],
  "zoom.out": ["mod+-"],
  "zoom.reset": ["mod+0"],
};

/** The default keymap for the platform: the shared keys, plus the macOS or the other platforms' ones. */
export function defaultKeymap(isMac: boolean = isMacPlatform()): Keymap {
  const keymap = {} as Keymap;
  for (const { id } of ACTIONS) {
    keymap[id] = [...DEFAULT_KEYMAP[id], ...((isMac ? MAC_KEYMAP : OTHER_KEYMAP)[id] ?? [])];
  }
  return keymap;
}

export const RESERVED: string[] = ["mod+q", "mod+w", "mod+c", "mod+v", "mod+x", "mod+a", "mod+z", "mod+shift+z"];

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"];

const KEY_NAMES: Record<string, string> = { " ": "space", esc: "escape" };

/** The contexts an action is limited to: a focused block, a focused review, or both. Empty means everywhere. */
export function actionContext(action: ActionId): KeyContext[] {
  if (action === "waitsOn") return ["block", "review"];
  if (action.startsWith("option.")) return ["block"];
  if (action.startsWith("review.")) return ["review"];
  return [];
}

/** Whether two actions can share a key press: both apply everywhere, or they share a context. */
function sameScope(a: KeyContext[], b: KeyContext[]): boolean {
  if (a.length === 0 || b.length === 0) return a.length === b.length;
  return a.some((c) => b.includes(c));
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** A printed character other than a letter or space: a digit or a symbol such as `@`, `+` or `/`. */
function isPrintedNonLetter(key: string): boolean {
  return key.length === 1 && key.toLowerCase() === key.toUpperCase() && key !== " ";
}

/**
 * Joins modifiers and a key name into a chord. A printed digit or symbol already carries the
 * Shift needed to type it on the user's layout, and a symbol also the Option or AltGr, so those
 * modifiers are left out of its chord.
 */
function joinChord(modifiers: Set<string>, key: string, isMac: boolean): string {
  const printed = isPrintedNonLetter(key);
  const symbol = printed && !/[0-9]/.test(key);
  const kept = new Set(modifiers);
  if (printed) kept.delete("shift");
  if (symbol) {
    if (!isMac && kept.has("ctrl") && kept.has("alt")) kept.delete("ctrl");
    kept.delete("alt");
  }
  const ordered = MODIFIER_ORDER.filter((m) => kept.has(m));
  return [...ordered, key].join("+");
}

/** Canonical form of a binding, with `mod` resolved for the platform. */
export function canonicalBinding(binding: string, isMac: boolean): string {
  const lower = binding.toLowerCase();
  let key: string;
  let rest: string;
  if (lower === "+") {
    key = "+";
    rest = "";
  } else if (lower.endsWith("++")) {
    key = "+";
    rest = lower.slice(0, -2);
  } else {
    const at = lower.lastIndexOf("+");
    key = at === -1 ? lower : lower.slice(at + 1);
    rest = at === -1 ? "" : lower.slice(0, at);
  }
  const modifiers = new Set<string>();
  for (const part of rest.split("+").filter(Boolean)) {
    modifiers.add(part === "mod" ? (isMac ? "meta" : "ctrl") : part);
  }
  return joinChord(modifiers, KEY_NAMES[key] ?? key, isMac);
}

/** The chord a key event stands for. */
export function normalizeEvent(e: KeyboardEvent, isMac: boolean): string {
  const raw = e.key;
  const key = KEY_NAMES[raw] ?? raw.toLowerCase();
  const modifiers = new Set<string>();
  if (e.ctrlKey) modifiers.add("ctrl");
  if (e.altKey) modifiers.add("alt");
  if (e.shiftKey) modifiers.add("shift");
  if (e.metaKey) modifiers.add("meta");
  return joinChord(modifiers, key, isMac);
}

export function matches(binding: string, normalized: string, isMac: boolean): boolean {
  return canonicalBinding(binding, isMac) === normalized;
}

/** A binding written with `mod`, which stands for ⌘ on macOS and Ctrl elsewhere. */
export function isModBinding(binding: string): boolean {
  return binding.toLowerCase().split("+").slice(0, -1).includes("mod");
}

export function resolveKeymap(overrides: Record<string, string[]>, isMac: boolean = isMacPlatform()): Keymap {
  const defaults = defaultKeymap(isMac);
  const keymap = {} as Keymap;
  for (const { id } of ACTIONS) {
    const custom = overrides[id];
    keymap[id] = custom ? [...custom] : defaults[id];
  }
  return keymap;
}

/** Actions in the same scope as `action` that a key press for `binding` would also trigger. */
export function conflictsFor(keymap: Keymap, action: ActionId, binding: string, isMac: boolean): ActionId[] {
  const wanted = canonicalBinding(binding, isMac);
  const context = actionContext(action);
  return ACTIONS.map((a) => a.id).filter((other) => {
    if (other === action || !sameScope(actionContext(other), context)) return false;
    return keymap[other].some((b) => matches(b, wanted, isMac));
  });
}

/** Input types that take typed text. An input with no or an unknown type is a text input. */
const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel", "password", "number"];

export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.includes(target.type);
  const tag = target.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  const editable = target.getAttribute("contenteditable");
  return target.isContentEditable === true || (editable !== null && editable !== "false");
}

const NATIVE_KEY_TARGETS = [
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  "[data-own-keys]",
  'input[type="checkbox"]',
  'input[type="radio"]',
  "select",
].join(", ");

/** Elements whose own Enter, Space and Tab behaviour wins over the keymap. `data-own-keys` marks elements with their own key handling. */
export function keepsNativeKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(NATIVE_KEY_TARGETS);
}
