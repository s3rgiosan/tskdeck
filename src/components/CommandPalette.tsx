import { useMemo, useState } from "react";
import type { Handlers } from "../keys/useKeymap";
import type { ActionId } from "../keys/actions";
import { ACTIONS } from "../keys/actions";
import { formatBindings } from "../keys/format";
import type { Keymap } from "../keys/keymap";
import { isMacPlatform } from "../keys/keymap";
import { Modal } from "./Modal";

/**
 * Lists the actions that have a handler in the current context and runs the chosen one. `labels`
 * names a toggle by what it does now, such as "Hide Sidebar".
 */
export function CommandPalette(props: {
  keymap: Keymap;
  handlers: Handlers;
  onClose: () => void;
  labels?: Partial<Record<ActionId, string>>;
  isMac?: boolean;
}) {
  const { keymap, handlers, onClose, labels, isMac = isMacPlatform() } = props;
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(0);

  const entries = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return ACTIONS.map((a) => ({ id: a.id, label: labels?.[a.id] ?? a.label })).filter(
      (a) => handlers[a.id] && a.label.toLowerCase().includes(needle),
    );
  }, [handlers, labels, filter]);
  const active = Math.min(selected, Math.max(entries.length - 1, 0));

  function run(index: number) {
    const entry = entries[index];
    if (!entry) return;
    onClose();
    handlers[entry.id]?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelected(Math.min(active + 1, entries.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelected(Math.max(active - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        run(active);
        break;
      default:
        break;
    }
  }

  return (
    <Modal label="Command Palette" className="palette" onClose={onClose}>
      <input
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-actions"
        aria-label="Search actions"
        placeholder="Type an action"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id="palette-actions" role="listbox" aria-label="Actions">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            role="option"
            aria-selected={index === active}
            className={index === active ? "is-active" : undefined}
            onMouseEnter={() => setSelected(index)}
            onClick={() => run(index)}
          >
            <span>{entry.label}</span>
            <kbd>{formatBindings(keymap[entry.id], isMac)}</kbd>
          </li>
        ))}
        {entries.length === 0 && <li className="palette-empty">No matching action</li>}
      </ul>
    </Modal>
  );
}
