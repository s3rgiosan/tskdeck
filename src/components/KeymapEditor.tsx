import { useEffect, useState } from "react";
import { ACTIONS } from "../keys/actions";
import type { ActionId } from "../keys/actions";
import { formatBinding, formatBindings } from "../keys/format";
import type { Keymap } from "../keys/keymap";
import { conflictsFor, defaultKeymap, isMacPlatform, matches, normalizeEvent, RESERVED, resolveKeymap } from "../keys/keymap";
import { useDeck } from "../state/store";
import { Modal } from "./Modal";

const LONE_MODIFIERS = ["control", "shift", "alt", "meta", "altgraph"];

interface Pending {
  action: ActionId;
  binding: string;
  conflicts: ActionId[];
}

function labelOf(id: ActionId): string {
  return ACTIONS.find((a) => a.id === id)?.label ?? id;
}

/** The entries of `keymap` that differ from the platform's defaults. */
function overridesOf(keymap: Keymap, isMac: boolean): Record<string, string[]> {
  const defaults = defaultKeymap(isMac);
  const overrides: Record<string, string[]> = {};
  for (const { id } of ACTIONS) {
    if (keymap[id].join("\n") !== defaults[id].join("\n")) overrides[id] = keymap[id];
  }
  return overrides;
}

export function KeymapEditor(props: { isMac?: boolean }) {
  const { isMac = isMacPlatform() } = props;
  const settings = useDeck((s) => s.settings);
  const saveSettings = useDeck((s) => s.saveSettings);
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const keymap = resolveKeymap(settings.keymap, isMac);

  function save(next: Keymap) {
    void saveSettings({ ...settings, keymap: overridesOf(next, isMac) });
  }

  function assign(action: ActionId, binding: string, conflicts: ActionId[], swap: boolean) {
    const next = { ...keymap };
    for (const other of conflicts) {
      next[other] = swap ? keymap[action] : keymap[other].filter((b) => !matches(b, binding, isMac));
    }
    next[action] = [binding];
    setPending(null);
    save(next);
  }

  function record(action: ActionId, binding: string) {
    setRecording(null);
    if (keymap[action].includes(binding) && keymap[action].length === 1) return;
    const conflicts = conflictsFor(keymap, action, binding, isMac);
    if (conflicts.length > 0) setPending({ action, binding, conflicts });
    else assign(action, binding, [], false);
  }

  useEffect(() => {
    if (recording === null) return;
    const action = recording;
    function onKeyDown(e: KeyboardEvent) {
      if (LONE_MODIFIERS.includes(e.key.toLowerCase())) return;
      e.preventDefault();
      e.stopPropagation();
      const normalized = normalizeEvent(e, isMac);
      if (normalized === "escape") {
        setRecording(null);
        return;
      }
      if (RESERVED.some((r) => matches(r, normalized, isMac))) {
        setRefusal(`${formatBinding(normalized, isMac)} is reserved and cannot be used.`);
        setRecording(null);
        return;
      }
      record(action, normalized);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  return (
    <section className="keymap-editor" aria-label="Keyboard shortcuts">
      <div className="keymap-head">
        <p>Choose Record, then press the new key combination.</p>
        <button type="button" onClick={() => setConfirmingReset(true)}>
          Reset All
        </button>
      </div>
      {confirmingReset && (
        <Modal title="Reset All Shortcuts" errors={false} onClose={() => setConfirmingReset(false)}>
          <div className="sheet-form">
            <p className="sheet-help">Every shortcut returns to its original keys.</p>
            <div className="sheet-actions">
              <button type="button" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="is-destructive"
                onClick={() => {
                  setConfirmingReset(false);
                  save(defaultKeymap(isMac));
                }}
              >
                Reset All
              </button>
            </div>
          </div>
        </Modal>
      )}
      {recording !== null && <p role="status">Press a key combination, or Esc to cancel.</p>}
      {refusal !== null && <p role="alert">{refusal}</p>}
      {pending !== null && (
        <p role="group" aria-label="Key conflict" className="keymap-conflict">
          <span>Used by {pending.conflicts.map(labelOf).join(", ")}</span>
          {pending.conflicts.length === 1 && (
            <button type="button" onClick={() => assign(pending.action, pending.binding, pending.conflicts, true)}>
              Swap
            </button>
          )}
          <button type="button" onClick={() => assign(pending.action, pending.binding, pending.conflicts, false)}>
            Replace
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </p>
      )}
      <ul>
        {ACTIONS.map(({ id, label }) => (
          <li key={id}>
            <span className="keymap-label">{label}</span>
            <kbd>{keymap[id].length > 0 ? formatBindings(keymap[id], isMac) : "Unbound"}</kbd>
            <button
              type="button"
              className={recording === id ? "is-recording" : undefined}
              aria-label={recording === id ? `Press Keys… for ${label}` : `Record ${label}`}
              aria-pressed={recording === id}
              onClick={() => {
                setRefusal(null);
                setPending(null);
                setRecording(id);
              }}
            >
              {recording === id ? "Press Keys…" : "Record"}
            </button>
            {settings.keymap[id] !== undefined && (
              <button
                type="button"
                aria-label={`Reset ${label}`}
                onClick={() => save({ ...keymap, [id]: defaultKeymap(isMac)[id] })}
              >
                Reset
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
