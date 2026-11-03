import type { Status } from "../api/types";

/** The name each status shows under, wherever a status is named. */
export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  ready: "Ready",
  started: "Started",
  blocked: "Blocked",
  review: "In Review",
  done: "Done",
  unknown: "Unknown",
};
