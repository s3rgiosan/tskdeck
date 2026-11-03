import { useEffect, useId, useMemo, useState } from "react";
import type { Handlers } from "../keys/useKeymap";
import type { ActionId } from "../keys/actions";
import { ACTIONS } from "../keys/actions";
import { formatBindings } from "../keys/format";
import type { Keymap } from "../keys/keymap";
import { isMacPlatform } from "../keys/keymap";
import { Modal } from "./Modal";
import { SymbolIcon } from "./SymbolIcon";

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
  const prefix = useId();
  const listId = `${prefix}-actions`;
  const optionId = (index: number) => `${prefix}-option-${index}`;
  const expanded = entries.length > 0;

  useEffect(() => {
    if (!expanded) return;
    document.getElementById(`${prefix}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, expanded, prefix]);

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
      <div className="search-field">
        <SymbolIcon name="magnifyingglass-large" />
        <input
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search actions"
          placeholder="Type an action"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {expanded ? (
        <ul id={listId} role="listbox" aria-label="Actions">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              id={optionId(index)}
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
        </ul>
      ) : (
        <p className="palette-empty">No matching action</p>
      )}
    </Modal>
  );
}
