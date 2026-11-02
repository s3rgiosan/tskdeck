const KEY_LABELS: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function modifierLabel(modifier: string, isMac: boolean): string {
  switch (modifier) {
    case "mod":
      return isMac ? "⌘" : "Ctrl";
    case "meta":
      return isMac ? "⌘" : "Win";
    case "ctrl":
      return "Ctrl";
    case "alt":
      return isMac ? "⌥" : "Alt";
    case "shift":
      return "Shift";
    default:
      return modifier;
  }
}

const MAC_KEY_LABELS: Record<string, string> = {
  enter: "Return",
  backspace: "Delete",
  delete: "Delete",
};

const MAC_MODIFIERS: [string, string][] = [
  ["ctrl", "⌃"],
  ["alt", "⌥"],
  ["shift", "⇧"],
  ["meta", "⌘"],
];

/** Splits a binding into its modifiers and key; a trailing `+` is the plus key. */
function splitBinding(binding: string): { modifiers: string[]; key: string } {
  const lower = binding.toLowerCase();
  const plusKey = lower === "+" || lower.endsWith("++");
  const at = plusKey ? lower.length - 1 : lower.lastIndexOf("+");
  const key = plusKey ? "+" : at === -1 ? lower : lower.slice(at + 1);
  const rest = plusKey ? lower.slice(0, -2) : at === -1 ? "" : lower.slice(0, at);
  return { modifiers: rest.split("+").filter(Boolean), key };
}

/** A binding the Mac way: glyphs in the order ⌃⌥⇧⌘ followed by the key, such as `⇧⌘D`. */
function formatMacBinding(binding: string): string {
  const { modifiers, key } = splitBinding(binding);
  const held = new Set(modifiers.map((m) => (m === "mod" ? "meta" : m)));
  const glyphs = MAC_MODIFIERS.filter(([name]) => held.has(name)).map(([, glyph]) => glyph);
  const keyLabel = MAC_KEY_LABELS[key] ?? KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return glyphs.join("") + keyLabel;
}

/** A binding as a person reads it, such as `Ctrl+D` or, on macOS, `⌃D`. */
export function formatBinding(binding: string, isMac: boolean): string {
  if (isMac) return formatMacBinding(binding);
  const { modifiers, key } = splitBinding(binding);
  const keyLabel = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...modifiers.map((m) => modifierLabel(m, isMac)), keyLabel].join("+");
}

export function formatBindings(bindings: string[], isMac: boolean): string {
  return bindings.map((b) => formatBinding(b, isMac)).join(", ");
}
