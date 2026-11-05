/** `[seconds, nanos]` since the Unix epoch. */
export type Timestamp = [number, number];

/** `unknown` stands for a status tsk reports that tskdeck does not recognise. */
export type Status = "open" | "ready" | "started" | "blocked" | "review" | "done" | "unknown";
/** `unknown` stands for a check state tsk reports that tskdeck does not recognise. */
export type CheckState = "open" | "passed" | "failed" | "unknown";

export interface AfterLink {
  task: number;
  done: boolean;
}

export interface Reply {
  at: Timestamp;
  by: string;
  text: string;
  edited?: boolean;
  sent?: boolean;
}

export interface Block {
  why: string | null;
  needs: string | null;
  options: string[];
  on: string;
  by: string;
  at: Timestamp;
  edited: boolean;
  replies: Reply[];
  answered: boolean;
  closed_at?: Timestamp | null;
  closed_by?: string | null;
}

export interface Check {
  text: string;
  state: CheckState;
}

export interface Review {
  round: number;
  done: string | null;
  checks: Check[];
  next: string | null;
  on: string;
  by: string;
  at: Timestamp;
  edited: boolean;
  feedback: Reply[];
  answered: boolean;
  closed_at?: Timestamp | null;
  closed_by?: string | null;
  resolution?: string | null;
}

export interface TaskRow {
  id: string;
  number: number;
  title: string;
  status: Status;
  project: string | null;
  thread: string | null;
  assignee: string | null;
  assignee_kind: string | null;
  base: string | null;
  after: AfterLink[];
  before: number[];
  archived?: string | null;
  group?: string | null;
  block?: Block | null;
  review?: Review | null;
}

export interface Step {
  id: string;
  done: boolean;
  short_id: string;
  text: string;
}

export interface Activity {
  at: Timestamp;
  by: string | null;
  kind: string;
  detail: unknown;
}

export interface TaskDetail extends TaskRow {
  notes: string | null;
  steps: Step[];
  dispatch?: unknown;
  past_blocks?: Block[];
  past_reviews?: Review[];
  activity: Activity[];
}

export interface AddResult {
  outcome: string;
  number: number;
}

export type Scope =
  | { kind: "desk" }
  | { kind: "all" }
  | { kind: "project"; path: string }
  | { kind: "thread"; name: string }
  | { kind: "assignee"; name: string };

export type Shelf = "live" | "done" | "archived";
export type Group = "none" | "project" | "thread" | "assignee";
export type Sort = "recent" | "project" | "thread" | "title" | "assignee";

export interface ListOptions {
  shelf: Shelf;
  group: Group;
  sort: Sort;
}

export interface CaptureInput {
  title: string;
  notes?: string | null;
  project?: string | null;
  thread?: string | null;
  assignee?: string | null;
}

export type StatusChange =
  | { kind: "open" }
  | { kind: "ready" }
  | { kind: "start"; dispatch: boolean; again: boolean; force: boolean }
  | { kind: "done"; clean: boolean }
  | {
      kind: "blocked";
      why: string | null;
      needs: string | null;
      options: string[];
      on: string | null;
    }
  | {
      kind: "review";
      done: string | null;
      checks: string[];
      next: string | null;
      on: string | null;
    };

export interface EditInput {
  title?: string | null;
  notes?: string | null;
  assignee?: string | null;
  unassign?: boolean;
  after?: number[] | null;
  on?: string | null;
}

export type Place =
  | { kind: "before"; id: string }
  | { kind: "after"; id: string }
  | { kind: "first" }
  | { kind: "last" };

export type StepOp =
  | { kind: "add"; text: string; place: Place | null }
  | { kind: "toggle"; id: string }
  | { kind: "rename"; id: string; text: string }
  | { kind: "move"; id: string; place: Place }
  | { kind: "remove"; id: string };

export type TskError =
  | { kind: "notFound" }
  | { kind: "spawn"; message: string }
  | { kind: "refused"; code: string; message: string }
  | { kind: "usage"; message: string }
  | { kind: "store"; message: string }
  | { kind: "unexpected"; exit: number | null; message: string }
  | { kind: "parse"; message: string }
  | { kind: "timeout"; seconds: number };

export type OpenMode = "beside" | "overlay";

export interface Settings {
  openMode: OpenMode;
  keymap: Record<string, string[]>;
  tskPath: string | null;
  sidebarHidden: boolean;
  /** Names given to projects in tskdeck, keyed by the project's full path. */
  projectNames: Record<string, string>;
  /** Whether tskdeck looks for a newer release after launch and once a day. */
  checkForUpdates: boolean;
}

/** A newer release than the running app. */
export interface UpdateInfo {
  version: string;
  /** The release notes, when the release has any. */
  notes: string | null;
}

/** Download progress in bytes. `total` is null when the server sends no length. */
export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** The outcome of a check started from the app menu: the update found, or why the check failed. */
export interface UpdateCheckResult {
  update: UpdateInfo | null;
  error: string | null;
}

export interface TskInfo {
  path: string;
  version: string;
  supported: boolean;
  minimum: string;
}
