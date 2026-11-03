import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDeck } from "../state/store";
import { row } from "../test/fixtures";
import { Board } from "./Board";

const A = "/home/test/a/wordpress/wp-content";
const B = "/home/test/b/wordpress/wp-content";

beforeEach(() => {
  useDeck.setState(useDeck.getInitialState(), true);
  const rows = [
    row({ number: 1, status: "started", project: A, group: "wp-content" }),
    row({ number: 2, status: "started", project: B, group: "wp-content" }),
  ];
  useDeck.setState({
    loaded: true,
    rows,
    allRows: rows,
    options: { ...useDeck.getInitialState().options, group: "project" },
  });
});
afterEach(cleanup);

function groupTitles(): string[] {
  return [...document.querySelectorAll(".group-title")].map((h) => h.textContent ?? "");
}

describe("Board grouped by project", () => {
  it("heads each project's rows with its label, even when tsk names them alike", () => {
    render(<Board onNewTask={() => {}} />);
    expect(groupTitles()).toEqual(["a/wordpress/wp-content", "b/wordpress/wp-content"]);
  });

  it("heads a named project's rows with its name", () => {
    useDeck.setState({ settings: { ...useDeck.getState().settings, projectNames: { [A]: "Alpha" } } });
    render(<Board onNewTask={() => {}} />);
    expect(groupTitles()).toEqual(["Alpha", "wp-content"]);
    expect(screen.getByRole("group", { name: "In Motion — Alpha" })).toBeInTheDocument();
  });

  it("keeps tsk's group name for desk rows", () => {
    const rows = [row({ number: 3, status: "started", project: null, group: "desk" })];
    useDeck.setState({ rows, allRows: rows });
    render(<Board onNewTask={() => {}} />);
    expect(groupTitles()).toEqual(["desk"]);
  });
});

describe("Board multi-select", () => {
  beforeEach(() => {
    const rows = [
      row({ number: 1, status: "started" }),
      row({ number: 2, status: "started" }),
      row({ number: 3, status: "started" }),
    ];
    useDeck.setState({ rows, allRows: rows, options: { ...useDeck.getInitialState().options, group: "none" } });
  });

  it("is a single-select list outside mark mode, selecting the cursor row", () => {
    useDeck.setState({ cursor: 2 });
    render(<Board onNewTask={() => {}} />);
    const list = screen.getByRole("listbox", { name: "Tasks" });
    expect(list).not.toHaveAttribute("aria-multiselectable");
    expect(screen.getByRole("option", { name: /T2/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /T1/ })).toHaveAttribute("aria-selected", "false");
  });

  it("selects the marked rows in mark mode and leaves the cursor to the active descendant", () => {
    useDeck.setState({ cursor: 2, marks: [1, 3], markMode: true });
    render(<Board onNewTask={() => {}} />);
    const list = screen.getByRole("listbox", { name: "Tasks" });
    expect(list).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getByRole("option", { name: /T1/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /T3/ })).toHaveAttribute("aria-selected", "true");
    const cursorRow = screen.getByRole("option", { name: /T2/ });
    expect(cursorRow).toHaveAttribute("aria-selected", "false");
    expect(list).toHaveAttribute("aria-activedescendant", cursorRow.id);
  });

  it("shows a check beside each marked row so marks and cursor differ", () => {
    useDeck.setState({ cursor: 2, marks: [1], markMode: true });
    render(<Board onNewTask={() => {}} />);
    const marked = screen.getByRole("option", { name: /T1/ });
    const other = screen.getByRole("option", { name: /T2/ });
    expect(marked.querySelector(".row-check")).toHaveClass("is-checked");
    expect(other.querySelector(".row-check")).not.toHaveClass("is-checked");
  });
});
