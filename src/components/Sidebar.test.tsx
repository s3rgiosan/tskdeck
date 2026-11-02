import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeck } from "../state/store";
import { row } from "../test/fixtures";
import { Sidebar } from "./Sidebar";

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  onBoardChanged: vi.fn(),
}));

function rows() {
  const work = Array.from({ length: 12 }, (_, i) =>
    row({ number: i + 1, status: "ready", project: "/home/test/work/site", thread: i === 0 ? "launch" : null }),
  );
  return [...work, row({ number: 99, status: "ready", project: "/home/test/client/site", assignee: "ana" })];
}

let selectScope: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useDeck.setState(useDeck.getInitialState(), true);
  selectScope = vi.fn();
  useDeck.setState({ allRows: rows(), selectScope: selectScope as never, focus: "board" });
});
afterEach(cleanup);

describe("Sidebar", () => {
  it("lists projects, threads and assignees with counts", () => {
    render(<Sidebar onRename={() => {}} />);
    expect(screen.getByText("work/site")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();
    expect(screen.getByText("ana")).toBeInTheDocument();
  });

  it("selects a project with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Sidebar onRename={() => {}} />);
    await user.keyboard("p");
    await user.keyboard("cli");
    await user.keyboard("{Enter}");
    expect(selectScope).toHaveBeenCalledWith({ kind: "project", path: "/home/test/client/site" });
  });

  it("selects the highlighted item with Enter while the sidebar has focus", async () => {
    const user = userEvent.setup();
    useDeck.setState({ focus: "sidebar" });
    render(<Sidebar onRename={() => {}} />);
    await user.keyboard("j");
    await user.keyboard("{Enter}");
    expect(selectScope).toHaveBeenCalledTimes(1);
    expect(selectScope).toHaveBeenCalledWith({ kind: "all" });
  });

  it("activates a focused item with Enter and with a click", async () => {
    const user = userEvent.setup();
    render(<Sidebar onRename={() => {}} />);
    const item = screen.getByText("ana").closest("[role=option]") as HTMLElement;
    item.focus();
    await user.keyboard("{Enter}");
    expect(selectScope).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText("launch"));
    expect(selectScope).toHaveBeenLastCalledWith({ kind: "thread", name: "launch" });
  });

  it("puts DOM focus on the sidebar list and points it at the highlighted item", async () => {
    const user = userEvent.setup();
    useDeck.setState({ focus: "sidebar" });
    render(<Sidebar onRename={() => {}} />);
    const views = screen.getByRole("listbox", { name: "Views" });
    await vi.waitFor(() => expect(views).toHaveFocus());
    const desk = within(views).getAllByRole("option")[0];
    expect(views).toHaveAttribute("aria-activedescendant", desk.id);
    await user.keyboard("j");
    const all = within(views).getAllByRole("option")[1];
    expect(all.id).not.toBe("");
    expect(views).toHaveAttribute("aria-activedescendant", all.id);
    await user.keyboard("j");
    const projects = screen.getByRole("listbox", { name: "Projects" });
    await vi.waitFor(() => expect(projects).toHaveFocus());
    expect(projects).toHaveAttribute("aria-activedescendant", within(projects).getAllByRole("option")[0].id);
  });

  it("keeps Escape in the filter from reaching the board keys", async () => {
    const user = userEvent.setup();
    const reached = vi.fn();
    const listen = (e: KeyboardEvent) => e.key === "Escape" && reached();
    window.addEventListener("keydown", listen);
    try {
      render(<Sidebar onRename={() => {}} />);
      await user.keyboard("p");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox", { name: "Filter projects" })).not.toBeInTheDocument();
      expect(reached).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", listen);
    }
  });

  it("does nothing on Enter when the filter matches nothing", async () => {
    const user = userEvent.setup();
    render(<Sidebar onRename={() => {}} />);
    await user.keyboard("t");
    await user.keyboard("zzz{Enter}");
    expect(selectScope).not.toHaveBeenCalled();
  });

  it("keeps the highlight within the filtered section", async () => {
    const user = userEvent.setup();
    render(<Sidebar onRename={() => {}} />);
    await user.keyboard("t");
    await user.keyboard("lau{ArrowDown}{ArrowDown}{Enter}");
    expect(selectScope).toHaveBeenCalledWith({ kind: "thread", name: "launch" });
  });
});
