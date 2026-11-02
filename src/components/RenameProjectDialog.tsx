import { useId, useState } from "react";
import { Modal } from "./Modal";

/**
 * Asks for the name tskdeck shows for a project, with the project's full path above the field so
 * projects that share a folder name can be told apart. `folderLabel` is the label the project has
 * without a name; an empty field brings it back.
 */
export function RenameProjectDialog(props: {
  path: string;
  name: string;
  folderLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { path, folderLabel, onSubmit, onClose } = props;
  const [name, setName] = useState(props.name);
  const fieldId = useId();
  const pathId = useId();
  const helpId = useId();

  return (
    <Modal title="Rename Project" onClose={onClose}>
      <form
        className="sheet-form"
        aria-label="Rename Project"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name.trim());
        }}
      >
        <p id={pathId} className="sheet-path">
          {path}
        </p>
        <div className="sheet-field">
          <label htmlFor={fieldId}>Name</label>
          <input
            id={fieldId}
            value={name}
            placeholder={folderLabel}
            aria-describedby={`${pathId} ${helpId}`}
            onChange={(e) => setName(e.target.value)}
          />
          <span id={helpId} className="sheet-help">
            Leave empty to use the folder name.
          </span>
        </div>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Rename</button>
        </div>
      </form>
    </Modal>
  );
}
