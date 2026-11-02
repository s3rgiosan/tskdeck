import { useMemo, useState } from "react";
import type { CaptureInput, Scope } from "../api/types";
import { scopeTitle, sidebarModel } from "../board/sidebar";
import { useDeck } from "../state/store";
import { Modal } from "./Modal";

/** Where a task captured from `scope` lands: a project scope names the project, a thread scope the thread, an assignee scope the assignee; the rest is the desk. */
export function captureTarget(scope: Scope): Omit<CaptureInput, "title" | "notes"> {
  const target = { project: null, thread: null, assignee: null };
  switch (scope.kind) {
    case "project":
      return { ...target, project: scope.path };
    case "thread":
      return { ...target, thread: scope.name };
    case "assignee":
      return { ...target, assignee: scope.name };
    default:
      return target;
  }
}

/** Where a task captured from `scope` lands, in words; `projectLabel` is the label of a project scope. */
function describeTarget(scope: Scope, projectLabel: string): string {
  switch (scope.kind) {
    case "project":
      return projectLabel;
    case "thread":
      return `Desk, ${scope.name} thread`;
    case "assignee":
      return `Desk, assigned to ${scope.name}`;
    default:
      return "Desk";
  }
}

export function CaptureDialog(props: { onClose: () => void }) {
  const { onClose } = props;
  const scope = useDeck((s) => s.scope);
  const capture = useDeck((s) => s.capture);
  const allRows = useDeck((s) => s.allRows);
  const projectNames = useDeck((s) => s.settings.projectNames);
  const projectLabel = useMemo(
    () => scopeTitle(scope, sidebarModel(allRows, projectNames), projectNames),
    [scope, allRows, projectNames],
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    const trimmedNotes = notes.trim();
    const number = await capture({ title: trimmed, notes: trimmedNotes === "" ? null : trimmedNotes, ...captureTarget(scope) });
    setBusy(false);
    if (number !== null) onClose();
  }

  return (
    <Modal title="New Task" onClose={onClose}>
      <form
        className="sheet-form"
        aria-label="New Task"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid is-compact">
          <span className="form-label">Into</span>
          <span className="form-value">{describeTarget(scope, projectLabel)}</span>
          <label className="form-label" htmlFor="capture-title">
            Title
          </label>
          <input id="capture-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="form-label" htmlFor="capture-notes">
            Notes
          </label>
          <textarea id="capture-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || title.trim() === ""}>
            Capture
          </button>
        </div>
      </form>
    </Modal>
  );
}
