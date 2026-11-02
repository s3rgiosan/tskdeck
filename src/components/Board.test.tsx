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
