import { useMemo, useState } from "react";
import { useDeck } from "../state/store";
import { Modal } from "./Modal";

/** Asks for an assignee; an empty name unassigns. */
export function AssignDialog(props: { count: number; onSubmit: (name: string) => void; onClose: () => void }) {
  const { count, onSubmit, onClose } = props;
  const allRows = useDeck((s) => s.allRows);
  const [name, setName] = useState("");
  const names = useMemo(
    () => [...new Set(["me", ...allRows.map((r) => r.assignee).filter((a): a is string => a !== null)])],
    [allRows],
  );

  return (
    <Modal label="Assign" onClose={onClose}>
      <form
        className="sheet-form"
        aria-label="Assign"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name.trim());
        }}
      >
        <label className="sheet-field">
          Assign {count} {count === 1 ? "task" : "tasks"} to (empty to unassign)
          <input list="bulk-assignee-options" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <datalist id="bulk-assignee-options">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Assign</button>
        </div>
      </form>
    </Modal>
  );
}
