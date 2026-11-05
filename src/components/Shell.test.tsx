import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  onBoardChanged,
  onMenu,
  onSettingsChanged,
  onTskCheckRequested,
  onUpdateAvailable,
  onUpdateCheckResult,
  onUpdateProgress,
  openDocs,
  reportMenuState,
  setWindowTitle,
  showAlert,
  showPullDown,
  showTaskMenu,
  zoom,
} from "../api/client";
import type { TaskRow } from "../api/types";
import { useDeck } from "../state/store";
import { useUpdates } from "../state/updates";
import { blockOn, detail, row } from "../test/fixtures";
import { Shell } from "./Shell";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      tskInfo: vi.fn(),
      listScope: vi.fn(),
      getTask: vi.fn(),
      capture: vi.fn(),
      setStatus: vi.fn(),
      editTask: vi.fn(),
      step: vi.fn(),
      reply: vi.fn(),
      setArchived: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      relocateTsk: vi.fn(),
      openSettings: vi.fn(),
      checkForUpdates: vi.fn(),
      pendingUpdate: vi.fn(),
      installUpdate: vi.fn(),
    },
    zoom: vi.fn(),
    openDocs: vi.fn(),
    onBoardChanged: vi.fn(),
    onSettingsChanged: vi.fn(),
    onTskCheckRequested: vi.fn(),
    onUpdateAvailable: vi.fn(),
    onUpdateCheckResult: vi.fn(),
    onUpdateProgress: vi.fn(),
    onMenu: vi.fn(),
    setWindowTitle: vi.fn(),
    reportMenuState: vi.fn(),
    showTaskMenu: vi.fn(),
    showPullDown: vi.fn(),
    showAlert: vi.fn(),
  };
});

/** The callback Shell registered with a mocked subscription. */
/** Delivers an event to every listener subscribed so far, as the event system does. */
function subscriber<T extends (...args: never[]) => void>(subscribe: (cb: T) => Promise<() => void>): T {
  const calls = vi.mocked(subscribe).mock.calls;
  return ((...args: Parameters<T>) => {
    for (const [cb] of calls) cb(...args);
  }) as T;
}

async function mountWith(rows: TaskRow[]) {
  vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
  vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true });
  vi.mocked(api.listScope).mockResolvedValue(rows);
  vi.mocked(api.setStatus).mockResolvedValue();
  vi.mocked(api.setArchived).mockResolvedValue();
  vi.mocked(api.getTask).mockResolvedValue(detail(rows[0]));
  vi.mocked(onBoardChanged).mockResolvedValue(() => {});
  render(<Shell />);
  await vi.waitFor(() => expect(within(screen.getByRole("listbox", { name: "Tasks" })).getAllByRole("option")).toHaveLength(rows.length));
  useDeck.setState({ cursor: rows[0].number });
}

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  vi.mocked(api.relocateTsk).mockResolvedValue();
  vi.mocked(api.openSettings).mockResolvedValue();
  vi.mocked(zoom).mockResolvedValue();
  vi.mocked(openDocs).mockResolvedValue();
  vi.mocked(reportMenuState).mockResolvedValue();
  vi.mocked(showTaskMenu).mockResolvedValue();
  vi.mocked(showPullDown).mockResolvedValue();
  vi.mocked(onSettingsChanged).mockResolvedValue(() => {});
  vi.mocked(onTskCheckRequested).mockResolvedValue(() => {});
  vi.mocked(onMenu).mockResolvedValue(() => {});
  vi.mocked(setWindowTitle).mockResolvedValue();
  vi.mocked(showAlert).mockResolvedValue();
  vi.mocked(api.pendingUpdate).mockResolvedValue(null);
  vi.mocked(onUpdateAvailable).mockResolvedValue(() => {});
  vi.mocked(onUpdateCheckResult).mockResolvedValue(() => {});
  vi.mocked(onUpdateProgress).mockResolvedValue(() => {});
  useUpdates.setState(useUpdates.getInitialState(), true);
  localStorage.clear();
});
afterEach(cleanup);

describe("board keys without marks", () => {
  it("marks the cursor task done on ctrl+d", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Control>}d{/Control}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
  });

  it("starts the cursor task with dispatch on ctrl+s", async () => {
    await mountWith([row({ number: 4, status: "ready" })]);
    await userEvent.keyboard("{Control>}s{/Control}");
    await vi.waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "start", dispatch: true, again: false, force: false }),
    );
  });

  it("archives the cursor task on ctrl+f", async () => {
    await mountWith([row({ number: 5, status: "ready" })]);
    await userEvent.keyboard("{Control>}f{/Control}");
    await vi.waitFor(() => expect(api.setArchived).toHaveBeenCalledWith(5, true));
  });

  it("opens the cursor task with the block card on ctrl+b", async () => {
    await mountWith([row({ number: 6, status: "started" })]);
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(await screen.findByRole("form", { name: "Block" })).toBeInTheDocument();
    expect(useDeck.getState().openTask).toBe(6);
  });
});

describe("palette and settings keys", () => {
  it("opens the palette on : and runs an action without firing board keys meanwhile", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard(":");
    await userEvent.type(screen.getByRole("combobox", { name: "Search actions" }), "mark done{Enter}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
    expect(screen.queryByRole("combobox", { name: "Search actions" })).not.toBeInTheDocument();
  });

  it("does not run board keys while the palette is open", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard(":");
    await userEvent.keyboard("{Control>}d{/Control}");
    expect(api.setStatus).not.toHaveBeenCalled();
  });

  it("opens the settings window on mod+,", async () => {
    await mountWith([row({ number: 3 })]);
    await userEvent.keyboard("{Control>},{/Control}");
    expect(api.openSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });
});

describe("loading", () => {
  it("shows a spinner on the board until the first listing arrives", async () => {
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true });
    vi.mocked(api.listScope).mockReturnValue(new Promise(() => {}));
    vi.mocked(onBoardChanged).mockResolvedValue(() => {});
    render(<Shell />);
    const list = await screen.findByRole("listbox", { name: "Tasks" });
    const note = within(list.parentElement as HTMLElement).getByRole("status");
    expect(note).toHaveTextContent("Loading…");
    expect(note.querySelector(".spinner")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("done drawer and task pane", () => {
  it("closes the open task when the drawer opens and gives the keyboard to the board", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    useDeck.setState({ focus: "board" });
    await userEvent.keyboard("d");
    expect(await screen.findByRole("complementary", { name: "Done tasks" })).toBeInTheDocument();
    expect(useDeck.getState().openTask).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Task" })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole("listbox", { name: "Tasks" })).toHaveFocus());
  });

  it("closes the drawer when a task opens", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("d");
    await screen.findByRole("complementary", { name: "Done tasks" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    expect(screen.queryByRole("complementary", { name: "Done tasks" })).not.toBeInTheDocument();
  });
});

describe("dialogs and errors", () => {
  it("shows an error raised while a dialog is open inside that dialog", async () => {
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.capture).mockRejectedValue({ kind: "refused", code: "x", message: "capture refused" });
    await userEvent.keyboard("+");
    const dialog = screen.getByRole("dialog", { name: "New Task" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "New{Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("capture refused");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a failure outside any dialog as an alert that states the situation", async () => {
    await mountWith([row({ number: 5, status: "ready" })]);
    vi.mocked(api.setArchived).mockRejectedValue({ kind: "refused", code: "x", message: "archive refused" });
    await userEvent.keyboard("{Control>}f{/Control}");
    await vi.waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith("Archive couldn't be completed for every task", "T5: archive refused"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(useDeck.getState().error).toBeNull());
  });

  it("shows a failed change to the open task in its pane, not in an alert", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    const pane = await screen.findByRole("complementary", { name: "Task" });
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "x", message: "done refused" });
    await userEvent.keyboard("{Control>}d{/Control}");
    expect(await within(pane).findByRole("alert")).toHaveTextContent("done refused");
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("drops an open dialog when tsk goes missing, so keys and dialogs work afterwards", async () => {
    await mountWith([row({ number: 3 })]);
    await userEvent.keyboard("+");
    expect(screen.getByRole("dialog", { name: "New Task" })).toBeInTheDocument();
    vi.mocked(api.tskInfo).mockRejectedValue({ kind: "notFound" });
    subscriber(onTskCheckRequested)();
    await screen.findByText("tsk Not Found");
    expect(useDeck.getState().modalOpen).toBe(false);
    await userEvent.keyboard("{Control>},{/Control}");
    expect(api.openSettings).toHaveBeenCalledTimes(1);
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    await userEvent.click(screen.getByRole("button", { name: "Check Again" }));
    await screen.findByRole("listbox", { name: "Tasks" });
    expect(screen.queryByRole("dialog", { name: "New Task" })).not.toBeInTheDocument();
  });
});

describe("menu bar", () => {
  it("opens capture from New Task", async () => {
    await mountWith([row({ number: 3 })]);
    subscriber(onMenu)("new-task");
    expect(await screen.findByRole("dialog", { name: "New Task" })).toBeInTheDocument();
  });

  it("runs board items on the open task", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    subscriber(onMenu)("done-drawer");
    expect(await screen.findByRole("complementary", { name: "Done tasks" })).toBeInTheDocument();
  });
});

describe("settings saved in the settings window", () => {
  it("applies the keymap, open mode and sidebar choice", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    subscriber(onSettingsChanged)({ openMode: "overlay", keymap: { "status.done": ["x"] }, tskPath: null, sidebarHidden: true, projectNames: {}, checkForUpdates: true });
    await vi.waitFor(() => expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument());
    expect(useDeck.getState().settings.openMode).toBe("overlay");
    await userEvent.keyboard("x");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
    expect(api.relocateTsk).not.toHaveBeenCalled();
  });

  it("looks for tsk again when the tsk path changed", async () => {
    await mountWith([row({ number: 3 })]);
    subscriber(onSettingsChanged)({ openMode: "beside", keymap: {}, tskPath: "/opt/test/tsk", sidebarHidden: false, projectNames: {}, checkForUpdates: true });
    await vi.waitFor(() => expect(api.relocateTsk).toHaveBeenCalledTimes(1));
  });

  it("looks for tsk again when the settings window asks", async () => {
    await mountWith([row({ number: 3 })]);
    subscriber(onTskCheckRequested)();
    await vi.waitFor(() => expect(api.relocateTsk).toHaveBeenCalledTimes(1));
  });
});

describe("tsk missing screen", () => {
  async function mountMissing() {
    vi.mocked(api.tskInfo).mockRejectedValue({ kind: "notFound" });
    vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true });
    vi.mocked(onBoardChanged).mockResolvedValue(() => {});
    render(<Shell />);
    await screen.findByText("tsk Not Found");
  }

  it("keeps the keyboard free after the palette key", async () => {
    await mountMissing();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("{Control>},{/Control}");
    expect(api.openSettings).toHaveBeenCalledTimes(1);
  });

  it("opens settings with mod+, after keys that need the board", async () => {
    await mountMissing();
    await userEvent.keyboard("+d/");
    await userEvent.keyboard("{Control>},{/Control}");
    expect(api.openSettings).toHaveBeenCalledTimes(1);
  });

  it("opens the settings window from the choose path button", async () => {
    await mountMissing();
    await userEvent.click(screen.getByRole("button", { name: "Choose tsk Path…" }));
    expect(api.openSettings).toHaveBeenCalledTimes(1);
  });

  it("looks for tsk again from the check again button", async () => {
    await mountMissing();
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 3, status: "ready" })]);
    await userEvent.click(screen.getByRole("button", { name: "Check Again" }));
    expect(await screen.findByRole("listbox", { name: "Tasks" })).toBeInTheDocument();
  });
});

describe("keyboard on the open task", () => {
  function blocked(number: number) {
    return row({ number, status: "blocked", block: { ...blockOn("you"), options: ["Alpha", "Beta"] } });
  }

  async function openWithEnter() {
    await userEvent.keyboard("{Enter}");
    const pane = await screen.findByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(pane).toContainElement(document.activeElement as HTMLElement));
    return pane;
  }

  it("opens a task with Enter, then edits and saves the title with keys", async () => {
    await mountWith([row({ number: 3, status: "started", title: "Old title" })]);
    vi.mocked(api.editTask).mockResolvedValue();
    await openWithEnter();
    expect(useDeck.getState().focus).toBe("task");
    await userEvent.keyboard("{Control>}e{/Control}");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.keyboard(" now{Enter}");
    expect(api.editTask).toHaveBeenCalledWith(3, { title: "Old title now" });
  });

  it("gives the keyboard back to the open task when the palette closes", async () => {
    await mountWith([row({ number: 3, status: "started", title: "Old title" })]);
    await openWithEnter();
    await userEvent.keyboard(":");
    expect(screen.getByRole("combobox", { name: "Search actions" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(useDeck.getState().focus).toBe("task");
    await userEvent.keyboard("{Control>}e{/Control}");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("runs a palette action opened from the task on the open task", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    await openWithEnter();
    await userEvent.keyboard(":");
    await userEvent.type(screen.getByRole("combobox", { name: "Search actions" }), "mark done{Enter}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
  });

  it("keeps the keyboard on the open task after a palette action that does nothing", async () => {
    await mountWith([row({ number: 3, status: "started", title: "Old title" })]);
    await openWithEnter();
    await userEvent.keyboard(":");
    await userEvent.type(screen.getByRole("combobox", { name: "Search actions" }), "show last project{Enter}");
    expect(screen.queryByRole("combobox", { name: "Search actions" })).not.toBeInTheDocument();
    expect(useDeck.getState().focus).toBe("task");
    await userEvent.keyboard("{Control>}e{/Control}");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("hands the keyboard to a task opened by click", async () => {
    await mountWith([row({ number: 3, status: "started", title: "Clicked task" })]);
    await userEvent.click(screen.getByText("Clicked task"));
    const pane = await screen.findByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(pane).toContainElement(document.activeElement as HTMLElement));
    await userEvent.keyboard("{Control>}e{/Control}");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("leaves a task opened by click unchanged when typing letters", async () => {
    await mountWith([row({ number: 3, status: "open", title: "Clicked task" })]);
    await userEvent.click(screen.getByText("Clicked task"));
    const pane = await screen.findByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(pane).toContainElement(document.activeElement as HTMLElement));
    await userEvent.keyboard("{Shift>}A{/Shift}dd a flag");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.setStatus).not.toHaveBeenCalled();
  });

  it("opens the reply box on a blocked task with r", async () => {
    await mountWith([blocked(4)]);
    await openWithEnter();
    await userEvent.keyboard("r");
    await vi.waitFor(() => expect(screen.getByRole("textbox", { name: "Reply" })).toHaveFocus());
  });

  it("prefills option 1 on a blocked task with 1", async () => {
    await mountWith([blocked(4)]);
    await openWithEnter();
    await userEvent.keyboard("1");
    expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("Alpha");
    expect(useDeck.getState().openTask).toBe(4);
  });

  it("lets Enter activate a focused button", async () => {
    await mountWith([row({ number: 5, status: "started" })]);
    await openWithEnter();
    screen.getByRole("button", { name: "Archive" }).focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(api.setArchived).toHaveBeenCalledWith(5, true));
    expect(useDeck.getState().marks).toEqual([]);
  });

  it("lets Space activate a focused button without marking", async () => {
    await mountWith([row({ number: 5, status: "started" })]);
    await openWithEnter();
    screen.getByRole("button", { name: "Archive" }).focus();
    await userEvent.keyboard(" ");
    await vi.waitFor(() => expect(api.setArchived).toHaveBeenCalledWith(5, true));
    expect(useDeck.getState().marks).toEqual([]);
  });

  it("lets Tab move DOM focus from a button", async () => {
    await mountWith([blocked(6)]);
    await openWithEnter();
    screen.getByRole("button", { name: "Mark Done" }).focus();
    await userEvent.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Archive" })).toHaveFocus();
    expect(useDeck.getState().focus).toBe("task");
  });
});

describe("window chrome", () => {
  it("names the toolbar selects in title case", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    expect(screen.getByRole("combobox", { name: "Group By" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort By" })).toBeInTheDocument();
  });

  it("labels the group and sort options for people and keeps tsk's values", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    const group = screen.getByRole("combobox", { name: "Group By" });
    const sort = screen.getByRole("combobox", { name: "Sort By" });
    expect(within(group).getByRole("option", { name: "No Grouping" })).toHaveValue("none");
    expect(within(sort).getByRole("option", { name: "Sort by Most Recent" })).toHaveValue("recent");
    expect(within(sort).getByRole("option", { name: "Sort by Title" })).toHaveValue("title");
  });

  it("titles the board sections in title case", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    expect(screen.getByRole("group", { name: "In Motion" })).toBeInTheDocument();
  });

  it("drags the window from the toolbar, which sits above the board and holds the sidebar toggle", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    const toolbar = screen.getByRole("banner");
    expect(toolbar).toHaveAttribute("data-tauri-drag-region", "deep");
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "Hide Sidebar" }));
    expect(screen.getByRole("navigation", { name: "Views" })).not.toContainElement(toolbar);
  });

  it("titles the toolbar and the window with the scope", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    expect(within(screen.getByRole("banner")).getByRole("heading", { name: "Desk" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute("placeholder", "Search Desk");
    await vi.waitFor(() => expect(setWindowTitle).toHaveBeenCalledWith("Desk"));
  });

  it("focuses the search field with /, and Escape clears it and leaves the field", async () => {
    const rows = [row({ number: 3, status: "started", title: "Alpha" }), row({ number: 4, status: "started", title: "Beta" })];
    await mountWith(rows);
    vi.mocked(api.getTask).mockImplementation(async (n) => detail(rows.find((r) => r.number === n) ?? rows[0]));
    await userEvent.keyboard("/");
    const field = screen.getByRole("searchbox", { name: "Search" });
    expect(field).toHaveFocus();
    await userEvent.keyboard("beta");
    await vi.waitFor(() => expect(within(screen.getByRole("listbox", { name: "Tasks" })).getAllByRole("option")).toHaveLength(1));
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(field).not.toHaveFocus();
  });

  it("opens capture from the New Task button", async () => {
    await mountWith([row({ number: 3 })]);
    await userEvent.click(screen.getByRole("button", { name: "New Task" }));
    expect(await screen.findByRole("dialog", { name: "New Task" })).toBeInTheDocument();
  });

  it("hides the sidebar from the toolbar button", async () => {
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.saveSettings).mockResolvedValue();
    await userEvent.click(screen.getByRole("button", { name: "Hide Sidebar" }));
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sidebarHidden: true, projectNames: {}, checkForUpdates: true })));
  });
});

describe("board accessibility", () => {
  it("points the focused task list at the cursor row", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    const list = screen.getByRole("listbox", { name: "Tasks" });
    expect(list).toHaveAttribute("tabindex", "0");
    await vi.waitFor(() => expect(list).toHaveFocus());
    await vi.waitFor(() => expect(list).toHaveAttribute("aria-activedescendant", "task-3"));
    await userEvent.keyboard("j");
    const second = within(list).getAllByRole("option")[1];
    expect(second).toHaveAttribute("id", "task-4");
    expect(list).toHaveAttribute("aria-activedescendant", "task-4");
  });

  it("puts every row in exactly one labelled group, with sub-groups labelled by their section", async () => {
    await mountWith([
      row({ number: 3, status: "started", group: "alpha" }),
      row({ number: 4, status: "started", group: "beta" }),
      row({ number: 5, status: "open" }),
      row({ number: 6, status: "ready" }),
    ]);
    const list = screen.getByRole("listbox", { name: "Tasks" });
    for (const option of within(list).getAllByRole("option")) {
      const group = option.closest('[role="group"]') as HTMLElement;
      expect(group).not.toBeNull();
      expect(list).toContainElement(group);
      expect(group.parentElement?.closest('[role="group"]')).toBeNull();
    }
    expect(within(list).getByRole("group", { name: "In Motion — alpha" })).toContainElement(document.getElementById("task-3"));
    expect(within(list).getByRole("group", { name: "In Motion — beta" })).toContainElement(document.getElementById("task-4"));
    expect(within(list).getByRole("group", { name: "On Deck" })).toContainElement(document.getElementById("task-6"));
    expect(within(list).getByRole("group", { name: "On Deck — Inbox" })).toContainElement(document.getElementById("task-5"));
  });

  it("groups rows under labelled sections with no heading directly in the list", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 5, status: "open" })]);
    const list = screen.getByRole("listbox", { name: "Tasks" });
    const motion = within(list).getByRole("group", { name: /In Motion/ });
    expect(within(motion).getAllByRole("option")).toHaveLength(1);
    expect(within(list).getByRole("group", { name: /Inbox/ })).toBeInTheDocument();
    for (const child of Array.from(list.children)) {
      expect(child.getAttribute("role")).toMatch(/^(group|option|presentation)$/);
    }
  });

  it("names each status mark", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 5, status: "open" })]);
    expect(screen.getByRole("img", { name: "Started" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Open" })).toBeInTheDocument();
  });
});

describe("sidebar", () => {
  function setWidth(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    window.dispatchEvent(new Event("resize"));
  }

  afterEach(() => setWidth(1024));

  it("hides and shows the sidebar on its key and saves the choice", async () => {
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.saveSettings).mockResolvedValue();
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
    await userEvent.keyboard("{Control>}{Alt>}s{/Alt}{/Control}");
    await vi.waitFor(() => expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument());
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ sidebarHidden: true, projectNames: {}, checkForUpdates: true }));
    await userEvent.keyboard("{Control>}{Alt>}s{/Alt}{/Control}");
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ sidebarHidden: false, projectNames: {}, checkForUpdates: true }));
  });

  it("starts hidden when the saved settings say so", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: true, projectNames: {}, checkForUpdates: true });
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 3 })]);
    vi.mocked(onBoardChanged).mockResolvedValue(() => {});
    render(<Shell />);
    await screen.findByRole("listbox", { name: "Tasks" });
    await vi.waitFor(() => expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument());
  });

  it("collapses the sidebar in a narrow window while a task is open, without saving", async () => {
    setWidth(900);
    await mountWith([row({ number: 3, status: "started" })]);
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument();
    setWidth(1200);
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    setWidth(900);
    await vi.waitFor(() => expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("shows a collapsed sidebar on request until the task closes, without saving", async () => {
    setWidth(900);
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument();
    subscriber(onMenu)("sidebar");
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    expect(reportMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ sidebarVisible: true }));
    subscriber(onMenu)("sidebar");
    await vi.waitFor(() => expect(screen.queryByRole("navigation", { name: "Views" })).not.toBeInTheDocument());
    subscriber(onMenu)("sidebar");
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    useDeck.getState().close();
    setWidth(900);
    await vi.waitFor(() => expect(screen.queryByRole("complementary", { name: "Task" })).not.toBeInTheDocument());
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("shows a sidebar hidden by the saved choice over the narrow-window collapse", async () => {
    setWidth(900);
    await mountWith([row({ number: 3, status: "started" })]);
    vi.mocked(api.saveSettings).mockResolvedValue();
    await useDeck.getState().saveSettings({ ...useDeck.getState().settings, sidebarHidden: true, projectNames: {}, checkForUpdates: true });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    subscriber(onMenu)("sidebar");
    await vi.waitFor(() => expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument());
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ sidebarHidden: false, projectNames: {}, checkForUpdates: true }));
  });
});

describe("resizable panes", () => {
  it("resizes the sidebar from its divider with the arrow keys, Home and End, and keeps the width", async () => {
    await mountWith([row({ number: 3 })]);
    const divider = screen.getByRole("separator", { name: "Resize Sidebar" });
    expect(divider).toHaveAttribute("aria-valuenow", "220");
    expect(divider).toHaveAttribute("aria-valuemin", "180");
    expect(divider).toHaveAttribute("aria-valuemax", "320");
    divider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(divider).toHaveAttribute("aria-valuenow", "240");
    await userEvent.keyboard("{End}");
    expect(divider).toHaveAttribute("aria-valuenow", "320");
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(divider).toHaveAttribute("aria-valuenow", "180");
    expect(localStorage.getItem("tskdeck.sidebarWidth")).toBe("180");
    cleanup();
    await mountWith([row({ number: 3 })]);
    expect(screen.getByRole("separator", { name: "Resize Sidebar" })).toHaveAttribute("aria-valuenow", "180");
  });

  it("resizes the task pane from its leading divider", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    const divider = screen.getByRole("separator", { name: "Resize Pane" });
    expect(divider).toHaveAttribute("aria-valuenow", "420");
    await vi.waitFor(() => expect(screen.getByRole("complementary", { name: "Task" })).toHaveFocus());
    await userEvent.click(divider);
    expect(divider).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(divider).toHaveAttribute("aria-valuenow", "430");
    await userEvent.keyboard("{End}");
    expect(divider).toHaveAttribute("aria-valuenow", "600");
    expect(localStorage.getItem("tskdeck.paneWidth")).toBe("600");
    expect(screen.getByRole("complementary", { name: "Task" })).toBeInTheDocument();
  });

  it("resizes the sidebar by dragging its divider", async () => {
    await mountWith([row({ number: 3 })]);
    const divider = screen.getByRole("separator", { name: "Resize Sidebar" });
    fireEvent.pointerDown(divider, { button: 0, clientX: 220, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 270, pointerId: 1 });
    fireEvent.pointerUp(divider, { clientX: 270, pointerId: 1 });
    expect(divider).toHaveAttribute("aria-valuenow", "270");
    fireEvent.pointerMove(divider, { clientX: 300, pointerId: 1 });
    expect(divider).toHaveAttribute("aria-valuenow", "270");
  });
});

describe("tasks over the board", () => {
  async function mountOverlay() {
    await mountWith([row({ number: 3, status: "started" })]);
    useDeck.setState({ settings: { ...useDeck.getState().settings, openMode: "overlay" } });
    await userEvent.keyboard("{Enter}");
    return screen.findByRole("dialog", { name: "Task" });
  }

  it("opens the task in a modal sheet that a click outside leaves open", async () => {
    const sheet = await mountOverlay();
    expect(sheet.tagName).toBe("DIALOG");
    expect(sheet).toHaveAttribute("open");
    fireEvent.mouseDown(sheet);
    fireEvent.click(sheet);
    expect(screen.getByRole("dialog", { name: "Task" })).toBeInTheDocument();
  });

  it("closes on Escape and on Command-Period", async () => {
    await mountOverlay();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Task" })).not.toBeInTheDocument());
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "Task" });
    await userEvent.keyboard("{Meta>}.{/Meta}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Task" })).not.toBeInTheDocument());
  });
});

describe("board empty state", () => {
  it("offers New Task when the board has no tasks", async () => {
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true });
    vi.mocked(api.listScope).mockResolvedValue([]);
    vi.mocked(onBoardChanged).mockResolvedValue(() => {});
    render(<Shell />);
    expect(await screen.findByRole("heading", { name: "No Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Tasks you capture show up here.")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "New Task" }));
    expect(await screen.findByRole("dialog", { name: "New Task" })).toBeInTheDocument();
  });

  it("names the query and clears it when nothing matches", async () => {
    await mountWith([row({ number: 3, title: "Alpha" })]);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "zzz");
    expect(await screen.findByRole("heading", { name: "No Results" })).toBeInTheDocument();
    expect(screen.getByText("No tasks match “zzz”.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear Search" }));
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "No Results" })).not.toBeInTheDocument();
  });
});

describe("done drawer", () => {
  it("heads the drawer once and says what shows up when it is empty", async () => {
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.listScope).mockResolvedValue([]);
    subscriber(onMenu)("done-drawer");
    const drawer = await screen.findByRole("complementary", { name: "Done tasks" });
    expect(within(drawer).getAllByRole("heading", { name: /^Done/ })).toHaveLength(1);
    await vi.waitFor(() => expect(within(drawer).getByText("Tasks you mark done show up here.")).toBeInTheDocument());
    expect(within(drawer).getByText("Tasks you archive show up here.")).toBeInTheDocument();
  });

  it("moves between done tasks with the arrow keys", async () => {
    const user = userEvent.setup();
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 5, title: "Five" }), row({ number: 6, title: "Six" })]);
    subscriber(onMenu)("done-drawer");
    const drawer = await screen.findByRole("complementary", { name: "Done tasks" });
    const lists = await within(drawer).findAllByRole("list", { name: "Done tasks" });
    const options = within(lists[0]).getAllByRole("listitem");
    expect(options[0]).toHaveAttribute("tabindex", "0");
    options[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("tabindex", "0");
    expect(options[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveFocus();
  });

  it("shows a failed load in the drawer", async () => {
    await mountWith([row({ number: 3 })]);
    vi.mocked(api.listScope).mockRejectedValue({ kind: "usage", message: "bad shelf" });
    subscriber(onMenu)("done-drawer");
    const drawer = await screen.findByRole("complementary", { name: "Done tasks" });
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("bad shelf");
  });
});

describe("menu bar state", () => {
  it("reports the sidebar, the done drawer and whether a task is selected", async () => {
    await mountWith([row({ number: 3 })]);
    await vi.waitFor(() =>
      expect(reportMenuState).toHaveBeenLastCalledWith(
        expect.objectContaining({ sidebarVisible: true, drawerOpen: false, taskSelected: true }),
      ),
    );
    await userEvent.keyboard("d");
    await vi.waitFor(() => expect(reportMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ drawerOpen: true })));
    useDeck.setState({ cursor: null });
    await vi.waitFor(() => expect(reportMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ taskSelected: false })));
  });

  it("reports the grouping, the sorting and the choices the scope offers", async () => {
    await mountWith([row({ number: 3 })]);
    await vi.waitFor(() =>
      expect(reportMenuState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          group: "none",
          sort: "recent",
          groups: ["none", "thread", "assignee"],
          sorts: ["recent", "thread", "title", "assignee"],
        }),
      ),
    );
  });

  it("reports the board change Undo reverses", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await vi.waitFor(() => expect(reportMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ undo: null, canUndo: false })));
    subscriber(onMenu)("task-done");
    await vi.waitFor(() =>
      expect(reportMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ undo: "Mark Done", canUndo: true })),
    );
  });

  it("reports the keymap's key equivalents for the menu bar", async () => {
    await mountWith([row({ number: 3 })]);
    await vi.waitFor(() =>
      expect(reportMenuState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          accelerators: expect.objectContaining({ "task-start": "Cmd+L", "done-drawer": "Shift+Cmd+D", palette: "Cmd+K" }),
        }),
      ),
    );
  });

  it("sets the grouping chosen in the View menu", async () => {
    await mountWith([row({ number: 3 })]);
    subscriber(onMenu)("group-thread");
    await vi.waitFor(() => expect(useDeck.getState().options.group).toBe("thread"));
  });

  it("runs Task menu items on the selected task", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    subscriber(onMenu)("task-done");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
  });
});

describe("row context menu", () => {
  it("selects the row, then shows the task menu, whose items act on that row", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    fireEvent.contextMenu(screen.getByText("T4"));
    expect(useDeck.getState().cursor).toBe(4);
    expect(showTaskMenu).toHaveBeenCalledTimes(1);
    subscriber(onMenu)("task-done");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "done", clean: false }));
  });

  it("keeps the marks when the row is marked", async () => {
    await mountWith([row({ number: 3 }), row({ number: 4 })]);
    useDeck.setState({ marks: [3, 4], markMode: true });
    fireEvent.contextMenu(screen.getByText("T4"));
    expect(useDeck.getState().marks).toEqual([3, 4]);
  });
});

describe("keys under a modal", () => {
  it("keeps the sidebar keys off while the palette is open", async () => {
    await mountWith([row({ number: 3 })]);
    useDeck.setState({ focus: "sidebar" });
    await userEvent.keyboard(":");
    expect(screen.getByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
    vi.mocked(api.listScope).mockClear();
    for (const key of ["p", "Enter"]) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    expect(screen.queryByRole("textbox", { name: "Filter projects" })).not.toBeInTheDocument();
    expect(api.listScope).not.toHaveBeenCalled();
  });
});

describe("cursor across live changes", () => {
  it("keeps the cursor on the same task when a refresh reorders rows", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    useDeck.setState({ cursor: null });
    await userEvent.keyboard("j");
    vi.mocked(api.listScope).mockResolvedValue([
      row({ number: 4, status: "blocked", block: blockOn("you") }),
      row({ number: 3, status: "started" }),
    ]);
    await useDeck.getState().refresh();
    await userEvent.keyboard("{Control>}d{/Control}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(3, { kind: "done", clean: false }));
    expect(api.setStatus).not.toHaveBeenCalledWith(4, expect.anything());
  });

  it("aims single-task keys at the cursor task when the open task is not on the board", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 7, status: "started" })]);
    await useDeck.getState().refresh();
    useDeck.setState({ cursor: 7, focus: "board" });
    expect(useDeck.getState().openTask).toBe(3);
    await userEvent.keyboard("{Control>}d{/Control}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(7, { kind: "done", clean: false }));
  });

  it("aims single-task keys at the open task", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    useDeck.setState({ openTask: 4, detail: detail(row({ number: 4, status: "started" })), cursor: 3, focus: "board" });
    await userEvent.keyboard("{Control>}d{/Control}");
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "done", clean: false }));
    expect(api.setStatus).not.toHaveBeenCalledWith(3, expect.anything());
  });
});

describe("Escape in the open task's text fields", () => {
  it("keeps the task and the reply draft", async () => {
    await mountWith([row({ number: 4, status: "blocked", block: { ...blockOn("you"), options: ["Alpha"] } })]);
    await userEvent.keyboard("{Enter}");
    const reply = await screen.findByRole("textbox", { name: "Reply" });
    await userEvent.type(reply, "half a thought{Escape}");
    expect(useDeck.getState().openTask).toBe(4);
    expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("half a thought");
  });

  it("closes the block card from one of its fields and keeps the task open", async () => {
    await mountWith([row({ number: 6, status: "started" })]);
    await userEvent.keyboard("{Control>}b{/Control}");
    const card = await screen.findByRole("form", { name: "Block" });
    await userEvent.type(within(card).getByRole("textbox", { name: "Why" }), "Need a key{Escape}");
    expect(screen.queryByRole("form", { name: "Block" })).not.toBeInTheDocument();
    expect(useDeck.getState().openTask).toBe(6);
  });
});

describe("moving to another task", () => {
  function blocked(number: number) {
    return row({ number, status: "blocked", block: blockOn("you") });
  }

  async function mountTwo() {
    const rows = [blocked(4), blocked(5)];
    await mountWith(rows);
    vi.mocked(api.getTask).mockImplementation(async (n) => detail(rows.find((r) => r.number === n) ?? rows[0]));
  }

  it("leaves a failed status change behind on the task it happened on", async () => {
    await mountTwo();
    vi.mocked(api.reply).mockResolvedValue();
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "x", message: "status refused" });
    await userEvent.keyboard("{Enter}");
    await userEvent.type(await screen.findByRole("textbox", { name: "Reply" }), "Go ahead");
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(await screen.findByRole("button", { name: "Retry Status Change" })).toBeInTheDocument();
    useDeck.setState({ focus: "board" });
    await userEvent.keyboard("j");
    const pane = screen.getByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(within(pane).getByText("T5")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retry Status Change" })).not.toBeInTheDocument();
  });

  it("does not carry a reply draft to the next task", async () => {
    await mountTwo();
    await userEvent.keyboard("{Enter}");
    await userEvent.type(await screen.findByRole("textbox", { name: "Reply" }), "Only for T4{Escape}");
    useDeck.setState({ focus: "board" });
    await userEvent.keyboard("j");
    const pane = screen.getByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(within(pane).getByText("T5")).toBeInTheDocument());
    expect(within(pane).getByRole("textbox", { name: "Reply" })).toHaveValue("");
  });
});

describe("zoom and help actions", () => {
  const cases: [string, "in" | "out" | "reset"][] = [
    ["zoom.in", "in"],
    ["zoom.out", "out"],
    ["zoom.reset", "reset"],
  ];

  it.each(cases)("%s zooms the window %s", async (id, direction) => {
    await mountWith([row({ number: 3, status: "started" })]);
    useDeck.setState({
      settings: { ...useDeck.getState().settings, keymap: { [id]: ["ctrl+alt+9"] } },
    });
    await userEvent.keyboard("{Control>}{Alt>}9{/Alt}{/Control}");
    await vi.waitFor(() => expect(zoom).toHaveBeenCalledWith(direction));
  });

  it("help.docs opens the documentation", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    useDeck.setState({
      settings: { ...useDeck.getState().settings, keymap: { "help.docs": ["ctrl+alt+9"] } },
    });
    await userEvent.keyboard("{Control>}{Alt>}9{/Alt}{/Control}");
    await vi.waitFor(() => expect(openDocs).toHaveBeenCalledTimes(1));
  });

  it("shows a failed zoom through the store's failure path", async () => {
    vi.mocked(zoom).mockRejectedValue("zoom is unavailable");
    await mountWith([row({ number: 3, status: "started" })]);
    useDeck.setState({
      settings: { ...useDeck.getState().settings, keymap: { "zoom.in": ["ctrl+alt+9"] } },
    });
    await userEvent.keyboard("{Control>}{Alt>}9{/Alt}{/Control}");
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith("Zoom couldn't be changed", "zoom is unavailable"));
  });

  it("shows a failed docs open through the store's failure path", async () => {
    vi.mocked(openDocs).mockRejectedValue("no browser");
    await mountWith([row({ number: 3, status: "started" })]);
    useDeck.setState({
      settings: { ...useDeck.getState().settings, keymap: { "help.docs": ["ctrl+alt+9"] } },
    });
    await userEvent.keyboard("{Control>}{Alt>}9{/Alt}{/Control}");
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith("Documentation couldn't be opened", "no browser"));
  });
});

describe("Escape order", () => {
  it("closes an open block card before the task", async () => {
    await mountWith([row({ number: 6, status: "started" })]);
    await userEvent.keyboard("{Control>}b{/Control}");
    await screen.findByRole("form", { name: "Block" });
    const pane = screen.getByRole("complementary", { name: "Task" });
    await vi.waitFor(() => expect(pane).toContainElement(document.activeElement as HTMLElement));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: "Block" })).not.toBeInTheDocument();
    expect(pane).toHaveFocus();
    expect(useDeck.getState().openTask).toBe(6);
    await userEvent.keyboard("{Escape}");
    expect(useDeck.getState().openTask).toBeNull();
  });

  it("closes the open task before clearing marks", async () => {
    await mountWith([row({ number: 3, status: "started" }), row({ number: 4, status: "started" })]);
    useDeck.setState({ marks: [4], markMode: true });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Task" });
    await userEvent.keyboard("{Escape}");
    expect(useDeck.getState().openTask).toBeNull();
    expect(useDeck.getState().marks).toEqual([4]);
    await userEvent.keyboard("{Escape}");
    expect(useDeck.getState().marks).toEqual([]);
  });
});

describe("project names", () => {
  const path = "/home/test/a/wordpress/wp-content";

  it("renames a project from its context menu in the sidebar", async () => {
    vi.mocked(api.saveSettings).mockResolvedValue();
    await mountWith([row({ number: 3, status: "started", project: path })]);
    const sidebar = screen.getByRole("navigation", { name: "Views" });
    fireEvent.contextMenu(within(sidebar).getByText("wp-content"));
    expect(showPullDown).toHaveBeenCalledWith(
      [{ id: "pane-rename-project", title: "Rename…" }],
      expect.any(Number),
      expect.any(Number),
    );
    subscriber(onMenu)("pane-rename-project");
    const dialog = await screen.findByRole("dialog", { name: "Rename Project" });
    const field = within(dialog).getByRole("textbox", { name: "Name" });
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "wp-content");
    expect(within(dialog).getByText(path)).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(`${path} Leave empty to use the folder name.`);
    await userEvent.type(field, "Alpha{Enter}");
    await vi.waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ projectNames: { [path]: "Alpha" } })),
    );
    expect(screen.queryByRole("dialog", { name: "Rename Project" })).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Alpha")).toBeInTheDocument();
  });

  it("closes the rename sheet when the board gives way to the tsk-missing screen", async () => {
    await mountWith([row({ number: 3, status: "started", project: path })]);
    const sidebar = screen.getByRole("navigation", { name: "Views" });
    fireEvent.contextMenu(within(sidebar).getByText("wp-content"));
    subscriber(onMenu)("pane-rename-project");
    await screen.findByRole("dialog", { name: "Rename Project" });
    act(() => useDeck.setState({ tskError: { kind: "notFound" } as never }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename Project" })).not.toBeInTheDocument());
    act(() => useDeck.setState({ tskError: null }));
    await screen.findByRole("navigation", { name: "Views" });
    expect(screen.queryByRole("dialog", { name: "Rename Project" })).not.toBeInTheDocument();
  });

  it("starts the field with the project's current name", async () => {
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.getSettings).mockResolvedValue({
      openMode: "beside",
      keymap: {},
      tskPath: null,
      sidebarHidden: false,
      projectNames: { [path]: "Alpha" },
      checkForUpdates: true,
    });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 3, status: "started", project: path })]);
    vi.mocked(onBoardChanged).mockResolvedValue(() => {});
    render(<Shell />);
    const sidebar = await screen.findByRole("navigation", { name: "Views" });
    fireEvent.contextMenu(await within(sidebar).findByText("Alpha"));
    subscriber(onMenu)("pane-rename-project");
    const dialog = await screen.findByRole("dialog", { name: "Rename Project" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Alpha");
  });

  it("titles the window with a project's name", async () => {
    await mountWith([row({ number: 3, status: "started", project: path })]);
    useDeck.setState({ settings: { ...useDeck.getState().settings, projectNames: { [path]: "Alpha" } } });
    await useDeck.getState().selectScope({ kind: "project", path });
    await vi.waitFor(() => expect(setWindowTitle).toHaveBeenCalledWith("Alpha"));
  });
});

describe("update card", () => {
  const release = { version: "9.9.9", notes: null };

  it("shows a release that a check found before the window loaded", async () => {
    vi.mocked(api.pendingUpdate).mockResolvedValue(release);
    await mountWith([row({ number: 3, status: "started" })]);
    expect(await screen.findByText("tskdeck 9.9.9 is available.")).toBeInTheDocument();
  });

  it("shows a release that a scheduled check finds later", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    expect(screen.queryByText("tskdeck 9.9.9 is available.")).not.toBeInTheDocument();
    act(() => subscriber(onUpdateAvailable)(release));
    expect(await screen.findByText("tskdeck 9.9.9 is available.")).toBeInTheDocument();
  });

  it("hides the card with Later and shows it again when a check from the menu finds the release", async () => {
    vi.mocked(api.pendingUpdate).mockResolvedValue(release);
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.click(await screen.findByRole("button", { name: "Later" }));
    expect(screen.queryByText("tskdeck 9.9.9 is available.")).not.toBeInTheDocument();
    act(() => subscriber(onUpdateCheckResult)({ update: release, error: null }));
    expect(await screen.findByText("tskdeck 9.9.9 is available.")).toBeInTheDocument();
  });

  it("installs the release and reports a failed install", async () => {
    vi.mocked(api.pendingUpdate).mockResolvedValue(release);
    vi.mocked(api.installUpdate).mockRejectedValue("signature mismatch");
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.click(await screen.findByRole("button", { name: "Install and Relaunch" }));
    expect(api.installUpdate).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith("The update couldn't be installed", "signature mismatch"));
    expect(screen.getByRole("button", { name: "Install and Relaunch" })).toBeEnabled();
  });

  it("says that tskdeck is up to date after a check from the menu finds nothing", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    act(() => subscriber(onUpdateCheckResult)({ update: null, error: null }));
    expect(showAlert).toHaveBeenCalledWith("tskdeck is up to date", "No newer version is available.");
  });

  it("reports a check from the menu that failed", async () => {
    await mountWith([row({ number: 3, status: "started" })]);
    act(() => subscriber(onUpdateCheckResult)({ update: null, error: "offline" }));
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith("Couldn't check for updates", "offline"));
  });

  it("checks for updates from the command palette", async () => {
    vi.mocked(api.checkForUpdates).mockResolvedValue(release);
    await mountWith([row({ number: 3, status: "started" })]);
    await userEvent.keyboard(":");
    await userEvent.type(screen.getByRole("combobox", { name: "Search actions" }), "check for updates{Enter}");
    expect(api.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("tskdeck 9.9.9 is available.")).toBeInTheDocument();
  });
});
