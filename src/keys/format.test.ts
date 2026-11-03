import { describe, expect, it } from "vitest";
import { formatBinding, formatBindings } from "./format";

describe("formatBinding", () => {
  it("keeps the text form off macOS", () => {
    expect(formatBinding("ctrl+e", false)).toBe("Ctrl+E");
    expect(formatBinding("mod+k", false)).toBe("Ctrl+K");
    expect(formatBinding("shift+m", false)).toBe("Shift+M");
    expect(formatBinding("enter", false)).toBe("Enter");
    expect(formatBindings(["enter", "l", "arrowright"], false)).toBe("Enter, L, →");
    expect(formatBinding("ctrl+s", false)).toBe("Ctrl+S");
    expect(formatBinding("alt+arrowup", false)).toBe("Alt+↑");
    expect(formatBinding("escape", false)).toBe("Esc");
  });

  it("orders modifiers Ctrl, Alt, Shift off macOS", () => {
    expect(formatBinding("shift+mod+d", false)).toBe("Ctrl+Shift+D");
    expect(formatBinding("alt+ctrl+s", false)).toBe("Ctrl+Alt+S");
  });

  it("uses glyphs in the order ⌃⌥⇧⌘ on macOS", () => {
    expect(formatBinding("ctrl+e", true)).toBe("⌃E");
    expect(formatBinding("mod+shift+d", true)).toBe("⇧⌘D");
    expect(formatBinding("meta+ctrl+s", true)).toBe("⌃⌘S");
    expect(formatBinding("ctrl+alt+s", true)).toBe("⌃⌥S");
    expect(formatBinding("alt+arrowup", true)).toBe("⌥↑");
    expect(formatBinding("shift+arrowdown", true)).toBe("⇧↓");
    expect(formatBinding("ctrl+s", true)).toBe("⌃S");
    expect(formatBinding("mod+l", true)).toBe("⌘L");
    expect(formatBinding("shift+m", true)).toBe("⇧M");
  });

  it("shows keys as the glyphs macOS uses", () => {
    expect(formatBinding("enter", true)).toBe("↩");
    expect(formatBinding("escape", true)).toBe("⎋");
    expect(formatBinding("space", true)).toBe("Space");
    expect(formatBinding("ctrl+tab", true)).toBe("⌃⇥");
    expect(formatBinding("backspace", true)).toBe("⌫");
    expect(formatBinding("delete", true)).toBe("⌦");
    expect(formatBinding("arrowleft", true)).toBe("←");
    expect(formatBinding("mod+,", true)).toBe("⌘,");
    expect(formatBinding("+", true)).toBe("+");
    expect(formatBinding("mod++", true)).toBe("⌘+");
    expect(formatBinding("r", true)).toBe("R");
  });

  it("keeps ', ' between alternatives", () => {
    expect(formatBindings(["enter", "l", "arrowright"], true)).toBe("↩, L, →");
  });
});
