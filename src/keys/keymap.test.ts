import { describe, expect, it } from "vitest";
import { ACTIONS } from "./actions";
import type { ActionId } from "./actions";
import type { KeyContext } from "./keymap";
import {
  actionContext,
  canonicalBinding,
  conflictsFor,
  DEFAULT_KEYMAP,
  defaultKeymap,
  isTextTarget,
  matches,
  normalizeEvent,
  RESERVED,
  resolveKeymap,
} from "./keymap";
import type { Handlers } from "./useKeymap";
import { findHandler } from "./useKeymap";

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("keymap", () => {
  it("normalises ctrl chords literally on mac", () => {
    expect(normalizeEvent(key({ key: "s", ctrlKey: true }), true)).toBe("ctrl+s");
  });
  it("maps mod to meta on mac", () => {
    expect(resolveKeymap({}).palette).toContain("mod+k");
    expect(matches("mod+k", normalizeEvent(key({ key: "k", metaKey: true }), true), true)).toBe(true);
    expect(matches("mod+k", normalizeEvent(key({ key: "k", ctrlKey: true }), false), false)).toBe(true);
    expect(matches("mod+k", normalizeEvent(key({ key: "k", ctrlKey: true }), true), true)).toBe(false);
  });
  it("normalises named keys, letters and symbols", () => {
    expect(normalizeEvent(key({ key: " " }), false)).toBe("space");
    expect(normalizeEvent(key({ key: "Escape" }), false)).toBe("escape");
    expect(normalizeEvent(key({ key: "ArrowUp", shiftKey: true }), false)).toBe("shift+arrowup");
    expect(normalizeEvent(key({ key: "M", shiftKey: true }), false)).toBe("shift+m");
    expect(normalizeEvent(key({ key: "+", shiftKey: true }), false)).toBe("+");
    expect(normalizeEvent(key({ key: "@", shiftKey: true }), false)).toBe("@");
    expect(normalizeEvent(key({ key: "1" }), false)).toBe("1");
    expect(normalizeEvent(key({ key: "a", metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(
      "ctrl+alt+shift+meta+a",
    );
  });
  it("reads a symbol typed with Option or AltGr as the bare symbol", () => {
    expect(normalizeEvent(key({ key: "@", altKey: true }), true)).toBe("@");
    expect(normalizeEvent(key({ key: "@", altKey: true, shiftKey: true }), true)).toBe("@");
    expect(normalizeEvent(key({ key: "@", ctrlKey: true, altKey: true }), false)).toBe("@");
    expect(normalizeEvent(key({ key: "@", altKey: true }), false)).toBe("@");
  });
  it("reads a digit typed with Shift as the bare digit", () => {
    expect(normalizeEvent(key({ key: "1", shiftKey: true }), false)).toBe("1");
    expect(matches("1", normalizeEvent(key({ key: "1", shiftKey: true }), true), true)).toBe(true);
  });
  it("matches stored bindings written with the modifiers that type a symbol", () => {
    expect(matches("alt+@", normalizeEvent(key({ key: "@", altKey: true }), true), true)).toBe(true);
    expect(matches("ctrl+alt+/", normalizeEvent(key({ key: "/", ctrlKey: true, altKey: true }), false), false)).toBe(true);
    expect(matches("ctrl+alt+/", normalizeEvent(key({ key: "/", ctrlKey: true, altKey: true }), true), true)).toBe(true);
    expect(matches("shift+1", normalizeEvent(key({ key: "1", shiftKey: true }), false), false)).toBe(true);
    expect(matches("alt+arrowup", normalizeEvent(key({ key: "ArrowUp", altKey: true }), false), false)).toBe(true);
  });
  it("keeps modifiers on letters, digits and named keys", () => {
    expect(normalizeEvent(key({ key: "ArrowUp", altKey: true }), true)).toBe("alt+arrowup");
    expect(normalizeEvent(key({ key: "ArrowUp", altKey: true }), false)).toBe("alt+arrowup");
    expect(normalizeEvent(key({ key: "1", altKey: true }), false)).toBe("alt+1");
    expect(normalizeEvent(key({ key: "1", ctrlKey: true, altKey: true }), false)).toBe("ctrl+alt+1");
    expect(normalizeEvent(key({ key: "e", ctrlKey: true, altKey: true }), false)).toBe("ctrl+alt+e");
    expect(normalizeEvent(key({ key: "@", ctrlKey: true }), true)).toBe("ctrl+@");
  });
  it("matches bindings whose key is a plus sign or comma", () => {
    expect(matches("+", "+", false)).toBe(true);
    expect(matches("mod+,", normalizeEvent(key({ key: ",", metaKey: true }), true), true)).toBe(true);
  });
  it("applies overrides", () => {
    expect(resolveKeymap({ "status.done": ["ctrl+enter"] })["status.done"]).toEqual(["ctrl+enter"]);
    expect(resolveKeymap({ bogus: ["x"] }, false)).toEqual(defaultKeymap(false));
  });
  it("binds step moves to tsk's keys", () => {
    expect(DEFAULT_KEYMAP["step.moveUp"]).toEqual(["alt+arrowup"]);
    expect(DEFAULT_KEYMAP["step.moveDown"]).toEqual(["alt+arrowdown"]);
  });
  it("adds the standard command keys after tsk's keys", () => {
    expect(DEFAULT_KEYMAP.undo).toEqual(["ctrl+u", "mod+z"]);
    expect(DEFAULT_KEYMAP["focus.toggle"]).toEqual(["ctrl+tab"]);
  });
  it("adds ⌘F for Find and ⌘N for New Task on macOS only, where tsk's Ctrl+F and Ctrl+N stay apart", () => {
    expect(defaultKeymap(true).search).toEqual(["/", "mod+f"]);
    expect(defaultKeymap(true).capture).toEqual(["+", "mod+n"]);
    expect(defaultKeymap(false).search).toEqual(["/"]);
    expect(defaultKeymap(false).capture).toEqual(["+"]);
  });
  it("defines a default binding for every action with keys on the platform", () => {
    const keyless: [ActionId, boolean][] = [
      ["help.docs", true],
      ["help.docs", false],
      ["zoom.in", true],
      ["zoom.out", true],
      ["zoom.reset", true],
    ];
    for (const isMac of [true, false]) {
      const keymap = defaultKeymap(isMac);
      for (const { id } of ACTIONS) {
        const expected = keyless.some(([action, mac]) => action === id && mac === isMac) ? 0 : 1;
        expect(Math.min(keymap[id].length, 1), `${id} ${isMac ? "macOS" : "other"}`).toBe(expected);
      }
    }
  });
  it("reports conflicts", () => {
    expect(conflictsFor(resolveKeymap({}), "capture", "ctrl+d", true)).toEqual(["status.done"]);
  });
  it("reports conflicts with a binding written another way", () => {
    expect(conflictsFor(resolveKeymap({}), "capture", "meta+k", true)).toEqual(["palette"]);
    expect(conflictsFor(resolveKeymap({}), "capture", "ctrl+k", false)).toEqual(["palette"]);
    expect(conflictsFor(resolveKeymap({}), "capture", "ctrl+k", true)).toEqual([]);
  });
  it("ignores context-only pairs", () => {
    expect(conflictsFor(resolveKeymap({}), "status.done", "ctrl+d", true)).toEqual([]);
    expect(conflictsFor(resolveKeymap({}), "view.desk", "1", true)).toEqual([]);
  });
  it("reports a conflict for an action shared by blocks and reviews", () => {
    expect(conflictsFor(resolveKeymap({}), "review.approve", "w", true)).toEqual(["waitsOn"]);
    expect(conflictsFor(resolveKeymap({}), "option.1", "w", true)).toEqual(["waitsOn"]);
  });
  it("counts only text-like inputs as text targets", () => {
    const input = (type: string | null) => {
      const el = document.createElement("input");
      if (type !== null) el.setAttribute("type", type);
      return el;
    };
    for (const type of [null, "text", "search", "email", "url", "tel", "password", "number"]) {
      expect(isTextTarget(input(type))).toBe(true);
    }
    for (const type of ["checkbox", "radio", "button", "submit", "range", "color", "file"]) {
      expect(isTextTarget(input(type))).toBe(false);
    }
  });
  it("rejects reserved keys", () => {
    expect(RESERVED).toContain("mod+q");
  });
  it("detects text targets", () => {
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTextTarget(document.createElement("input"))).toBe(true);
    expect(isTextTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextTarget(document.createElement("select"))).toBe(true);
    expect(isTextTarget(editable)).toBe(true);
    expect(isTextTarget(div)).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});

describe("platform defaults", () => {
  it("adds the macOS ⌘ keys for task actions on a Mac only", () => {
    expect(defaultKeymap(true)["status.done"]).toEqual(["ctrl+d", "mod+d"]);
    expect(defaultKeymap(false)["status.done"]).toEqual(["ctrl+d"]);
    expect(defaultKeymap(true)["task.open"]).toContain("mod+o");
    expect(defaultKeymap(false)["task.open"]).not.toContain("mod+o");
  });

  it("keeps tsk's Ctrl chords beside the new keys", () => {
    for (const isMac of [true, false]) {
      const keymap = defaultKeymap(isMac);
      expect(keymap["status.start"]).toEqual(["ctrl+s", "mod+l"]);
      expect(keymap["status.block"][0]).toBe("ctrl+b");
      expect(keymap.archive[0]).toBe("ctrl+f");
    }
  });

  it("adds no modifier to a standard macOS shortcut", () => {
    const mac = defaultKeymap(true);
    expect(mac["status.block"]).toEqual(["ctrl+b"]);
    expect(mac.archive).toEqual(["ctrl+f"]);
    expect(mac.assign).toEqual(["@"]);
    const other = defaultKeymap(false);
    expect(other["status.block"]).toEqual(["ctrl+b", "mod+shift+b"]);
    expect(other.archive).toEqual(["ctrl+f", "mod+shift+e"]);
  });

  it("gives the new task keys to one action each", () => {
    const added: [string, string, boolean][] = [
      ["task.open", "mod+o", true],
      ["status.start", "mod+l", false],
      ["status.ready", "mod+y", true],
      ["status.done", "mod+d", true],
      ["status.review", "mod+r", true],
      ["drawer.done", "mod+shift+d", false],
    ];
    for (const [id, binding, macOnly] of added) {
      for (const isMac of macOnly ? [true] : [true, false]) {
        const keymap = defaultKeymap(isMac);
        expect(conflictsFor(keymap, id as (typeof ACTIONS)[number]["id"], binding, isMac), `${id} ${binding}`).toEqual([]);
      }
    }
  });
});

describe("zoom and documentation", () => {
  it("binds zoom off macOS only, where the View menu has no zoom items", () => {
    const other = defaultKeymap(false);
    expect(other["zoom.in"]).toEqual(["mod+="]);
    expect(other["zoom.out"]).toEqual(["mod+-"]);
    expect(other["zoom.reset"]).toEqual(["mod+0"]);
    const mac = defaultKeymap(true);
    expect(mac["zoom.in"]).toEqual([]);
    expect(mac["zoom.out"]).toEqual([]);
    expect(mac["zoom.reset"]).toEqual([]);
  });

  it("resolves the zoom keys to Ctrl chords off macOS", () => {
    expect(canonicalBinding("mod+=", false)).toBe("ctrl+=");
    expect(canonicalBinding("mod+-", false)).toBe("ctrl+-");
    expect(canonicalBinding("mod+0", false)).toBe("ctrl+0");
  });

  it("names the zoom and documentation actions and applies them everywhere", () => {
    const labels = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label]));
    expect(labels["zoom.in"]).toBe("Zoom In");
    expect(labels["zoom.out"]).toBe("Zoom Out");
    expect(labels["zoom.reset"]).toBe("Actual Size");
    expect(labels["help.docs"]).toBe("tsk Documentation");
    for (const id of ["zoom.in", "zoom.out", "zoom.reset", "help.docs"] as const) expect(actionContext(id)).toEqual([]);
  });
});

describe("default keymap dispatch", () => {
  const ALL_CONTEXTS: KeyContext[] = ["board", "task"];

  for (const isMac of [true, false]) {
    it(`sends every default binding to its own action ${isMac ? "on macOS" : "off macOS"}`, () => {
      const keymap = resolveKeymap({}, isMac);
      const handlers: Handlers = Object.fromEntries(ACTIONS.map(({ id }) => [id, () => {}]));
      const shadowed: string[] = [];
      for (const { id } of ACTIONS) {
        const scoped = actionContext(id);
        for (const context of scoped.length > 0 ? scoped : ALL_CONTEXTS) {
          for (const binding of keymap[id]) {
            const handler = findHandler(keymap, handlers, context, canonicalBinding(binding, isMac), isMac);
            if (handler !== handlers[id]) shadowed.push(`${id} ${binding} in ${context}`);
          }
        }
      }
      expect(shadowed).toEqual([]);
    });
  }
});
