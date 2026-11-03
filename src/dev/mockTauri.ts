// Dev-only stand-in for the Tauri backend, so the UI renders in a plain browser for screenshots.
// URL controls: `?open=<n>` opens that task's pane once the board has loaded; `#settings` shows Settings;
// `?fullscreen` and `?reduceTransparency` report those window states as on; `?overlay` opens tasks over the board;
// `?rename` chooses Rename… from the first project's context menu; `?marks` starts multi-select with T3, T4 and T5
// marked; `?unknown` gives T10 a status the app does not recognise; `?longnotes` gives T3 notes taller than six lines.
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Block, ListOptions, Review, Settings, Status, TaskDetail, TaskRow, Timestamp } from "../api/types";
import { useDeck } from "../state/store";

const params = new URLSearchParams(window.location.search);
const NOW = Math.floor(Date.now() / 1000);
const ago = (minutes: number): Timestamp => [NOW - minutes * 60, 0];

function row(number: number, title: string, status: Status, extra: Partial<TaskRow> = {}): TaskRow {
  return {
    id: `mock-${number}`,
    number,
    title,
    status,
    project: null,
    thread: null,
    assignee: null,
    assignee_kind: null,
    base: null,
    after: [],
    before: [],
    ...extra,
  };
}

const block: Block = {
  why: "The changelog format is undecided.",
  needs: "A decision on grouping entries by area or by date.",
  options: ["By area", "By date"],
  on: "you",
  by: "claude",
  at: ago(90),
  edited: false,
  replies: [{ at: ago(60), by: "alex", text: "Leaning towards grouping by area." }],
  answered: false,
};

const review: Review = {
  round: 1,
  done: "Added the search field and wired it to the list.",
  checks: [
    { text: "Typing filters the list", state: "passed" },
    { text: "Escape clears the field", state: "open" },
  ],
  next: null,
  on: "you",
  by: "claude",
  at: ago(30),
  edited: false,
  feedback: [],
  answered: false,
};

const TASKS: TaskRow[] = [
  row(1, "Write release notes", "blocked", { project: "/Users/example/website", thread: "launch", assignee: "claude", assignee_kind: "agent", block }),
  row(2, "Add search to the sidebar", "review", { project: "/Users/example/mobile", thread: "launch", assignee: "claude", assignee_kind: "agent", review }),
  row(3, "Fix layout on narrow screens", "started", { project: "/Users/example/website", assignee: "alex", assignee_kind: "human" }),
  row(4, "Migrate settings storage", "started", { project: "/Users/example/mobile", assignee: "claude", assignee_kind: "agent" }),
  row(5, "Draft onboarding copy", "ready", { project: "/Users/example/website", thread: "launch" }),
  row(6, "Review icon set", "ready", { assignee: "alex", assignee_kind: "human" }),
  row(7, "Plan the next milestone", "ready"),
  row(8, "Collect crash reports", "open", { project: "/Users/example/mobile" }),
  row(9, "Try a darker accent colour", "open", { thread: "launch" }),
  row(10, "Update the contributor guide", params.has("unknown") ? "unknown" : "open"),
  row(11, "Publish the first beta", "done", { project: "/Users/example/website", thread: "launch", assignee: "alex", assignee_kind: "human" }),
  row(12, "Remove the old import path", "done", { archived: "done" }),
];

const DETAIL: Record<number, Partial<TaskDetail>> = {
  1: {
    notes: "Summarise the changes since the last release.\n\nKeep it short; link each entry to its task.",
    steps: [
      { id: "s1", short_id: "a1", done: true, text: "Collect merged changes" },
      { id: "s2", short_id: "a2", done: false, text: "Group entries" },
      { id: "s3", short_id: "a3", done: false, text: "Proofread" },
    ],
    activity: [
      { at: ago(240), by: "alex", kind: "created", detail: null },
      { at: ago(180), by: "claude", kind: "status_set", detail: { from: "ready", to: "started" } },
      { at: ago(120), by: "claude", kind: "step_checked", detail: null },
      { at: ago(90), by: "claude", kind: "status_set", detail: { from: "started", to: "blocked" } },
    ],
  },
};

if (params.has("longnotes")) {
  DETAIL[3] = {
    notes: Array.from({ length: 10 }, (_, i) => `Line ${i + 1} of a long note that explains the narrow-screen layout problem.`).join("\n"),
  };
}

const warned = new Set<string>();

const SETTINGS: Settings = {
  openMode: params.has("overlay") ? "overlay" : "beside",
  keymap: {},
  tskPath: "/usr/local/bin/tsk",
  sidebarHidden: false,
  projectNames: {},
};

function listScope(scope: { kind: string; path?: string; name?: string }, options: ListOptions): TaskRow[] {
  const shelf = (r: TaskRow) => (r.archived ? "archived" : r.status === "done" ? "done" : "live");
  return TASKS.filter((r) => {
    if (shelf(r) !== options.shelf) return false;
    switch (scope.kind) {
      case "project":
        return r.project === scope.path;
      case "thread":
        return r.thread === scope.name;
      case "assignee":
        return r.assignee === scope.name;
      default:
        return true;
    }
  });
}

function handle(cmd: string, payload: Record<string, unknown> = {}): unknown {
  switch (cmd) {
    case "tsk_info":
      return { path: SETTINGS.tskPath, version: "1.0.0", supported: true, minimum: "1.0.0" };
    case "list_scope":
      return listScope(payload.scope as { kind: string }, payload.options as ListOptions);
    case "get_task": {
      const base = TASKS.find((r) => r.number === payload.number);
      if (!base) throw { kind: "notFound" };
      return { notes: null, steps: [], activity: [{ at: ago(300), by: "alex", kind: "created", detail: null }], ...base, ...DETAIL[base.number] };
    }
    case "get_settings":
      return SETTINGS;
    case "capture":
      return TASKS.length + 1;
    case "set_status":
    case "edit_task":
    case "step":
    case "reply":
    case "set_archived":
    case "save_settings":
    case "relocate_tsk":
    case "open_settings":
    case "menu_state":
    case "show_task_menu":
    case "show_pull_down":
      return null;
    case "reduce_transparency":
      return params.has("reduceTransparency");
    case "plugin:window|is_fullscreen":
      return params.has("fullscreen");
    default:
      // Event and window plugin calls (listen, unlisten, emit) resolve to null without a warning.
      if (!cmd.startsWith("plugin:") && !warned.has(cmd)) {
        warned.add(cmd);
        console.warn(`[mockTauri] unhandled command: ${cmd}`);
      }
      return null;
  }
}

mockWindows("main");
mockIPC((cmd, payload) => handle(cmd, payload as Record<string, unknown>), { shouldMockEvents: true });

const open = Number(params.get("open"));
if (open > 0) {
  const unsubscribe = useDeck.subscribe((state) => {
    if (!state.loaded) return;
    unsubscribe();
    void state.open(open);
  });
}

if (params.has("rename")) {
  const unsubscribe = useDeck.subscribe((state) => {
    if (!state.loaded) return;
    unsubscribe();
    setTimeout(() => {
      const project = document.querySelector('[aria-labelledby="side-title-projects"] .side-item');
      project?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      void emit("menu", "pane-rename-project");
    }, 0);
  });
}

if (params.has("marks")) {
  const unsubscribe = useDeck.subscribe((state) => {
    if (!state.loaded) return;
    unsubscribe();
    useDeck.setState({ markMode: true, marks: [3, 4, 5], cursor: 4 });
  });
}
