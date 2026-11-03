import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeck } from "../state/store";
import { Toolbar } from "./Toolbar";

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  onBoardChanged: vi.fn(),
}));

beforeEach(() => {
  useDeck.setState(useDeck.getInitialState(), true);
  useDeck.setState({ scope: { kind: "all" } });
});
afterEach(cleanup);

function renderToolbar() {
  render(<Toolbar title="All Tasks" sidebarHidden={false} searchFocus={0} onToggleSidebar={() => {}} onNewTask={() => {}} />);
}

function labels(name: string): string[] {
  return within(screen.getByRole("combobox", { name })).getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("Toolbar pop-ups", () => {
  it("words the Group By choices as what they do", () => {
    renderToolbar();
    expect(labels("Group By")).toEqual(["No Grouping", "Group by Project", "Group by Thread", "Group by Assignee"]);
  });

  it("words the Sort By choices as what they do", () => {
    renderToolbar();
    expect(labels("Sort By")).toEqual([
      "Sort by Most Recent",
      "Sort by Project",
      "Sort by Thread",
      "Sort by Title",
      "Sort by Assignee",
    ]);
  });

  it("keeps the control names and titles", () => {
    renderToolbar();
    expect(screen.getByRole("combobox", { name: "Group By" })).toHaveAttribute("title", "Group By");
    expect(screen.getByRole("combobox", { name: "Sort By" })).toHaveAttribute("title", "Sort By");
  });
});
