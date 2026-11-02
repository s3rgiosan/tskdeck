import type { EditInput, Status, StatusChange, Step, StepOp, TaskDetail, TaskRow } from "../api/types";
import type { Command } from "./undo";

/** The status a status change leaves a task in. */
export function statusOf(change: StatusChange): Status {
  switch (change.kind) {
    case "start":
      return "started";
    default:
      return change.kind;
  }
}

function patchTask<T extends TaskRow>(task: T, input: EditInput): T {
  const next = { ...task };
  if (input.title != null) next.title = input.title;
  if (input.unassign) next.assignee = null;
  else if (input.assignee != null) next.assignee = input.assignee;
  return next;
}

/** Steps are addressed by `short_id`; the full id is accepted too. */
function stepIs(step: Step, id: string): boolean {
  return step.short_id === id || step.id === id;
}

function patchSteps(detail: TaskDetail, op: StepOp): TaskDetail {
  switch (op.kind) {
    case "toggle":
      return { ...detail, steps: detail.steps.map((s) => (stepIs(s, op.id) ? { ...s, done: !s.done } : s)) };
    case "rename":
      return { ...detail, steps: detail.steps.map((s) => (stepIs(s, op.id) ? { ...s, text: op.text } : s)) };
    case "remove":
      return { ...detail, steps: detail.steps.filter((s) => !stepIs(s, op.id)) };
    default:
      return detail;
  }
}

/** Applies `cmd` to the local copy so the UI updates before the CLI answers. Inputs are not mutated. */
export function applyOptimistic(
  rows: TaskRow[],
  detail: TaskDetail | null,
  cmd: Command,
): { rows: TaskRow[]; detail: TaskDetail | null } {
  const onDetail = detail !== null && detail.number === cmd.number;
  const mapRows = (fn: (r: TaskRow) => TaskRow) => rows.map((r) => (r.number === cmd.number ? fn(r) : r));

  switch (cmd.kind) {
    case "status": {
      const status = statusOf(cmd.change);
      return {
        rows: mapRows((r) => ({ ...r, status })),
        detail: onDetail ? { ...detail, status } : detail,
      };
    }
    case "edit": {
      const input = cmd.input;
      return {
        rows: mapRows((r) => patchTask(r, input)),
        detail: onDetail
          ? { ...patchTask(detail, input), notes: input.notes != null ? input.notes : detail.notes }
          : detail,
      };
    }
    case "step":
      return { rows, detail: onDetail ? patchSteps(detail, cmd.op) : detail };
    case "archive":
      return { rows: rows.filter((r) => r.number !== cmd.number), detail };
    default:
      return { rows, detail };
  }
}
