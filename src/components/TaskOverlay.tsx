import { useDeck } from "../state/store";
import { Modal } from "./Modal";
import { TaskPane } from "./TaskPane";

/**
 * The open task in a sheet over the dimmed board. The pane shows its own failures, so the sheet
 * leaves the rest to the window's alerts.
 */
export function TaskOverlay() {
  const close = useDeck((s) => s.close);
  const openTask = useDeck((s) => s.openTask);
  return (
    <Modal label="Task" className="overlay-modal" errors={false} initialFocus=".task-pane" onClose={close}>
      <TaskPane key={openTask} />
    </Modal>
  );
}
