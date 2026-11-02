import type { EditInput, Place, Status, StatusChange, StepOp } from "../api/types";

export type Command =
  | { kind: "status"; number: number; change: StatusChange }
  | { kind: "edit"; number: number; input: EditInput }
  | { kind: "step"; number: number; op: StepOp }
  | { kind: "archive"; number: number; archived: boolean };

export type Change =
  | { kind: "status"; number: number; from: Status; to: Status; dispatched: boolean }
  | { kind: "edit"; number: number; before: EditInput; after: EditInput }
  | {
      kind: "step";
      number: number;
      op: StepOp;
      before: { text?: string; place?: Place; newId?: string };
    }
  | { kind: "archive"; number: number; archived: boolean }
  | { kind: "capture"; number: number }
  | { kind: "reply"; number: number };

export interface UndoEntry {
  label: string;
  changes: Change[];
}

function statusChangeTo(status: Status): StatusChange | null {
  switch (status) {
    case "open":
      return { kind: "open" };
    case "ready":
      return { kind: "ready" };
    case "started":
      return { kind: "start", dispatch: false, again: false, force: true };
    case "done":
      return { kind: "done", clean: false };
    default:
      return null;
  }
}

function inverseStep(change: Extract<Change, { kind: "step" }>): Command | null {
  const { number, op, before } = change;
  const step = (inverse: StepOp): Command => ({ kind: "step", number, op: inverse });
  switch (op.kind) {
    case "add":
      return before.newId ? step({ kind: "remove", id: before.newId }) : null;
    case "remove":
      return before.text !== undefined && before.place
        ? step({ kind: "add", text: before.text, place: before.place })
        : null;
    case "toggle":
      return step({ kind: "toggle", id: op.id });
    case "rename":
      return before.text !== undefined ? step({ kind: "rename", id: op.id, text: before.text }) : null;
    case "move":
      return before.place ? step({ kind: "move", id: op.id, place: before.place }) : null;
    default:
      return null;
  }
}

/** The command that reverses `change`, or null when it cannot be reversed. */
export function inverseOf(change: Change): Command | null {
  switch (change.kind) {
    case "status": {
      if (change.dispatched) return null;
      const back = statusChangeTo(change.from);
      return back ? { kind: "status", number: change.number, change: back } : null;
    }
    case "edit":
      return { kind: "edit", number: change.number, input: change.before };
    case "step":
      return inverseStep(change);
    case "archive":
      return { kind: "archive", number: change.number, archived: !change.archived };
    default:
      return null;
  }
}
