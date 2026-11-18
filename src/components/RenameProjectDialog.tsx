import { useId, useRef, useState } from "react";
import { Modal } from "./Modal";

/**
 * Asks for the name tskdeck shows for a project, with the project's full path above the field so
 * projects that share a folder name can be told apart. `folderLabel` is the label the project has
 * without a name; an empty field brings it back. `onSubmit` resolves to tsk's refusal, which stays
 * under the field so the name can be changed, or to null.
 */
export function RenameProjectDialog(props: {
  path: string;
  name: string;
  folderLabel: string;
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { path, folderLabel, onSubmit, onClose } = props;
  const [name, setName] = useState(props.name);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const pathId = useId();
  const helpId = useId();
  const refusalId = useId();
  const field = useRef<HTMLInputElement>(null);

  return (
    <Modal title="Rename Project" onClose={onClose}>
      <form
        className="sheet-form"
        aria-label="Rename Project"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const refused = await onSubmit(name.trim());
          // A null result closes the dialog, so only a refusal updates it.
          if (refused !== null) {
            setRefusal(refused);
            setBusy(false);
            field.current?.focus();
          }
        }}
      >
        <p id={pathId} className="sheet-path">
          {path}
        </p>
        <div className="sheet-field">
          <label htmlFor={fieldId}>Name</label>
          <input
            ref={field}
            id={fieldId}
            value={name}
            readOnly={busy}
            placeholder={folderLabel}
            aria-invalid={refusal !== null}
            aria-describedby={refusal === null ? `${pathId} ${helpId}` : `${pathId} ${refusalId} ${helpId}`}
            onChange={(e) => setName(e.target.value)}
          />
          {refusal !== null && (
            <p id={refusalId} role="alert" className="flow-error">
              {refusal}
            </p>
          )}
          <span id={helpId} className="sheet-help">
            Leave empty to use the folder name.
          </span>
        </div>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}
