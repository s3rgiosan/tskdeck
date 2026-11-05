import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  errorMessage,
  onMenu,
  onSettingsChanged,
  onTskCheckRequested,
  openDocs,
  reportMenuState,
  setWindowTitle,
  zoom,
} from "../api/client";
import type { StatusChange, TaskRow } from "../api/types";
import { statusOf } from "../board/optimistic";
import type { Change, Command } from "../board/undo";
import { groupChoices, sortChoices } from "../board/choices";
import { projectLabelsOf, scopeTitle, sidebarModel } from "../board/sidebar";
import { isTextTarget, resolveKeymap } from "../keys/keymap";
import type { Handler, Handlers } from "../keys/useKeymap";
import { useKeymap } from "../keys/useKeymap";
import { menuAccelerators, runMenuItem } from "../menu";
import type { DeckState } from "../state/store";
import { failure, useDeck } from "../state/store";
import { checkForUpdatesNow, subscribeToUpdates } from "../updates/checks";
import { AssignDialog } from "./AssignDialog";
import { RenameProjectDialog } from "./RenameProjectDialog";
import { Board } from "./Board";
import { CaptureDialog } from "./CaptureDialog";
import { CommandPalette } from "./CommandPalette";
import { DoneDrawer } from "./DoneDrawer";
import { ErrorAlert } from "./ErrorAlert";
import { Loading } from "./Loading";
import { Sidebar } from "./Sidebar";
import type { PaneSize } from "./Splitter";
import { Splitter, useStoredWidth } from "./Splitter";
import { TaskOverlay } from "./TaskOverlay";
import { TaskPane } from "./TaskPane";
import { Toolbar } from "./Toolbar";
import { TskMissing } from "./TskMissing";

function cycle<T>(choices: T[], current: T): T {
  const next = choices.indexOf(current) + 1;
  return choices[next % choices.length];
}

const START: StatusChange = { kind: "start", dispatch: true, again: false, force: false };
const BULK_START: StatusChange = { kind: "start", dispatch: false, again: false, force: false };

/** The marked tasks; else the open task while it is on the board; else the task under the cursor. */
function targetRowsOf(state: DeckState): TaskRow[] {
  const { marks, rows, cursor, openTask } = state;
  if (marks.length > 0) return rows.filter((r) => marks.includes(r.number));
  const current = rows.find((r) => r.number === openTask) ?? rows.find((r) => r.number === cursor);
  return current ? [current] : [];
}

function targetRows(): TaskRow[] {
  return targetRowsOf(useDeck.getState());
}

/** The listed task under the cursor. */
function cursorRow(): TaskRow | undefined {
  const { cursor, visibleRows } = useDeck.getState();
  return visibleRows().find((r) => r.number === cursor);
}

function finishBulk() {
  if (useDeck.getState().marks.length > 0) useDeck.getState().clearMarks();
}

/** Applies one status change to the targets as a single undoable set. */
function targetStatus(change: StatusChange, label: string) {
  const targets = targetRows();
  const cmds: Command[] = targets.map((r) => ({ kind: "status", number: r.number, change }));
  const changes: Change[] = targets.map((r) => ({
    kind: "status",
    number: r.number,
    from: r.status,
    to: statusOf(change),
    dispatched: change.kind === "start" && change.dispatch && r.assignee !== null,
  }));
  void useDeck.getState().runBulk(cmds, changes, label).then(finishBulk);
}

function targetStart() {
  targetStatus(useDeck.getState().marks.length > 0 ? BULK_START : START, "Start");
}

function targetArchive() {
  const targets = targetRows();
  const cmds: Command[] = targets.map((r) => ({ kind: "archive", number: r.number, archived: true }));
  const changes: Change[] = targets.map((r) => ({ kind: "archive", number: r.number, archived: true }));
  void useDeck.getState().runBulk(cmds, changes, "Archive").then(finishBulk);
}

function targetAssign(name: string) {
  const targets = targetRows();
  const input = name === "" ? { unassign: true } : { assignee: name };
  const cmds: Command[] = targets.map((r) => ({ kind: "edit", number: r.number, input }));
  const changes: Change[] = targets.map((r) => ({
    kind: "edit",
    number: r.number,
    before: r.assignee === null ? { unassign: true } : { assignee: r.assignee },
    after: input,
  }));
  void useDeck.getState().runBulk(cmds, changes, "Assign").then(finishBulk);
}

/** Opens the cursor task with its block or review card ready. */
function openWithCard(card: "block" | "review") {
  const [target] = useDeck.getState().marks.length > 0 ? [] : targetRows();
  if (!target) return;
  useDeck.setState({ pendingCard: card });
  void useDeck.getState().open(target.number);
}

/** Opens a dialog and marks it open in the store before it renders and takes focus. */
function opening(open: (value: boolean) => void): () => void {
  return () => {
    useDeck.setState({ modalOpen: true });
    open(true);
  };
}

/** Opens the settings window, or brings it to the front. */
function openSettings() {
  api.openSettings().catch((e: string) => useDeck.setState({ error: errorMessage(e) }));
}

/** Zooms the window; a failure goes to the alert. */
function zoomWindow(direction: "in" | "out" | "reset") {
  zoom(direction).catch((e: string) => useDeck.setState(failure("Zoom couldn't be changed", errorMessage(e))));
}

/** Opens tsk's documentation; a failure goes to the alert. */
function showDocs() {
  openDocs().catch((e: string) => useDeck.setState(failure("Documentation couldn't be opened", errorMessage(e))));
}

/** Subscribes to an event from another window for as long as the component is mounted. */
function useSubscription(subscribe: () => Promise<() => void>) {
  useEffect(() => {
    const stop = subscribe().catch(() => null);
    return () => {
      void stop.then((unlisten) => unlisten?.());
    };
  }, [subscribe]);
}

/** Takes settings saved in the settings window, and looks for tsk again when its path changed. */
function subscribeToSettings() {
  return onSettingsChanged((settings) => {
    if (useDeck.getState().applySettings(settings)) void useDeck.getState().recheckTsk();
  });
}

function subscribeToTskChecks() {
  return onTskCheckRequested(() => void useDeck.getState().recheckTsk());
}

/** Whether a text field in this window has focus; Undo and Redo then act on its typing. */
function useTextFieldFocus(): boolean {
  const [focused, setFocused] = useState(() => isTextTarget(document.activeElement));
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setFocused(isTextTarget(e.target));
    const onFocusOut = (e: FocusEvent) => setFocused(isTextTarget(e.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return focused;
}

/** Below this window width an open task pane or drawer collapses the sidebar. */
const NARROW_WIDTH = 1000;

const SIDEBAR_SIZE: PaneSize = { min: 180, max: 320, initial: 220 };
const PANE_SIZE: PaneSize = { min: 320, max: 600, initial: 420 };

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/** Sidebar, board and the open task, shown beside the board or over it. */
export function Shell() {
  const tsk = useDeck((s) => s.tsk);
  const tskError = useDeck((s) => s.tskError);
  const settings = useDeck((s) => s.settings);
  const openTask = useDeck((s) => s.openTask);
  const init = useDeck((s) => s.init);
  const marked = useDeck((s) => s.marks.length);
  const markMode = useDeck((s) => s.markMode);
  const scope = useDeck((s) => s.scope);
  const allRows = useDeck((s) => s.allRows);
  const options = useDeck((s) => s.options);
  const undoName = useDeck((s) => (s.irreversible === null ? (s.undo[s.undo.length - 1]?.label ?? null) : null));
  const canUndo = useDeck((s) => s.irreversible !== null || s.undo.length > 0);
  const textField = useTextFieldFocus();
  const [capturing, setCapturing] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // The path of the project being renamed.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  // An explicit Show Sidebar while the narrow-window collapse applies; it lasts until the collapse ends.
  const [sidebarShown, setSidebarShown] = useState(false);
  const hasTargets = useDeck((s) => targetRowsOf(s).length > 0);
  const errorInPane = useDeck((s) => s.errorTask !== null && s.errorTask === s.openTask);
  const [sidebarWidth, setSidebarWidth] = useStoredWidth("tskdeck.sidebarWidth", SIDEBAR_SIZE);
  const [paneWidth, setPaneWidth] = useStoredWidth("tskdeck.paneWidth", PANE_SIZE);
  const keymap = useMemo(() => resolveKeymap(settings.keymap), [settings.keymap]);
  const accelerators = useMemo(() => menuAccelerators(keymap), [keymap]);
  const width = useWindowWidth();
  const overlay = settings.openMode === "overlay" && openTask !== null;
  const slotOpen = (openTask !== null && !overlay) || drawer;
  const collapsed = width < NARROW_WIDTH && slotOpen;
  const sidebarHidden = settings.sidebarHidden || (collapsed && !sidebarShown);
  const projectNames = settings.projectNames;
  const title = useMemo(
    () => scopeTitle(scope, sidebarModel(allRows, projectNames), projectNames),
    [scope, allRows, projectNames],
  );

  useEffect(() => {
    void init();
  }, [init]);
  useSubscription(subscribeToSettings);
  useSubscription(subscribeToTskChecks);
  useSubscription(subscribeToUpdates);

  useEffect(() => {
    if (sidebarHidden && useDeck.getState().focus === "sidebar") useDeck.setState({ focus: "board" });
  }, [sidebarHidden]);

  useEffect(() => {
    if (openTask !== null) setDrawer(false);
  }, [openTask]);

  useEffect(() => {
    if (!collapsed) setSidebarShown(false);
  }, [collapsed]);

  const state = useDeck.getState;
  const onBoard = (fn: Handler) => () => state().focus !== "sidebar" && fn() !== false;
  const outsideTask = (fn: Handler) => () => state().focus !== "task" && fn() !== false;
  const onTargets = (fn: Handler) => () => state().focus === "board" && targetRows().length > 0 && fn() !== false;
  const modalOpen = capturing || assigning || palette || renaming !== null;

  useEffect(() => {
    useDeck.setState({ modalOpen });
  }, [modalOpen]);

  const ready = tskError === null && tsk !== null && tsk.supported;

  const takesCommands = ready && !modalOpen;
  useEffect(() => {
    reportMenuState({
      sidebarVisible: !sidebarHidden,
      drawerOpen: drawer,
      taskSelected: takesCommands && hasTargets,
      group: options.group,
      sort: options.sort,
      groups: takesCommands ? groupChoices(scope) : [],
      sorts: takesCommands ? sortChoices(scope) : [],
      undo: takesCommands ? undoName : null,
      canUndo: takesCommands && canUndo,
      textField,
      accelerators,
    }).catch(() => null);
  }, [sidebarHidden, drawer, takesCommands, hasTargets, options, scope, undoName, canUndo, textField, accelerators]);

  useEffect(() => {
    if (!ready) return;
    setWindowTitle(title).catch(() => null);
  }, [ready, title]);

  // Dialogs live on the board; when it gives way to Loading or the tsk-missing screen they close.
  useEffect(() => {
    if (ready) return;
    setCapturing(false);
    setAssigning(false);
    setPalette(false);
    setRenaming(null);
  }, [ready]);
  const capture = opening(setCapturing);

  function rename(path: string) {
    useDeck.setState({ modalOpen: true });
    setRenaming(path);
  }

  /** The label a project has without a name. */
  function folderLabel(path: string): string {
    const others = { ...projectNames };
    delete others[path];
    return projectLabelsOf(allRows, others).get(path) ?? path;
  }
  // Acts on what is on screen: a sidebar the narrow window collapsed shows without changing the
  // saved choice, and one shown over that collapse hides the same way.
  const toggleSidebar = () => {
    const current = state().settings;
    if (sidebarHidden) {
      if (collapsed) setSidebarShown(true);
      if (current.sidebarHidden) void state().saveSettings({ ...current, sidebarHidden: false });
    } else if (sidebarShown) {
      setSidebarShown(false);
    } else {
      void state().saveSettings({ ...current, sidebarHidden: true });
    }
  };
  const handlers: Handlers = {
    "nav.down": onBoard(() => state().moveCursor(1)),
    "nav.up": onBoard(() => state().moveCursor(-1)),
    "task.open": () => {
      const target = cursorRow();
      if (state().focus !== "board" || !target) return false;
      void state().open(target.number);
    },
    "task.close": () => {
      const { marks, markMode, openTask, query } = state();
      if (openTask !== null) state().close();
      else if (marks.length > 0 || markMode) state().clearMarks();
      else if (drawer) setDrawer(false);
      else if (query !== "") state().setQuery("");
      else return false;
    },
    capture,
    palette: opening(setPalette),
    settings: openSettings,
    "zoom.in": () => zoomWindow("in"),
    "zoom.out": () => zoomWindow("out"),
    "zoom.reset": () => zoomWindow("reset"),
    "help.docs": showDocs,
    "updates.check": checkForUpdatesNow,
    search: () => setSearchFocus((n) => n + 1),
    undo: () => void state().undoLast(),
    // The drawer takes the task pane's place, so opening it closes the open task.
    "drawer.done": outsideTask(() => {
      if (!drawer && state().openTask !== null) state().close();
      setDrawer(!drawer);
    }),
    "mark.mode": onBoard(() => state().setMarkMode(!state().markMode)),
    "mark.toggle": onBoard(() => {
      const target = cursorRow();
      if (!target) return false;
      state().toggleMark(target.number);
    }),
    "mark.up": onBoard(() => state().markStep(-1)),
    "mark.down": onBoard(() => state().markStep(1)),
    "status.start": onTargets(targetStart),
    "status.ready": onTargets(() => targetStatus({ kind: "ready" }, "Mark Ready")),
    "status.open": onTargets(() => targetStatus({ kind: "open" }, "Reopen")),
    "status.done": onTargets(() => targetStatus({ kind: "done", clean: false }, "Mark Done")),
    archive: onTargets(targetArchive),
    "status.block": onTargets(() => openWithCard("block")),
    "status.review": onTargets(() => openWithCard("review")),
    assign: onTargets(opening(setAssigning)),
    "view.desk": outsideTask(() => void state().selectScope({ kind: "desk" })),
    "view.lastProject": outsideTask(() => {
      const { lastProject } = state();
      if (!lastProject) return false;
      void state().selectScope(lastProject);
    }),
    "view.all": outsideTask(() => void state().selectScope({ kind: "all" })),
    "focus.toggle": outsideTask(() => {
      if (sidebarHidden && state().focus !== "sidebar") return false;
      useDeck.setState({ focus: state().focus === "sidebar" ? "board" : "sidebar" });
    }),
    "sidebar.toggle": toggleSidebar,
    group: () => {
      const { scope, options } = state();
      void state().setOptions({ group: cycle(groupChoices(scope), options.group) });
    },
    sort: () => {
      const { scope, options } = state();
      void state().setOptions({ sort: cycle(sortChoices(scope), options.sort) });
    },
  };

  // Palette actions run from the board, so they act on the open task or the cursor task wherever the palette was opened.
  // An action that does nothing leaves the keyboard where it was.
  const paletteHandlers: Handlers = {};
  for (const [id, fn] of Object.entries(handlers) as [keyof Handlers, Handler][]) {
    if (id === "palette") continue;
    paletteHandlers[id] = () => {
      const previous = state().focus;
      useDeck.setState({ focus: "board" });
      const acted = fn() !== false;
      if (!acted) useDeck.setState({ focus: previous });
      return acted;
    };
  }

  // Until tsk is ready only Settings has a screen to open; it is where the tsk path is set.
  const active: Handlers = ready ? handlers : { settings: handlers.settings };
  useKeymap(keymap, modalOpen ? {} : active, "board");

  // Menu bar items act like palette actions, on the open task or the cursor task.
  const menuHandlers = useRef<Handlers>({});
  menuHandlers.current = takesCommands ? { ...paletteHandlers, palette: handlers.palette } : {};
  const menuChoices = useRef(takesCommands);
  menuChoices.current = takesCommands;
  useEffect(() => {
    const stop = onMenu((id) =>
      runMenuItem(id, menuHandlers.current, (choice) => {
        if (menuChoices.current) void useDeck.getState().setOptions(choice);
      }),
    ).catch(() => null);
    return () => {
      void stop.then((unlisten) => unlisten?.());
    };
  }, []);

  if (tskError !== null || (tsk !== null && !tsk.supported)) {
    return (
      <>
        <TskMissing tsk={tsk} error={tskError} onChoosePath={openSettings} />
        <ErrorAlert />
      </>
    );
  }
  if (tsk === null) {
    return (
      <div className="screen is-centred" data-tauri-drag-region>
        <Loading />
        <ErrorAlert />
      </div>
    );
  }

  const paneSplitter = (
    <Splitter label="Resize Pane" edge="left" width={paneWidth} size={PANE_SIZE} onResize={setPaneWidth} />
  );
  const widths = { "--sidebar-width": `${sidebarWidth}px`, "--pane-width": `${paneWidth}px` } as CSSProperties;
  const showMarkbar = markMode || marked > 0;

  return (
    <div className={sidebarHidden ? "shell is-sidebar-hidden" : "shell"} style={widths}>
      {!sidebarHidden && <Sidebar onRename={rename} />}
      {!sidebarHidden && (
        <Splitter
          label="Resize Sidebar"
          edge="right"
          width={sidebarWidth}
          size={SIDEBAR_SIZE}
          className="sidebar-splitter"
          onResize={setSidebarWidth}
        />
      )}
      <Toolbar
        title={title}
        sidebarHidden={sidebarHidden}
        searchFocus={searchFocus}
        onToggleSidebar={toggleSidebar}
        onNewTask={capture}
      />
      <main className={showMarkbar ? "main has-markbar" : "main"}>
        {showMarkbar && (
          <div className="markbar" role="status">
            {marked} marked. Esc leaves multi-select.
          </div>
        )}
        <Board onNewTask={capture} />
      </main>
      {drawer && (
        <div className="task-area">
          {paneSplitter}
          <div className="task-scroll">
            <DoneDrawer onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}
      {openTask !== null && !overlay && (
        <div className="task-area">
          {paneSplitter}
          <div className="task-scroll">
            <TaskPane key={openTask} />
          </div>
        </div>
      )}
      {openTask !== null && overlay && <TaskOverlay />}
      {capturing && <CaptureDialog onClose={() => setCapturing(false)} />}
      {assigning && (
        <AssignDialog
          count={Math.max(marked, 1)}
          onClose={() => setAssigning(false)}
          onSubmit={(name) => {
            setAssigning(false);
            targetAssign(name);
          }}
        />
      )}
      {renaming !== null && (
        <RenameProjectDialog
          path={renaming}
          name={projectNames[renaming] ?? ""}
          folderLabel={folderLabel(renaming)}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => {
            setRenaming(null);
            void useDeck.getState().renameProject(renaming, name);
          }}
        />
      )}
      {palette && (
        <CommandPalette
          keymap={keymap}
          handlers={paletteHandlers}
          labels={{
            "drawer.done": drawer ? "Hide Done Drawer" : "Show Done Drawer",
            "sidebar.toggle": sidebarHidden ? "Show Sidebar" : "Hide Sidebar",
          }}
          onClose={() => setPalette(false)}
        />
      )}
      {!modalOpen && !errorInPane && <ErrorAlert />}
    </div>
  );
}
