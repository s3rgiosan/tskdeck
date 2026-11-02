import { isTauri } from "@tauri-apps/api/core";
import type { Group, Sort } from "./api/types";
import { canonicalBinding, isMacPlatform, isTextTarget } from "./keys/keymap";
import type { Keymap } from "./keys/keymap";
import type { ActionId } from "./keys/actions";
import type { Handlers } from "./keys/useKeymap";

/** Menu bar and context menu items that run a keymap action. */
const ACTION_ITEMS: Record<string, ActionId> = {
  "new-task": "capture",
  sidebar: "sidebar.toggle",
  "done-drawer": "drawer.done",
  palette: "palette",
  "task-open": "task.open",
  "task-start": "status.start",
  "task-ready": "status.ready",
  "task-done": "status.done",
  "task-block": "status.block",
  "task-review": "status.review",
  "task-assign": "assign",
  "task-archive": "archive",
};

/** Pull-down items that run the keymap action of the Task menu item with the same name. */
const PULL_DOWN_ACTIONS: Record<string, ActionId> = {
  "pane-assign": "assign",
  "pane-archive": "archive",
};

/** The ids of every item that runs a keymap action. */
export const ACTION_ITEM_IDS = Object.keys(ACTION_ITEMS);

/** Menu bar items whose key equivalent is the action's first ⌘ binding in the keymap. */
const KEYED_ITEMS: Record<string, ActionId> = {
  ...ACTION_ITEMS,
  settings: "settings",
  find: "search",
};

/** Undo and Redo keep their standard key equivalents whatever the keymap says. */
const FIXED_MENU_CHORDS = ["meta+z", "shift+meta+z"];

/** Named keys a menu key equivalent can use, as the menu spells them. */
const ACCELERATOR_KEYS: Record<string, string> = {
  enter: "Enter",
  escape: "Escape",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
};

/** Printed keys a menu key equivalent can use. */
const ACCELERATOR_CHARACTERS = /^[a-z0-9,./;'[\]\\`=-]$/;

const ACCELERATOR_MODIFIERS: [string, string][] = [
  ["ctrl", "Ctrl"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Cmd"],
];

/** Whether the app has a menu bar: the macOS app, not the browser preview or another platform. */
export function hasMenuBar(isMac: boolean = isMacPlatform()): boolean {
  return isMac && isTauri();
}

/**
 * A macOS binding as a menu key equivalent, such as `Shift+Cmd+D`, or null when it has no ⌘ or
 * uses a key the menu cannot show.
 */
export function acceleratorOf(binding: string): string | null {
  const canonical = canonicalBinding(binding, true);
  if (canonical === "+" || canonical.endsWith("++")) return null;
  const parts = canonical.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (!modifiers.includes("meta")) return null;
  const keyName = ACCELERATOR_KEYS[key] ?? (ACCELERATOR_CHARACTERS.test(key) ? key.toUpperCase() : null);
  if (keyName === null) return null;
  const held = ACCELERATOR_MODIFIERS.filter(([name]) => modifiers.includes(name)).map(([, label]) => label);
  return [...held, keyName].join("+");
}

/** The binding of `action` the menu bar shows and handles: its first one the menu can show. */
function menuBinding(keymap: Keymap, action: ActionId): string | null {
  return keymap[action].find((b) => acceleratorOf(b) !== null) ?? null;
}

/** Each keyed menu bar item's key equivalent, from the keymap. */
export function menuAccelerators(keymap: Keymap): Record<string, string | null> {
  const accelerators: Record<string, string | null> = {};
  for (const [id, action] of Object.entries(KEYED_ITEMS)) {
    const binding = menuBinding(keymap, action);
    accelerators[id] = binding === null ? null : acceleratorOf(binding);
  }
  return accelerators;
}

/**
 * The chords the menu bar handles, in canonical form. The keymap leaves them to the menu, so a
 * menu command runs once, and also from a text field.
 */
export function menuChords(keymap: Keymap): string[] {
  const chords = Object.values(KEYED_ITEMS)
    .map((action) => menuBinding(keymap, action))
    .filter((b): b is string => b !== null)
    .map((b) => canonicalBinding(b, true));
  return [...FIXED_MENU_CHORDS, ...chords];
}

/** A View menu Group By or Sort By item id, for the choice it sets. */
function choiceOf(id: string): { group: Group } | { sort: Sort } | null {
  if (id.startsWith("group-")) return { group: id.slice("group-".length) as Group };
  if (id.startsWith("sort-")) return { sort: id.slice("sort-".length) as Sort };
  return null;
}

/**
 * Runs a menu bar item. Undo and Redo act on a focused text field; away from one, Undo
 * undoes the last board change. Find belongs to a focused text field too. Group By and Sort
 * By items hand their choice to `onChoice`.
 */
export function runMenuItem(
  id: string,
  handlers: Handlers,
  onChoice?: (choice: { group: Group } | { sort: Sort }) => void,
): void {
  const inTextField = isTextTarget(document.activeElement);
  switch (id) {
    case "undo":
      if (inTextField) document.execCommand("undo");
      else handlers.undo?.();
      break;
    case "redo":
      if (inTextField) document.execCommand("redo");
      break;
    case "find":
      if (!inTextField) handlers.search?.();
      break;
    default: {
      const action = ACTION_ITEMS[id] ?? PULL_DOWN_ACTIONS[id];
      if (action) {
        handlers[action]?.();
        break;
      }
      const choice = choiceOf(id);
      if (choice) onChoice?.(choice);
      break;
    }
  }
}
