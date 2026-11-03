import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { TaskRow } from "../api/types";
import { useDeck } from "../state/store";
import { row } from "../test/fixtures";
import { DoneDrawer } from "./DoneDrawer";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, api: { listScope: vi.fn() }, onBoardChanged: vi.fn() };
});

const DONE = [row({ number: 1, title: "Finished one", status: "done" }), row({ number: 2, title: "Finished two", status: "done" })];
const ARCHIVED = [row({ number: 7, title: "Shelved seven", status: "done" })];

function listing(done: TaskRow[], archived: TaskRow[]) {
  vi.mocked(api.listScope).mockImplementation((_scope, options) =>
    Promise.resolve(options.shelf === "archived" ? archived : done),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
});
afterEach(cleanup);

describe("DoneDrawer", () => {
  it("lists done and archived tasks", async () => {
    listing(DONE, ARCHIVED);
    render(<DoneDrawer onClose={() => {}} />);
    expect(await screen.findByText("Finished one")).toBeInTheDocument();
    expect(screen.getByText("Shelved seven")).toBeInTheDocument();
  });

  it("exposes Restore as a button of its own", async () => {
    listing(DONE, ARCHIVED);
    render(<DoneDrawer onClose={() => {}} />);
    await screen.findByText("Shelved seven");
    const restore = screen.getByRole("button", { name: "Restore" });
    expect(restore.closest("[role=option]")).toBeNull();
  });

  it("restores an archived task and reloads the lists", async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockResolvedValue(true);
    useDeck.setState({ run });
    listing(DONE, ARCHIVED);
    render(<DoneDrawer onClose={() => {}} />);
    await screen.findByText("Shelved seven");
    listing(DONE, []);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(run).toHaveBeenCalledWith(
      { kind: "archive", number: 7, archived: false },
      { kind: "archive", number: 7, archived: false },
      "Restore",
    );
    await vi.waitFor(() => expect(screen.queryByText("Shelved seven")).not.toBeInTheDocument());
    expect(screen.getByText("Tasks you archive show up here.")).toBeInTheDocument();
  });

  it("shows the error when the lists cannot be reloaded after a restore", async () => {
    const user = userEvent.setup();
    useDeck.setState({ run: vi.fn().mockResolvedValue(false) });
    listing(DONE, ARCHIVED);
    render(<DoneDrawer onClose={() => {}} />);
    await screen.findByText("Shelved seven");
    vi.mocked(api.listScope).mockRejectedValue("Listing failed");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Listing failed");
  });

  it("keeps the newest listing when an older request resolves last", async () => {
    let releaseFirst: (rows: TaskRow[]) => void = () => {};
    const first = new Promise<TaskRow[]>((resolve) => {
      releaseFirst = resolve;
    });
    vi.mocked(api.listScope).mockImplementation((scope, options) => {
      if (scope.kind === "desk") return options.shelf === "done" ? first : Promise.resolve([]);
      return Promise.resolve(options.shelf === "done" ? [row({ number: 5, title: "Newest listing", status: "done" })] : []);
    });
    render(<DoneDrawer onClose={() => {}} />);
    act(() => useDeck.setState({ scope: { kind: "project", path: "/home/test/work" } }));
    await screen.findByText("Newest listing");
    await act(async () => releaseFirst([row({ number: 9, title: "Stale listing", status: "done" })]));
    expect(screen.getByText("Newest listing")).toBeInTheDocument();
    expect(screen.queryByText("Stale listing")).not.toBeInTheDocument();
  });

  it("sets no state after it unmounts", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let release: (rows: TaskRow[]) => void = () => {};
    vi.mocked(api.listScope).mockImplementation(
      () =>
        new Promise<TaskRow[]>((resolve) => {
          release = resolve;
        }),
    );
    const { unmount } = render(<DoneDrawer onClose={() => {}} />);
    unmount();
    await act(async () => release(DONE));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("moves between rows with the arrow keys", async () => {
    const user = userEvent.setup();
    listing(DONE, []);
    render(<DoneDrawer onClose={() => {}} />);
    const list = await screen.findByRole("list", { name: "Done tasks" });
    const rows = within(list).getAllByRole("listitem");
    rows[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(rows[1]).toHaveFocus();
  });
});
