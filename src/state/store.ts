import { create } from "zustand";
import { api, errorMessage, onBoardChanged } from "../api/client";
import type {
  CaptureInput,
  ListOptions,
  Scope,
  Settings,
  Step,
  TaskDetail,
  TaskRow,
  TskError,
  TskInfo,
} from "../api/types";
import type { SearchDoc } from "../board/search";
import { matchesQuery } from "../board/search";
import { runBulk as runSequential } from "../board/bulk";
import { groupChoices, sortChoices } from "../board/choices";
import { applyOptimistic } from "../board/optimistic";
import { buildBoard, liveNumbersOf } from "../board/sections";
import type { ProjectNames } from "../board/sidebar";
import { onDesk, projectLabelsOf, sameScope, sortByProject } from "../board/sidebar";
import type { Change, Command, UndoEntry } from "../board/undo";
import { inverseOf } from "../board/undo";

export type Focus = "sidebar" | "board" | "task";

/** The last write tsk refused, kept so the open task can offer a way forward. */
export interface Refusal {
  code: string;
  cmd: Command;
  label: string;
}

export interface DeckState {
  tsk: TskInfo | null;
  tskError: TskError | null;
  settings: Settings;
  /** True once `settings` holds what the settings file holds; saves read the file first while false. */
  settingsLoaded: boolean;
  scope: Scope;
  lastProject: Scope | null;
  options: ListOptions;
  allRows: TaskRow[];
  rows: TaskRow[];
  /** The current scope's rows as the last listing returned them, before any optimistic change. */
  listedRows: TaskRow[];
  /** True once the first listing has arrived. */
  loaded: boolean;
  /** Number of the task under the cursor. */
  cursor: number | null;
  /** A just-captured task the next completed refresh puts the cursor on, when it is listed. */
  pendingCursor: number | null;
  openTask: number | null;
  detail: TaskDetail | null;
  marks: number[];
  markMode: boolean;
  undo: UndoEntry[];
  query: string;
  searchIndex: Map<number, SearchDoc>;
  /** Label of the latest write that has no inverse; the next undo reports it. */
  irreversible: string | null;
  /** A card the open task should show as soon as it is on screen. */
  pendingCard: "block" | "review" | null;
  /** The latest failure's informative text; an alert or the place it belongs to shows it. */
  error: string | null;
  /** States the situation the failure left; the alert's title. */
  errorTitle: string | null;
  /** The task the failure belongs to; while that task is open, its pane shows the failure. */
  errorTask: number | null;
  refusal: Refusal | null;
  focus: Focus;
  /** True while a dialog (palette, settings, capture, assign) owns the keyboard. */
  modalOpen: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  selectScope: (scope: Scope) => Promise<void>;
  setOptions: (partial: Partial<ListOptions>) => Promise<void>;
  moveCursor: (delta: number) => void;
  open: (number: number) => Promise<void>;
  /**
   * Makes a row the task that task actions act on, as a right-click does. A marked row keeps the
   * marks; otherwise the marks clear and the cursor moves to the row, which an open task pane
   * then shows.
   */
  select: (number: number) => void;
  close: () => void;
  /** Resolves to true when tsk wrote the change, false when tsk refused it or the write failed. */
  run: (cmd: Command, change: Change, label: string) => Promise<boolean>;
  /** Resolves to true when tsk wrote every change, false when any of them was refused or failed. */
  runBulk: (cmds: Command[], changes: Change[], label: string) => Promise<boolean>;
  undoLast: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<number | null>;
  setQuery: (query: string) => void;
  ensureSearchIndex: () => Promise<void>;
  /** Rows of the current scope that match `query`. */
  visibleRows: () => TaskRow[];
  toggleMark: (number: number) => void;
  setMarkMode: (on: boolean) => void;
  /** Marks the row under the cursor, moves by `delta` and marks that row too. */
  markStep: (delta: number) => void;
  clearMarks: () => void;
  saveSettings: (settings: Settings) => Promise<void>;
  /** Saves the name tskdeck shows for a project; a blank name clears it. */
  renameProject: (path: string, name: string) => Promise<void>;
  /** Takes settings saved by another window; returns whether the tsk path changed. */
  applySettings: (settings: Settings) => boolean;
  /** Looks for tsk again, for example after the path setting changed. */
  recheckTsk: () => Promise<void>;
}

const LIVE: ListOptions = { shelf: "live", group: "none", sort: "recent" };

/** The state a failure leaves: its alert title, its text and, when it belongs to one, the task. */
export function failure(title: string, message: string, task: number | null = null) {
  return { error: message, errorTitle: title, errorTask: task };
}

/** Drops a failure that belongs to a task, which leaves the screen with that task's pane. */
function taskErrorCleared(state: DeckState) {
  return state.errorTask === null ? {} : { error: null, errorTitle: null, errorTask: null };
}

const INDEX_CONCURRENCY = 4;

/** Rows whose search document (the index entry, else the listing fields) matches `query`. */
export function filterRows(rows: TaskRow[], query: string, index: Map<number, SearchDoc>): TaskRow[] {
  if (query.trim() === "") return rows;
  return rows.filter((r) => matchesQuery(index.get(r.number) ?? r, query));
}

/**
 * Listed rows in board order. tsk sorts projects by folder name, so Sort By Project is redone here by
 * project label, which keeps projects that share a folder name apart and follows the names given to them.
 */
function listedOrder(rows: TaskRow[], options: ListOptions, allRows: TaskRow[], names: ProjectNames): TaskRow[] {
  if (options.sort !== "project") return rows;
  return sortByProject(rows, projectLabelsOf([...allRows, ...rows], names));
}

/** Rows in the order the board shows them. */
export function boardOrder(rows: TaskRow[], allRows: TaskRow[]): TaskRow[] {
  const board = buildBoard(rows, liveNumbersOf(allRows));
  return [...board.needsYou, ...board.inMotion, ...board.ready, ...board.inbox];
}

/** Position of the cursor task in `order`, or -1. */
function indexOf(order: TaskRow[], cursor: number | null): number {
  return cursor === null ? -1 : order.findIndex((r) => r.number === cursor);
}

/** The cursor after a listing change: the same task while it is listed, else the task now in its place. */
function keepCursor(cursor: number | null, before: TaskRow[], after: TaskRow[]): number | null {
  if (cursor === null || after.length === 0) return null;
  if (after.some((r) => r.number === cursor)) return cursor;
  const was = indexOf(before, cursor);
  return after[Math.min(Math.max(was, 0), after.length - 1)].number;
}

/**
 * The current scope's rows. The desk is the `--all` listing narrowed by the rule the desk count uses;
 * with the default grouping and sorting it reuses the live `--all` listing in `all`.
 */
async function listBoard(scope: Scope, options: ListOptions, all: Promise<TaskRow[]>): Promise<TaskRow[]> {
  if (scope.kind !== "desk") return api.listScope(scope, options);
  const plain = options.shelf === LIVE.shelf && options.group === LIVE.group && options.sort === LIVE.sort;
  const rows = plain ? await all : await api.listScope({ kind: "all" }, options);
  return rows.filter(onDesk);
}

function messageOf(e: unknown): string {
  return errorMessage(e as TskError | string);
}

function kindOf(e: unknown): string | null {
  return typeof e === "object" && e !== null && "kind" in e ? String((e as { kind: unknown }).kind) : null;
}

/** A failed write's text: tsk's message, followed by a note that the board was re-read when tsk could not save. */
function writeFailureText(e: unknown): string {
  const kind = kindOf(e);
  const message = messageOf(e);
  return kind === "store" ? `${message}; the board was re-read` : message;
}

/** The index without the entries of `numbers`, so those tasks are read again before a search matches them. */
function withoutEntries(index: Map<number, SearchDoc>, numbers: number[]): Map<number, SearchDoc> {
  if (!numbers.some((n) => index.has(n))) return index;
  const next = new Map(index);
  for (const n of numbers) next.delete(n);
  return next;
}

/** The marks whose task is among `visible`. */
function marksIn(marks: number[], visible: TaskRow[]): number[] {
  const shown = new Set(visible.map((r) => r.number));
  const kept = marks.filter((n) => shown.has(n));
  return kept.length === marks.length ? marks : kept;
}

/** `current` with the fields `edited` changes relative to `base`, the settings `edited` was made from. */
function changedOnto(base: Settings, edited: Settings, current: Settings): Settings {
  const changed = Object.fromEntries(
    Object.entries(edited).filter(([key, value]) => value !== base[key as keyof Settings]),
  ) as Partial<Settings>;
  return { ...current, ...changed };
}

function execute(cmd: Command): Promise<void> {
  switch (cmd.kind) {
    case "status":
      return api.setStatus(cmd.number, cmd.change);
    case "edit":
      return api.editTask(cmd.number, cmd.input);
    case "step":
      return api.step(cmd.number, cmd.op);
    case "archive":
      return api.setArchived(cmd.number, cmd.archived);
    default:
      return Promise.resolve();
  }
}

/** Whether `cmd` marks the open task done, which takes it off the board, so the task view closes. */
function finishesOpenTask(cmd: Command, openTask: number | null): boolean {
  return cmd.kind === "status" && cmd.change.kind === "done" && cmd.number === openTask;
}

/** Keeps a slow listing from overwriting a newer one. */
let refreshSeq = 0;
let subscribing = false;
/** True while an undo runs; a second undo meanwhile is ignored. */
let undoing = false;
/** Serialises settings saves so each one starts from the settings the previous one saved. */
let settingsSaving: Promise<unknown> = Promise.resolve();
let unlisten: (() => void) | null = null;
/** Re-reads the board when the window regains focus, which also lets tskdeck watch a store folder created meanwhile. */
let onWindowFocus: (() => void) | null = null;

/** Drops the board-changed subscription and the window focus listener so the next `init()` can add them again. */
export function resetBoardSubscription(): void {
  unlisten?.();
  unlisten = null;
  subscribing = false;
  if (onWindowFocus !== null) window.removeEventListener("focus", onWindowFocus);
  onWindowFocus = null;
}

type Set_ = (partial: Partial<DeckState>) => void;
type Get_ = () => DeckState;

/** Pushes one undo entry when every change can be reversed; otherwise remembers the label for the next undo. */
function record(set: Set_, get: Get_, label: string, changes: Change[]): void {
  if (changes.every((c) => inverseOf(c) !== null)) {
    set({ undo: [...get().undo, { label, changes }], irreversible: null });
  } else {
    set({ irreversible: label });
  }
}

/** The task as tsk has it right after a step add, read directly so a concurrent refresh cannot hide the new step. */
async function stepsAfterAdd(change: Change, cmd: Command): Promise<TaskDetail | null> {
  if (change.kind !== "step" || cmd.kind !== "step" || cmd.op.kind !== "add") return null;
  try {
    return await api.getTask(cmd.number);
  } catch {
    return null;
  }
}

/** A step add becomes reversible once exactly one new step with the added text appears in the refreshed detail. */
function recordStepId(change: Change, cmd: Command, before: Step[] | null, after: TaskDetail | null): Change {
  if (change.kind !== "step" || cmd.kind !== "step" || cmd.op.kind !== "add" || change.before.newId) return change;
  if (before === null || after === null || after.number !== cmd.number) return change;
  const known = new Set(before.map((s) => s.short_id));
  const added = after.steps.filter((s) => !known.has(s.short_id));
  if (added.length !== 1 || added[0].text !== cmd.op.text) return change;
  return { ...change, before: { ...change.before, newId: added[0].short_id } };
}

/**
 * Makes sure `settings` holds the file's settings: when the first read failed, reads the file again.
 * Returns false, with the failure set, when the file still cannot be read.
 */
async function ensureSettings(set: Set_, get: Get_): Promise<boolean> {
  if (get().settingsLoaded) return true;
  try {
    const settings = await api.getSettings();
    set({ settings, settingsLoaded: true });
    return true;
  } catch (e) {
    set(failure("Settings couldn't be saved", messageOf(e)));
    return false;
  }
}

/** Saves the settings `build` makes from the current ones, once every earlier save has finished. */
function queueSave(set: Set_, get: Get_, build: (current: Settings) => Settings): Promise<void> {
  const saving = settingsSaving.then(async () => {
    const ready = await ensureSettings(set, get);
    if (!ready) return;
    const next = build(get().settings);
    try {
      await api.saveSettings(next);
      set({ settings: next });
    } catch (e) {
      set(failure("Settings couldn't be saved", messageOf(e)));
    }
  });
  settingsSaving = saving;
  return saving;
}

/** Reads the open task again after a listing; a failure belongs to that task. */
async function rereadOpenTask(set: Set_, get: Get_, seq: number, number: number): Promise<void> {
  try {
    const detail = await api.getTask(number);
    const current = get().openTask;
    if (seq === refreshSeq && current === number) set({ detail });
  } catch (e) {
    const current = get().openTask;
    if (seq === refreshSeq && current === number) set(failure(`T${number} couldn't be opened`, messageOf(e), number));
  }
}

/** Serialises index fills so overlapping calls never fetch the same task twice. A cleared index drops fetches still in flight. */
let indexing: Promise<void> = Promise.resolve();
async function fillIndex(set: Set_, get: Get_): Promise<void> {
  const start = get().searchIndex;
  const missing = get()
    .rows.map((r) => r.number)
    .filter((n) => !start.has(n));
  const found = new Map<number, SearchDoc>();
  let next = 0;
  async function worker() {
    while (next < missing.length) {
      const number = missing[next++];
      try {
        const task = await api.getTask(number);
        found.set(number, {
          number,
          title: task.title,
          thread: task.thread,
          assignee: task.assignee,
          notes: task.notes,
          steps: task.steps.map((s) => s.text),
        });
      } catch {
        // A task that cannot be read stays searchable by its listing fields.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(INDEX_CONCURRENCY, missing.length) }, worker));
  const current = get().searchIndex;
  if (current !== start || found.size === 0) return;
  set({ searchIndex: new Map([...current, ...found]) });
}

export const useDeck = create<DeckState>()((set, get) => ({
  tsk: null,
  tskError: null,
  settings: { openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true },
  settingsLoaded: false,
  scope: { kind: "desk" },
  lastProject: null,
  options: LIVE,
  allRows: [],
  rows: [],
  listedRows: [],
  loaded: false,
  cursor: null,
  pendingCursor: null,
  openTask: null,
  detail: null,
  marks: [],
  markMode: false,
  undo: [],
  query: "",
  searchIndex: new Map(),
  irreversible: null,
  pendingCard: null,
  error: null,
  errorTitle: null,
  errorTask: null,
  refusal: null,
  focus: "board",
  modalOpen: false,

  async init() {
    try {
      const [tsk, settings] = await Promise.all([
        api.tskInfo().catch((e: TskError) => {
          set({ tskError: e });
          return null;
        }),
        api.getSettings().catch((e: string) => {
          set(failure("Settings couldn't be loaded", messageOf(e)));
          return null;
        }),
      ]);
      if (settings) set({ settings, settingsLoaded: true });
      if (tsk) set({ tsk });
      if (!tsk || !tsk.supported) return;
      await get().refresh();
      if (onWindowFocus === null) {
        onWindowFocus = () => void get().refresh();
        window.addEventListener("focus", onWindowFocus);
      }
      if (!subscribing) {
        subscribing = true;
        try {
          unlisten = await onBoardChanged(() => {
            set({ searchIndex: new Map() });
            void get().refresh();
          });
        } catch (e) {
          // The next init() or recheckTsk() subscribes again.
          subscribing = false;
          throw e;
        }
      }
    } catch (e) {
      set(failure("The board couldn't be loaded", messageOf(e)));
    }
  },

  async refresh() {
    const seq = ++refreshSeq;
    const { scope, options } = get();
    try {
      const all = api.listScope({ kind: "all" }, LIVE);
      const [allRows, listed] = await Promise.all([all, listBoard(scope, options, all)]);
      if (seq !== refreshSeq) return;
      const rows = listedOrder(listed, options, allRows, get().settings.projectNames);
      const { cursor, pendingCursor, openTask, query, searchIndex, marks } = get();
      // The board as last listed: an optimistic write may already have taken the cursor task off `rows`.
      const before = boardOrder(filterRows(get().listedRows, query, searchIndex), get().allRows);
      const visible = filterRows(rows, query, searchIndex);
      const after = boardOrder(visible, allRows);
      const captured = pendingCursor !== null && after.some((r) => r.number === pendingCursor);
      set({
        allRows,
        rows,
        listedRows: rows,
        loaded: true,
        cursor: captured ? pendingCursor : keepCursor(cursor, before, after),
        pendingCursor: null,
        marks: marksIn(marks, visible),
      });
      const searching = get().query.trim();
      if (searching !== "") void get().ensureSearchIndex();
      if (openTask !== null) await rereadOpenTask(set, get, seq, openTask);
    } catch (e) {
      if (seq !== refreshSeq) return;
      const kind = kindOf(e);
      if (kind === "notFound") set({ tskError: e as TskError });
      set({ ...failure("The board couldn't be loaded", messageOf(e)), loaded: true });
    }
  },

  async selectScope(scope) {
    // The open task's pane belongs to the board it was opened from.
    if (!sameScope(scope, get().scope)) get().close();
    const current = get().options;
    const group = groupChoices(scope).includes(current.group) ? current.group : "none";
    const sort = sortChoices(scope).includes(current.sort) ? current.sort : "recent";
    set({
      scope,
      lastProject: scope.kind === "project" ? scope : get().lastProject,
      options: { ...current, group, sort },
      cursor: null,
      marks: [],
      markMode: false,
      focus: "board",
    });
    await get().refresh();
  },

  async setOptions(partial) {
    set({ options: { ...get().options, ...partial } });
    await get().refresh();
  },

  moveCursor(delta) {
    const { allRows, cursor, openTask } = get();
    const order = boardOrder(get().visibleRows(), allRows);
    if (order.length === 0) {
      set({ cursor: null });
      return;
    }
    const at = indexOf(order, cursor);
    const start = at !== -1 ? at : delta > 0 ? -1 : order.length;
    const next = order[Math.max(0, Math.min(order.length - 1, start + delta))].number;
    set({ cursor: next });
    if (openTask !== null) {
      void get().open(next);
    }
  },

  async open(number) {
    const listed = get().visibleRows().some((r) => r.number === number);
    const shown = get().detail?.number;
    set({
      openTask: number,
      refusal: null,
      cursor: listed ? number : get().cursor,
      focus: "task",
      ...(shown === number ? {} : { detail: null }),
      ...taskErrorCleared(get()),
    });
    try {
      const detail = await api.getTask(number);
      const current = get().openTask;
      if (current === number) set({ detail });
    } catch (e) {
      const current = get().openTask;
      if (current === number) set(failure(`T${number} couldn't be opened`, messageOf(e), number));
    }
  },

  select(number) {
    const { marks, openTask } = get();
    if (marks.includes(number)) return;
    set({ marks: [], markMode: false, cursor: number, focus: "board" });
    if (openTask !== null && openTask !== number) void get().open(number);
  },

  close() {
    set({ openTask: null, detail: null, refusal: null, focus: "board", ...taskErrorCleared(get()) });
  },

  async run(cmd, change, label) {
    const before = { rows: get().rows, detail: get().detail };
    const stepsBefore = before.detail?.number === cmd.number ? before.detail.steps : null;
    set({ ...applyOptimistic(before.rows, before.detail, cmd), refusal: null, ...taskErrorCleared(get()) });
    try {
      await execute(cmd);
    } catch (e) {
      const refused = kindOf(e) === "refused";
      set({
        ...before,
        ...failure(`${label} couldn't be completed`, writeFailureText(e), cmd.number),
        refusal: refused ? { code: (e as { code: string }).code, cmd, label } : null,
      });
      await get().refresh();
      return false;
    }
    set({ searchIndex: withoutEntries(get().searchIndex, [cmd.number]) });
    const written = await stepsAfterAdd(change, cmd);
    if (finishesOpenTask(cmd, get().openTask)) get().close();
    await get().refresh();
    record(set, get, label, [recordStepId(change, cmd, stepsBefore, written)]);
    return true;
  },

  async runBulk(cmds, changes, label) {
    let { rows, detail } = get();
    for (const cmd of cmds) {
      ({ rows, detail } = applyOptimistic(rows, detail, cmd));
    }
    set({ rows, detail });
    const result = await runSequential(
      cmds.map((_, i) => i),
      (i) => execute(cmds[i]),
    );
    const done = result.ok.map((i) => changes[i]);
    set({ searchIndex: withoutEntries(get().searchIndex, result.ok.map((i) => cmds[i].number)) });
    if (done.length > 0) record(set, get, label, done);
    if (result.ok.some((i) => finishesOpenTask(cmds[i], get().openTask))) get().close();
    const failed = result.failed.length > 0;
    if (failed) {
      const lines = result.failed.map((f) => `T${cmds[f.number].number}: ${writeFailureText(f.error)}`);
      set(failure(`${label} couldn't be completed for every task`, lines.join("\n")));
    }
    await get().refresh();
    return !failed;
  },

  async undoLast() {
    if (undoing) return;
    const stack = get().undo;
    const { irreversible } = get();
    if (irreversible !== null) {
      set({ irreversible: null, ...failure("Undo isn't available", `Can't undo ${irreversible}`) });
      return;
    }
    const entry = stack[stack.length - 1];
    if (!entry) return;
    undoing = true;
    try {
      set({ undo: stack.slice(0, -1) });
      for (let i = entry.changes.length - 1; i >= 0; i--) {
        const change = entry.changes[i];
        const inverse = inverseOf(change);
        if (!inverse) continue;
        try {
          await execute(inverse);
        } catch (e) {
          set({
            undo: [...get().undo, { label: entry.label, changes: entry.changes.slice(0, i + 1) }],
            ...failure(`${entry.label} couldn't be undone`, `T${change.number}: ${writeFailureText(e)}`, change.number),
          });
          break;
        }
      }
      await get().refresh();
    } finally {
      undoing = false;
    }
  },

  async capture(input) {
    try {
      const number = await api.capture(input);
      set({ irreversible: "capture", searchIndex: new Map(), pendingCursor: number });
      await get().refresh();
      return number;
    } catch (e) {
      set(failure("The task couldn't be captured", messageOf(e)));
      return null;
    }
  },

  setQuery(query) {
    const { rows, searchIndex, marks } = get();
    set({ query, cursor: null, marks: marksIn(marks, filterRows(rows, query, searchIndex)) });
    const searching = query.trim();
    if (searching !== "") void get().ensureSearchIndex();
  },

  ensureSearchIndex() {
    indexing = indexing.then(() => fillIndex(set, get));
    return indexing;
  },

  visibleRows() {
    const { rows, query, searchIndex } = get();
    return filterRows(rows, query, searchIndex);
  },

  toggleMark(number) {
    const { marks } = get();
    set({ marks: marks.includes(number) ? marks.filter((n) => n !== number) : [...marks, number] });
  },

  setMarkMode(on) {
    set(on ? { markMode: true } : { markMode: false, marks: [] });
  },

  markStep(delta) {
    const { allRows, cursor, marks } = get();
    const order = boardOrder(get().visibleRows(), allRows);
    if (order.length === 0) return;
    const at = indexOf(order, cursor);
    const from = at !== -1 ? at : delta > 0 ? 0 : order.length - 1;
    const to = Math.max(0, Math.min(order.length - 1, from + delta));
    const added = [order[from].number, order[to].number].filter((n) => !marks.includes(n));
    set({ marks: [...marks, ...new Set(added)], markMode: true, cursor: order[to].number });
  },

  clearMarks() {
    set({ marks: [], markMode: false });
  },

  async recheckTsk() {
    set({ tsk: null, tskError: null });
    await api.relocateTsk().catch((e: string) => set(failure("tsk couldn't be located", messageOf(e))));
    await get().init();
  },

  applySettings(settings) {
    const pathChanged = settings.tskPath !== get().settings.tskPath;
    set({ settings, settingsLoaded: true });
    return pathChanged;
  },

  saveSettings(settings) {
    const base = get().settings;
    return queueSave(set, get, (current) => changedOnto(base, settings, current));
  },

  async renameProject(path, name) {
    const trimmed = name.trim();
    await queueSave(set, get, (current) => {
      const projectNames = { ...current.projectNames };
      if (trimmed === "") delete projectNames[path];
      else projectNames[path] = trimmed;
      return { ...current, projectNames };
    });
    const { rows, listedRows, options, allRows, settings } = get();
    const names = settings.projectNames;
    set({ rows: listedOrder(rows, options, allRows, names), listedRows: listedOrder(listedRows, options, allRows, names) });
  },
}));
