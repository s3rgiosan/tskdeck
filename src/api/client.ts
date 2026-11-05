import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import type {
  CaptureInput,
  EditInput,
  Group,
  ListOptions,
  Scope,
  Settings,
  Sort,
  StatusChange,
  StepOp,
  TaskDetail,
  TaskRow,
  TskError,
  TskInfo,
  UpdateCheckResult,
  UpdateInfo,
  UpdateProgress,
} from "./types";

export const api = {
  tskInfo: () => invoke<TskInfo>("tsk_info"),
  listScope: (scope: Scope, options: ListOptions) =>
    invoke<TaskRow[]>("list_scope", { scope, options }),
  getTask: (number: number) => invoke<TaskDetail>("get_task", { number }),
  capture: (input: CaptureInput) => invoke<number>("capture", { input }),
  setStatus: (number: number, change: StatusChange) =>
    invoke<void>("set_status", { number, change }),
  editTask: (number: number, input: EditInput) => invoke<void>("edit_task", { number, input }),
  step: (number: number, op: StepOp) => invoke<void>("step", { number, op }),
  reply: (number: number, text: string, send: boolean) =>
    invoke<void>("reply", { number, text, send }),
  setArchived: (number: number, archived: boolean) =>
    invoke<void>("set_archived", { number, archived }),
  // Rejects with a plain string, not a TskError.
  getSettings: () => invoke<Settings>("get_settings"),
  // Rejects with a plain string, not a TskError.
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  /** Looks for the tsk binary again. Rejects with a plain string, not a TskError. */
  relocateTsk: () => invoke<void>("relocate_tsk"),
  /** Opens the settings window, or brings it to the front. */
  openSettings: () => invoke<void>("open_settings"),
  /** Looks for a newer release now. Rejects with a plain string, not a TskError. */
  checkForUpdates: () => invoke<UpdateInfo | null>("check_for_updates"),
  /** The release the last successful check found. */
  pendingUpdate: () => invoke<UpdateInfo | null>("pending_update"),
  /** Downloads and installs the pending update, then relaunches. Rejects with a plain string, not a TskError. */
  installUpdate: () => invoke<void>("install_update"),
};

export type Api = typeof api;

/** Calls `cb` on every board change; resolves to the function that stops listening. */
export function onBoardChanged(cb: () => void): Promise<() => void> {
  return listen("board-changed", () => cb());
}

/** Calls `cb` with the settings each time any window saves them. */
export function onSettingsChanged(cb: (settings: Settings) => void): Promise<() => void> {
  return listen<Settings>("settings-changed", (e) => cb(e.payload));
}

/** Calls `cb` after each successful check for updates, with the release found or null. */
export function onUpdateAvailable(cb: (update: UpdateInfo | null) => void): Promise<() => void> {
  return listen<UpdateInfo | null>("update-available", (e) => cb(e.payload));
}

/** Calls `cb` with the result of a check started from the app menu. */
export function onUpdateCheckResult(cb: (result: UpdateCheckResult) => void): Promise<() => void> {
  return listen<UpdateCheckResult>("update-check-result", (e) => cb(e.payload));
}

/** Calls `cb` with the download progress while an update downloads. */
export function onUpdateProgress(cb: (progress: UpdateProgress) => void): Promise<() => void> {
  return listen<UpdateProgress>("update-progress", (e) => cb(e.payload));
}

/** Asks the main window to look for tsk again. */
export function requestTskCheck(): Promise<void> {
  return emitTo("main", "tsk-check");
}

/** Calls `cb` when another window asks this one to look for tsk again. */
export function onTskCheckRequested(cb: () => void): Promise<() => void> {
  return getCurrentWebviewWindow().listen("tsk-check", () => cb());
}

/** Calls `cb` with the id of each menu bar item chosen while this window has focus. */
export function onMenu(cb: (id: string) => void): Promise<() => void> {
  return getCurrentWebviewWindow().listen<string>("menu", (e) => cb(e.payload));
}

/** The main window's state that the menu bar's titles, check marks, key equivalents and enabled items follow. */
export interface MenuState {
  sidebarVisible: boolean;
  drawerOpen: boolean;
  /** Whether the Task menu has a task to act on. */
  taskSelected: boolean;
  group: Group;
  sort: Sort;
  /** The Group By choices on offer; empty while the board takes no menu commands. */
  groups: Group[];
  /** The Sort By choices on offer; empty while the board takes no menu commands. */
  sorts: Sort[];
  /** The name of the board change Undo reverses, such as "Archive". */
  undo: string | null;
  /** Whether Undo has a board change to act on, named or not. */
  canUndo: boolean;
  /** Whether a text field in the main window has focus. */
  textField: boolean;
  /** Key equivalents by menu item id, such as `Shift+Cmd+D`; null clears one. */
  accelerators: Record<string, string | null>;
}

/** Hands the main window's state to the menu bar. Rejects outside a Tauri window. */
export function reportMenuState(state: MenuState): Promise<void> {
  return invoke<void>("menu_state", { state });
}

/** Shows the task context menu at the pointer; a chosen item arrives as a `menu` event. Rejects outside a Tauri window. */
export function showTaskMenu(): Promise<void> {
  return invoke<void>("show_task_menu");
}

/** One item of a pull-down menu; its id starts with `pane-`. */
export interface PullDownItem {
  id: string;
  title: string;
}

/**
 * Shows a native pull-down menu with its top-left corner at `x`, `y` in the window; a chosen item
 * arrives as a `menu` event. Rejects outside a Tauri window.
 */
export function showPullDown(items: PullDownItem[], x: number, y: number): Promise<void> {
  return invoke<void>("show_pull_down", { items, x, y });
}

/** Sets the window's title, which the Window menu and screen readers use. Rejects outside a Tauri window. */
export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}

/**
 * Sets the window's inner height, keeping its width and its top edge in place. Rejects outside a
 * Tauri window.
 */
export async function setWindowHeight(height: number): Promise<void> {
  const win = getCurrentWindow();
  const [size, scale, top] = await Promise.all([win.innerSize(), win.scaleFactor(), win.outerPosition()]);
  await win.setSize(new LogicalSize(size.width / scale, height));
  await win.setPosition(top);
}

/**
 * Shows a native alert with an OK button, attached to this window as a sheet on macOS; resolves
 * when it is dismissed. Rejects outside a Tauri window.
 */
export async function showAlert(title: string, text: string): Promise<void> {
  await message(text, { title, kind: "info" });
}

/** Rejects outside a Tauri window. */
export async function isFullscreen(): Promise<boolean> {
  return getCurrentWindow().isFullscreen();
}

/** Calls `cb` with `true` when this window enters full screen and `false` when it leaves. */
export function onFullscreenChanged(cb: (fullscreen: boolean) => void): Promise<() => void> {
  return getCurrentWebviewWindow().listen<boolean>("fullscreen-changed", (e) => cb(e.payload));
}

/** Whether the system asks for opaque backgrounds in place of translucent ones. */
export function reduceTransparency(): Promise<boolean> {
  return invoke<boolean>("reduce_transparency");
}

/** Zooms the window's content in, out, or back to its actual size. Rejects outside a Tauri window. */
export function zoom(direction: "in" | "out" | "reset"): Promise<void> {
  return invoke<void>("zoom", { direction });
}

/** Opens tsk's documentation. Rejects outside a Tauri window. */
export function openDocs(): Promise<void> {
  return invoke<void>("open_docs");
}

export function errorMessage(e: TskError | string): string {
  if (typeof e === "string") {
    return e;
  }
  switch (e.kind) {
    case "notFound":
      return "tsk was not found";
    case "timeout":
      return `tsk didn't finish within ${e.seconds} seconds.`;
    default:
      return e.message;
  }
}
