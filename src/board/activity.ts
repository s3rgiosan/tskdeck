import type { Activity, Status } from "../api/types";
import { STATUS_LABELS } from "./status";

/** A field of an entry's detail when it is a string. */
function field(detail: unknown, name: string): string | null {
  if (typeof detail !== "object" || detail === null) return null;
  const value = (detail as Record<string, unknown>)[name];
  return typeof value === "string" ? value : null;
}

function statusName(value: string | null): string | null {
  return value !== null && value in STATUS_LABELS ? STATUS_LABELS[value as Status] : null;
}

/**
 * What an activity verb says: `by` reads as "alex added this task", without a person as
 * "Task added". Null for a verb this table does not know.
 */
function phrase(kind: string, detail: unknown): { by: string; alone: string } | null {
  switch (kind) {
    case "created":
      return { by: "added this task", alone: "Task added" };
    case "status_set": {
      const to = statusName(field(detail, "to"));
      return to === null
        ? { by: "changed the status", alone: "Status changed" }
        : { by: `changed the status to ${to}`, alone: `Status changed to ${to}` };
    }
    case "completed":
      return { by: "marked this done", alone: "Marked done" };
    case "reopened":
      return { by: "reopened this task", alone: "Reopened" };
    case "archived":
      return { by: "archived this task", alone: "Archived" };
    case "unarchived":
    case "restored":
      return { by: "restored this task", alone: "Restored" };
    case "step_added":
      return { by: "added a step", alone: "Step added" };
    case "step_checked":
      return { by: "checked a step", alone: "Step checked" };
    case "step_unchecked":
      return { by: "unchecked a step", alone: "Step unchecked" };
    case "step_renamed":
      return { by: "renamed a step", alone: "Step renamed" };
    case "step_removed":
      return { by: "removed a step", alone: "Step removed" };
    case "assigned": {
      const to = field(detail, "to") ?? field(detail, "assignee");
      return to === null
        ? { by: "changed the assignee", alone: "Assignee changed" }
        : { by: `assigned this to ${to}`, alone: `Assigned to ${to}` };
    }
    case "dispatched":
      return { by: "launched an agent", alone: "Agent launched" };
    case "replied":
      return { by: "replied", alone: "Reply added" };
    case "block_edited":
      return { by: "edited the block", alone: "Block edited" };
    case "review_edited":
      return { by: "edited the review", alone: "Review edited" };
    case "on_set":
      return { by: "changed who it waits on", alone: "Waiting on changed" };
    default: {
      const status = statusName(kind);
      return status === null ? null : { by: `changed the status to ${status}`, alone: `Status changed to ${status}` };
    }
  }
}

/** An activity entry as a sentence; an unknown verb shows as tsk wrote it. */
export function activitySentence(entry: Activity): string {
  const known = phrase(entry.kind, entry.detail);
  if (known === null) {
    const detail = typeof entry.detail === "string" ? `: ${entry.detail}` : "";
    return `${entry.by ? `${entry.by} ` : ""}${entry.kind}${detail}`;
  }
  return entry.by ? `${entry.by} ${known.by}` : known.alone;
}
