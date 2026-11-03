import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onMenu, showPullDown } from "../api/client";
import { useDeck } from "../state/store";
import { blockOn, detail, reviewOn, row } from "../test/fixtures";
import { BlockCard } from "./BlockCard";
import { ReviewCard } from "./ReviewCard";
import { TaskPane } from "./TaskPane";
import { ThreadView } from "./ThreadView";

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
    },
    onBoardChanged: vi.fn(),
    onMenu: vi.fn(),
    showPullDown: vi.fn(),
  };
});

/** Captures the menu listeners the pane registers, so a test can choose a pull-down item. */
function listenToMenus(): (id: string) => void {
  const listeners: ((id: string) => void)[] = [];
  vi.mocked(onMenu).mockImplementation((cb) => {
    listeners.push(cb);
    return Promise.resolve(() => {});
  });
  vi.mocked(showPullDown).mockResolvedValue();
  return (id) => {
    for (const cb of listeners) cb(id);
  };
}

function open(task: ReturnType<typeof detail>) {
  useDeck.setState({ openTask: task.number, detail: task, rows: [task], allRows: [task] });
  vi.mocked(api.getTask).mockResolvedValue(task);
  vi.mocked(api.listScope).mockResolvedValue([task]);
}

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
});
afterEach(cleanup);

describe("ThreadView", () => {
  it("sends with the send key and keeps Return for new lines", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const task = detail({ ...row({ number: 3, status: "blocked" }), block: blockOn("you") });
    render(<ThreadView task={task} draft="An answer" onDraft={() => {}} onSubmit={onSubmit} onEditWaits={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Reply" });
    await user.type(field, "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(field, "{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Answer" })).toHaveAttribute("title", "Answer (Ctrl+Enter)");
  });

  describe("waits-on editor", () => {
    const blocked = () => detail({ ...row({ number: 3, status: "blocked" }), block: blockOn("you") });
    const view = (props: Partial<React.ComponentProps<typeof ThreadView>> = {}) => (
      <ThreadView task={blocked()} draft="" onDraft={() => {}} onSubmit={() => {}} onEditWaits={() => {}} editingWaits {...props} />
    );

    it("cancels with the Cancel button and hands focus back to Change", async () => {
      const user = userEvent.setup();
      const onCancelWaits = vi.fn();
      render(view({ onCancelWaits, onSaveWaits: vi.fn() }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancelWaits).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Change" })).toHaveFocus();
    });

    it("cancels with Escape without letting the key reach the task view", async () => {
      const user = userEvent.setup();
      const onCancelWaits = vi.fn();
      const reached = vi.fn();
      render(
        <div onKeyDown={(e) => e.key === "Escape" && reached()}>{view({ onCancelWaits, onSaveWaits: vi.fn() })}</div>,
      );
      screen.getByRole("combobox", { name: "Waits on" }).focus();
      await user.keyboard("{Escape}");
      expect(onCancelWaits).toHaveBeenCalledTimes(1);
      expect(reached).not.toHaveBeenCalled();
    });

    it("starts from the saved value each time the editor opens", async () => {
      const user = userEvent.setup();
      const props = { onCancelWaits: vi.fn(), onSaveWaits: vi.fn() };
      const { rerender } = render(view(props));
      await user.selectOptions(screen.getByRole("combobox", { name: "Waits on" }), "other");
      await user.type(screen.getByRole("textbox", { name: "Who" }), "someone");
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      rerender(view({ ...props, editingWaits: false }));
      rerender(view(props));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("renders repeated options and check texts without key warnings", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const task = detail({ ...row({ number: 3, status: "blocked" }), block: { ...blockOn("you"), options: ["Same", "Same"] } });
      const review = { ...reviewOn("you"), checks: [{ text: "Twice", state: "open" as const }, { text: "Twice", state: "open" as const }] };
      render(
        <>
          {view({ task })}
          {view({ task: detail({ ...row({ number: 4, status: "review" }), review }), editingWaits: false })}
        </>,
      );
      expect(screen.getAllByText("Same")).toHaveLength(2);
      expect(screen.getAllByText("Twice")).toHaveLength(2);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  it("labels a check state tsk reported that tskdeck does not know", () => {
    const review = { ...reviewOn("you"), checks: [{ text: "Odd", state: "unknown" as const }] };
    render(<ThreadView task={detail({ ...row({ number: 3, status: "review" }), review })} draft="" onDraft={() => {}} onSubmit={() => {}} onEditWaits={() => {}} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows checks read-only", () => {
    const review = { ...reviewOn("you"), checks: [{ text: "Looks right", state: "passed" as const }] };
    const task = detail({ ...row({ number: 3, status: "review" }), review });
    render(<ThreadView task={task} draft="" onDraft={() => {}} onSubmit={() => {}} onEditWaits={() => {}} />);
    expect(screen.getByText("Looks right")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /looks right|passed/i })).toBeNull();
  });
});

describe("loading", () => {
  it("shows a spinner beside the text while the task loads", () => {
    useDeck.setState({ openTask: 2, detail: null });
    render(<TaskPane />);
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Loading…");
    expect(note.querySelector(".spinner")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("cards", () => {
  it("put Cancel before the primary button", () => {
    const task = detail(row({ number: 3, status: "started" }));
    render(
      <>
        <BlockCard task={task} onClose={() => {}} />
        <ReviewCard task={task} onClose={() => {}} />
      </>,
    );
    const names = (form: string) =>
      within(screen.getByRole("form", { name: form }))
        .getAllByRole("button")
        .map((b) => b.textContent);
    expect(names("Block")).toEqual(["Cancel", "Block"]);
    expect(names("Request Review")).toEqual(["Cancel", "Request Review"]);
  });
});

describe("card submission", () => {
  const blocked = (task: ReturnType<typeof detail>, onClose: () => void) => <BlockCard task={task} onClose={onClose} />;

  it("closes the block card once the change is written, sending trimmed values and each option once", async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockResolvedValue(true);
    useDeck.setState({ run });
    const onClose = vi.fn();
    render(blocked(detail(row({ number: 3, status: "started" })), onClose));
    await user.type(screen.getByRole("textbox", { name: "Why" }), "  Needs a decision  ");
    await user.type(screen.getByRole("textbox", { name: "Options, one per line" }), "Ship\n Hold \nShip\n\nHold");
    await user.click(screen.getByRole("button", { name: "Block" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      kind: "status",
      number: 3,
      change: { kind: "blocked", why: "Needs a decision", needs: null, options: ["Ship", "Hold"], on: null },
    });
  });

  it("keeps the block card open with its text when the change fails", async () => {
    const user = userEvent.setup();
    useDeck.setState({ run: vi.fn().mockResolvedValue(false) });
    const onClose = vi.fn();
    render(blocked(detail(row({ number: 3, status: "started" })), onClose));
    await user.type(screen.getByRole("textbox", { name: "Why" }), "Typed reason");
    await user.click(screen.getByRole("button", { name: "Block" }));
    await vi.waitFor(() => expect(useDeck.getState().run).toHaveBeenCalled());
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Why" })).toHaveValue("Typed reason");
  });

  it("closes the review card once the change is written and sends each check once", async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockResolvedValue(true);
    useDeck.setState({ run });
    const onClose = vi.fn();
    render(<ReviewCard task={detail(row({ number: 4, status: "started" }))} onClose={onClose} />);
    await user.type(screen.getByRole("textbox", { name: "Done" }), " All finished ");
    await user.type(screen.getByRole("textbox", { name: "Checks, one per line" }), "Looks right\nLooks right");
    await user.click(screen.getByRole("button", { name: "Request Review" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toMatchObject({
      change: { kind: "review", done: "All finished", checks: ["Looks right"], next: null },
    });
  });

  it("keeps the review card open with its text when the change fails", async () => {
    const user = userEvent.setup();
    useDeck.setState({ run: vi.fn().mockResolvedValue(false) });
    const onClose = vi.fn();
    render(<ReviewCard task={detail(row({ number: 4, status: "started" }))} onClose={onClose} />);
    await user.type(screen.getByRole("textbox", { name: "Done" }), "Typed summary");
    await user.click(screen.getByRole("button", { name: "Request Review" }));
    await vi.waitFor(() => expect(useDeck.getState().run).toHaveBeenCalled());
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Done" })).toHaveValue("Typed summary");
  });
});

describe("cards in the pane", () => {
  async function mount() {
    open(detail(row({ number: 3, status: "started" })));
    useDeck.setState({ focus: "task" });
    const choose = listenToMenus();
    render(<TaskPane />);
    await act(async () => {});
    return choose;
  }

  it.each([
    ["pane-block", "Block", "Why"],
    ["pane-review", "Request Review", "Done"],
  ])("focuses the first field of the %s card and hands focus to the pane on Cancel", async (menu, form, field) => {
    const user = userEvent.setup();
    const choose = await mount();
    act(() => choose(menu));
    const card = await screen.findByRole("form", { name: form });
    expect(within(card).getByRole("textbox", { name: field })).toHaveFocus();
    await user.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: form })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Task" })).toHaveFocus();
  });

  it("returns focus to the pane control that opened the card", async () => {
    const user = userEvent.setup();
    const choose = await mount();
    const opener = screen.getByRole("button", { name: "Archive" });
    opener.focus();
    act(() => choose("pane-block"));
    const card = await screen.findByRole("form", { name: "Block" });
    expect(within(card).getByRole("textbox", { name: "Why" })).toHaveFocus();
    await user.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
  });

  it("returns focus to the opener when Escape closes the card", async () => {
    const user = userEvent.setup();
    const choose = await mount();
    const opener = screen.getByRole("button", { name: "Mark Done" });
    opener.focus();
    act(() => choose("pane-review"));
    await screen.findByRole("form", { name: "Request Review" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: "Request Review" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes the card on one Escape from any control inside it without the key reaching the task view", async () => {
    const user = userEvent.setup();
    const choose = await mount();
    const reached = vi.fn();
    document.addEventListener("keydown", (e) => e.key === "Escape" && reached());
    act(() => choose("pane-block"));
    const card = await screen.findByRole("form", { name: "Block" });
    within(card).getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: "Block" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Task" })).toHaveFocus();
    expect(reached).not.toHaveBeenCalled();
  });
});

describe("TaskPane", () => {
  it("saves a title on Enter and rolls back with the refusal message shown in the pane", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    vi.mocked(api.editTask).mockRejectedValue({ kind: "refused", code: "empty-title", message: "title is empty" });
    render(<TaskPane />);
    await user.click(screen.getByText("Old title"));
    const input = screen.getByRole("textbox", { name: "Title" });
    await user.clear(input);
    await user.type(input, "{Enter}");
    expect(api.editTask).toHaveBeenCalledWith(2, { title: "" });
    expect(await within(screen.getByRole("complementary", { name: "Task" })).findByRole("alert")).toHaveTextContent(
      "title is empty",
    );
    expect(screen.getByText("Old title")).toBeInTheDocument();
  });

  it("opens an inline field with Space as well as Enter", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    render(<TaskPane />);
    screen.getByRole("button", { name: "Edit title: Old title" }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("returns focus to the edit button after Enter, Escape or a blur to nowhere", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    vi.mocked(api.editTask).mockResolvedValue();
    render(<TaskPane />);
    const edit = () => screen.getByRole("button", { name: /^Edit title:/ });

    await user.click(edit());
    await user.keyboard("{Enter}");
    expect(edit()).toHaveFocus();

    await user.click(edit());
    await user.keyboard("{Escape}");
    expect(edit()).toHaveFocus();

    await user.click(edit());
    act(() => screen.getByRole("textbox", { name: "Title" }).blur());
    expect(edit()).toHaveFocus();
  });

  it("leaves focus where it went when a blur moves it to another field", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    render(<TaskPane />);
    await user.click(screen.getByRole("button", { name: /^Edit title:/ }));
    await user.click(screen.getByRole("combobox", { name: "Assignee" }));
    expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveFocus();
  });

  it("names the editable title and notes after what they edit", () => {
    open(detail({ number: 2, title: "Old title", notes: "Keep this" }));
    render(<TaskPane />);
    expect(screen.getByRole("button", { name: "Edit title: Old title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit notes: Keep this" })).toBeInTheDocument();
  });

  it("cancels a title edit with Escape without closing the task", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    render(<TaskPane />);
    await user.click(screen.getByText("Old title"));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "x{Escape}");
    expect(api.editTask).not.toHaveBeenCalled();
    expect(screen.getByText("Old title")).toBeInTheDocument();
  });

  it("saves a second title edit started with the edit.title key", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, title: "Old title" }));
    render(<TaskPane />);
    await user.click(screen.getByText("Old title"));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "{Escape}");
    useDeck.setState({ focus: "task" });
    await user.keyboard("{Control>}e{/Control}");
    const input = screen.getByRole("textbox", { name: "Title" });
    await user.clear(input);
    await user.type(input, "New title{Enter}");
    expect(api.editTask).toHaveBeenCalledWith(2, { title: "New title" });
  });

  it("opens notes with Enter without typing a newline into them", async () => {
    const user = userEvent.setup();
    open(detail({ number: 2, notes: "Keep this" }));
    render(<TaskPane />);
    screen.getByText("Keep this").focus();
    await user.keyboard("{Enter}");
    const notes = screen.getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("Keep this");
    notes.blur();
    expect(api.editTask).not.toHaveBeenCalled();
  });

  it("prefills a reply with option 2", async () => {
    const user = userEvent.setup();
    const block = { ...blockOn("you"), options: ["Alpha", "Beta", "Gamma"] };
    open(detail({ ...row({ number: 3, status: "blocked" }), block }));
    render(<TaskPane />);
    await user.click(screen.getByRole("region", { name: /block/i }));
    await user.keyboard("2");
    expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("Beta");
  });

  it("opens the waits-on editor on a focused review with w", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 3, status: "review" }), review: reviewOn("you") }));
    render(<TaskPane />);
    await user.click(screen.getByRole("region", { name: "In Review" }));
    await user.keyboard("w");
    expect(screen.getByRole("combobox", { name: "Waits on" })).toBeInTheDocument();
  });

  it("draws the close and remove-step buttons as icons", () => {
    const steps = [{ id: "i1", short_id: "a1", done: false, text: "First" }];
    open(detail({ number: 2, steps }));
    render(<TaskPane />);
    for (const name of ["Close", "Remove step First"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector(".symbol")).toHaveAttribute("aria-hidden", "true");
      expect(button).not.toHaveTextContent("×");
    }
  });

  it("removes a step carrying its text and place for undo", async () => {
    const user = userEvent.setup();
    const steps = [
      { id: "i1", short_id: "a1", done: false, text: "First" },
      { id: "i2", short_id: "b2", done: false, text: "Second" },
    ];
    open(detail({ number: 2, steps }));
    render(<TaskPane />);
    await user.click(screen.getByRole("button", { name: "Remove step Second" }));
    expect(api.step).toHaveBeenCalledWith(2, { kind: "remove", id: "b2" });
    expect(useDeck.getState().undo[0]?.changes[0]).toEqual({
      kind: "step",
      number: 2,
      op: { kind: "remove", id: "b2" },
      before: { text: "Second", place: { kind: "after", id: "a1" } },
    });
  });

  it("lists the states with the current one selected", () => {
    open(detail({ ...row({ number: 2, status: "ready" }) }));
    render(<TaskPane />);
    const select = screen.getByRole("combobox", { name: "Status" });
    expect(select).toHaveDisplayValue("Ready");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Open", "Ready", "Started", "Done"]);
  });

  it("shows a blocked task's state without offering it as a choice", () => {
    open(detail({ ...row({ number: 2, status: "blocked", block: blockOn("you") }) }));
    render(<TaskPane />);
    const select = screen.getByRole("combobox", { name: "Status" });
    expect(select).toHaveDisplayValue("Blocked");
    expect(within(select).getByRole("option", { name: "Blocked" })).toBeDisabled();
  });

  it("applies a state chosen in the status pop-up", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 2, status: "started", assignee: "claude" }) }));
    vi.mocked(api.setStatus).mockResolvedValue();
    render(<TaskPane />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "Open");
    expect(api.setStatus).toHaveBeenLastCalledWith(2, { kind: "open" });
  });

  it("offers the changes that need more input in the Actions pull-down", async () => {
    const user = userEvent.setup();
    const choose = listenToMenus();
    open(detail({ ...row({ number: 2, status: "ready", assignee: "claude" }) }));
    vi.mocked(api.setStatus).mockResolvedValue();
    render(<TaskPane />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(vi.mocked(showPullDown).mock.calls[0][0]).toEqual([
      { id: "pane-block", title: "Block…" },
      { id: "pane-review", title: "Request Review…" },
      { id: "pane-assign", title: "Assign…" },
      { id: "pane-start-quiet", title: "Start Without Launching Agent" },
      { id: "pane-separator", title: "" },
      { id: "pane-archive", title: "Archive" },
    ]);
    choose("pane-start-quiet");
    expect(api.setStatus).toHaveBeenLastCalledWith(2, { kind: "start", dispatch: false, again: false, force: false });
    choose("pane-block");
    expect(await screen.findByRole("form", { name: "Block" })).toBeInTheDocument();
  });

  it("offers starting without an agent only for an assigned task", async () => {
    const user = userEvent.setup();
    listenToMenus();
    open(detail({ ...row({ number: 2, status: "ready" }) }));
    render(<TaskPane />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(vi.mocked(showPullDown).mock.calls[0][0].map((i) => i.id)).toEqual([
      "pane-block",
      "pane-review",
      "pane-assign",
      "pane-separator",
      "pane-archive",
    ]);
  });

  it("offers a relaunch after an agent-gone refusal", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 2, status: "ready", assignee: "claude" }) }));
    vi.mocked(api.setStatus).mockRejectedValueOnce({ kind: "refused", code: "agent-gone", message: "agent is gone" });
    render(<TaskPane />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "started");
    await user.click(await screen.findByRole("button", { name: "Relaunch" }));
    expect(api.setStatus).toHaveBeenLastCalledWith(2, { kind: "start", dispatch: true, again: true, force: false });
  });

  it("writes the runs-after list", async () => {
    const user = userEvent.setup();
    const task = detail({ ...row({ number: 2 }) });
    open(task);
    useDeck.setState({ allRows: [task, row({ number: 7, title: "Seven" })] });
    const choose = listenToMenus();
    render(<TaskPane />);
    await user.click(within(screen.getByRole("group", { name: "Runs after" })).getByRole("button", { name: "Add Runs After" }));
    expect(vi.mocked(showPullDown).mock.calls[0][0]).toEqual([{ id: "pane-after-7", title: "T7 Seven" }]);
    choose("pane-after-7");
    expect(api.editTask).toHaveBeenCalledWith(2, { after: [7] });
  });
});

describe("task properties", () => {
  it("shows an Add… push button for an empty Runs after and a plus beside existing links", () => {
    const task = detail({ ...row({ number: 2 }) });
    open(task);
    useDeck.setState({ allRows: [task, row({ number: 7, title: "Seven" })] });
    const { unmount } = render(<TaskPane />);
    const group = screen.getByRole("group", { name: "Runs after" });
    expect(within(group).getByRole("button", { name: "Add Runs After" })).toHaveTextContent("Add…");
    unmount();
    const linked = detail({ ...row({ number: 2 }), after: [{ task: 7, done: false }] });
    open(linked);
    useDeck.setState({ allRows: [linked, row({ number: 7, title: "Seven" }), row({ number: 8, title: "Eight" })] });
    render(<TaskPane />);
    const again = screen.getByRole("group", { name: "Runs after" });
    expect(within(again).getByRole("button", { name: "Add Dependency…" })).not.toHaveTextContent("Add…");
  });

  it("shows a status tskdeck does not know as Unknown, without offering it as a choice", () => {
    open(detail({ ...row({ number: 2, status: "unknown" }) }));
    render(<TaskPane />);
    const status = screen.getByRole("combobox", { name: "Status" });
    expect(status).toHaveDisplayValue("Unknown");
    expect(within(status).getByRole("option", { name: "Unknown" })).toBeDisabled();
  });

  it("titles the ellipsis pull-down More while keeping its name", () => {
    open(detail({ ...row({ number: 2 }) }));
    render(<TaskPane />);
    const more = screen.getByRole("button", { name: "Actions" });
    expect(more).toHaveAttribute("title", "More");
    expect(more.querySelector(".symbol-ellipsis-circle")).not.toBeNull();
  });

  describe("long text", () => {
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 300 });
      Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 120 });
    });
    afterEach(() => {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    });

    it("collapses long notes behind Show More", async () => {
      const user = userEvent.setup();
      open(detail({ number: 2, notes: "A long note" }));
      render(<TaskPane />);
      const toggle = screen.getByRole("button", { name: "Show More" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);
      expect(screen.getByRole("button", { name: "Show Less" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("button", { name: "Show More" })).not.toBeInTheDocument();
    });

    it("collapses a long Why and Needs of an open block", async () => {
      const user = userEvent.setup();
      open(detail({ ...row({ number: 3, status: "blocked" }), block: { ...blockOn("you"), why: "A long reason", needs: "A long need" } }));
      render(<TaskPane />);
      const region = screen.getByRole("region", { name: "Blocked" });
      const toggles = within(region).getAllByRole("button", { name: "Show More" });
      expect(toggles).toHaveLength(2);
      await user.click(toggles[0]);
      expect(within(region).getAllByRole("button", { name: "Show More" })).toHaveLength(1);
      expect(within(region).getByRole("button", { name: "Show Less" })).toBeInTheDocument();
    });
  });

  it("offers no Show More for short text", () => {
    open(detail({ number: 2, notes: "Short" }));
    render(<TaskPane />);
    expect(screen.queryByRole("button", { name: "Show More" })).not.toBeInTheDocument();
  });
});

describe("waits-on undo", () => {
  it.each([
    ["task:5", "T5"],
    ["agent:builder", "builder"],
    ["other:the vendor", "the vendor"],
    ["you", "you"],
  ])("undoes a change from %s by sending %s", async (stored, sent) => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 3, status: "blocked" }), block: blockOn(stored) }));
    vi.mocked(api.editTask).mockResolvedValue();
    render(<TaskPane />);
    await user.click(screen.getByRole("button", { name: "Change" }));
    const region = screen.getByRole("region", { name: "Blocked" });
    await user.selectOptions(within(region).getByRole("combobox", { name: "Waits on" }), "other");
    await user.type(within(region).getByRole("textbox", { name: "Who" }), "someone");
    await user.click(within(region).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(api.editTask).toHaveBeenCalledWith(3, { on: "someone" }));
    await vi.waitFor(() => expect(useDeck.getState().undo).toHaveLength(1));
    await useDeck.getState().undoLast();
    expect(api.editTask).toHaveBeenLastCalledWith(3, { on: sent });
  });
});

describe("replies and undo", () => {
  const earlier = { label: "Edit title", changes: [{ kind: "edit" as const, number: 9, before: { title: "Before" }, after: { title: "After" } }] };

  it("reports the answered block as not undoable instead of undoing the change before it", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 3, status: "blocked" }), block: blockOn("you") }));
    useDeck.setState({ undo: [earlier] });
    vi.mocked(api.reply).mockResolvedValue();
    vi.mocked(api.setStatus).mockResolvedValue();
    render(<TaskPane />);
    await user.type(screen.getByRole("textbox", { name: "Reply" }), "Go ahead");
    await user.click(screen.getByRole("button", { name: "Answer" }));
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalled());
    await useDeck.getState().undoLast();
    expect(api.editTask).not.toHaveBeenCalled();
    expect(useDeck.getState().error).toBe("Can't undo Answer");
  });

  it("reports a review sent back as not undoable", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 3, status: "review" }), review: reviewOn("you") }));
    useDeck.setState({ undo: [earlier] });
    vi.mocked(api.reply).mockResolvedValue();
    vi.mocked(api.setStatus).mockResolvedValue();
    render(<TaskPane />);
    await user.type(screen.getByRole("textbox", { name: "Feedback" }), "Fix the copy");
    await user.click(screen.getByRole("button", { name: "Send Back" }));
    await vi.waitFor(() => expect(api.setStatus).toHaveBeenCalled());
    await useDeck.getState().undoLast();
    expect(api.editTask).not.toHaveBeenCalled();
    expect(useDeck.getState().error).toBe("Can't undo Send back");
  });
});

describe("reply availability", () => {
  it("offers no reply on a task with nothing open", async () => {
    const user = userEvent.setup();
    open(detail({ ...row({ number: 2, status: "started" }) }));
    useDeck.setState({ focus: "task" });
    render(<TaskPane />);
    await user.keyboard("r");
    expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("offers a reply on a blocked task", () => {
    open(detail({ ...row({ number: 2, status: "blocked" }), block: blockOn("you") }));
    render(<TaskPane />);
    expect(screen.getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer" })).toBeInTheDocument();
  });
});

describe("steps from the keyboard", () => {
  const steps = [
    { id: "i1", short_id: "a1", done: false, text: "First" },
    { id: "i2", short_id: "b2", done: false, text: "Second" },
  ];

  function mount() {
    open(detail({ number: 2, steps }));
    vi.mocked(api.step).mockResolvedValue();
    useDeck.setState({ focus: "task" });
    render(<TaskPane />);
  }

  it("renames the focused step on Enter", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("listitem", { name: "Step Second" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Step text" })).toHaveFocus();
    await user.keyboard(" again{Enter}");
    expect(api.step).toHaveBeenCalledWith(2, { kind: "rename", id: "b2", text: "Second again" });
  });

  it("toggles the focused step on Space", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("listitem", { name: "Step First" }).focus();
    await user.keyboard(" ");
    expect(api.step).toHaveBeenCalledWith(2, { kind: "toggle", id: "a1" });
  });

  it("moves the focused step with alt+arrows", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("listitem", { name: "Step Second" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(api.step).toHaveBeenCalledWith(2, { kind: "move", id: "b2", place: { kind: "before", id: "a1" } });
    screen.getByRole("listitem", { name: "Step First" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(api.step).toHaveBeenCalledWith(2, { kind: "move", id: "a1", place: { kind: "after", id: "b2" } });
  });

  it("focuses the new step field on ctrl+a", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("complementary", { name: "Task" }).focus();
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.getByRole("textbox", { name: "New step" })).toHaveFocus();
  });

  it("leaves ctrl+a to a focused text field on mac", async () => {
    const user = userEvent.setup();
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      mount();
      await user.click(screen.getByText("Example task"));
      await user.keyboard("{Control>}a{/Control}");
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    } finally {
      platform.mockRestore();
    }
  });

  it("does not move the first step further up", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("listitem", { name: "Step First" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(api.step).not.toHaveBeenCalled();
  });
});

describe("project field", () => {
  it("shows the name given to the task's project", () => {
    const task = detail({ number: 4, project: "/home/test/a/wordpress/wp-content" });
    open(task);
    useDeck.setState({
      settings: { ...useDeck.getState().settings, projectNames: { "/home/test/a/wordpress/wp-content": "Alpha" } },
    });
    render(<TaskPane />);
    expect(screen.getByText("Project").nextElementSibling).toHaveTextContent("Alpha");
  });

  it("shows the sidebar's label for an unnamed project", () => {
    const task = detail({ number: 4, project: "/home/test/a/wordpress/wp-content" });
    open(task);
    useDeck.setState({
      allRows: [task, row({ number: 5, project: "/home/test/b/wordpress/wp-content" })],
    });
    render(<TaskPane />);
    expect(screen.getByText("Project").nextElementSibling).toHaveTextContent("a/wordpress/wp-content");
  });
});
