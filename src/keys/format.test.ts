import { describe, expect, it } from "vitest";
import { formatBinding, formatBindings } from "./format";

describe("formatBinding", () => {
  it("keeps the text form off macOS", () => {
    expect(formatBinding("ctrl+e", false)).toBe("Ctrl+E");
    expect(formatBinding("mod+k", false)).toBe("Ctrl+K");
    expect(formatBinding("shift+m", false)).toBe("Shift+M");
    expect(formatBinding("enter", false)).toBe("Enter");
    expect(formatBindings(["enter", "l", "arrowright"], false)).toBe("Enter, L, →");
  });

  it("uses glyphs in the order ⌃⌥⇧⌘ on macOS", () => {
    expect(formatBinding("ctrl+e", true)).toBe("⌃E");
    expect(formatBinding("mod+shift+d", true)).toBe("⇧⌘D");
    expect(formatBinding("meta+ctrl+s", true)).toBe("⌃⌘S");
    expect(formatBinding("ctrl+alt+s", true)).toBe("⌃⌥S");
    expect(formatBinding("alt+arrowup", true)).toBe("⌥↑");
    expect(formatBinding("shift+arrowdown", true)).toBe("⇧↓");
  });

  it("names keys the Mac way", () => {
    expect(formatBinding("enter", true)).toBe("Return");
    expect(formatBinding("escape", true)).toBe("Esc");
    expect(formatBinding("space", true)).toBe("Space");
    expect(formatBinding("ctrl+tab", true)).toBe("⌃Tab");
    expect(formatBinding("backspace", true)).toBe("Delete");
    expect(formatBinding("mod+,", true)).toBe("⌘,");
    expect(formatBinding("+", true)).toBe("+");
    expect(formatBinding("mod++", true)).toBe("⌘+");
    expect(formatBinding("r", true)).toBe("R");
  });

  it("keeps ', ' between alternatives", () => {
    expect(formatBindings(["enter", "l", "arrowright"], true)).toBe("Return, L, →");
  });
});
