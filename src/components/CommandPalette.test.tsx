import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveKeymap } from "../keys/keymap";
import { CommandPalette } from "./CommandPalette";

afterEach(cleanup);

describe("CommandPalette", () => {
  it("runs an action from the palette", async () => {
    const done = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ "status.done": done, undo: vi.fn() }} onClose={onClose} isMac />);
    await userEvent.type(screen.getByRole("combobox"), "done{Enter}");
    expect(done).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("lists only available actions with their keys", () => {
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ "status.done": vi.fn(), undo: vi.fn() }} onClose={() => {}} isMac />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /Mark Done/ })).toHaveTextContent("⌃D");
  });

  it("moves the selection with the arrow keys", async () => {
    const undo = vi.fn();
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ "status.done": vi.fn(), undo }} onClose={() => {}} isMac />);
    await userEvent.type(screen.getByRole("combobox"), "{ArrowDown}{Enter}");
    expect(undo).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ undo: vi.fn() }} onClose={onClose} isMac />);
    await userEvent.type(screen.getByRole("combobox"), "{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("points the combobox at the active option and follows the arrow keys", async () => {
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ "status.done": vi.fn(), undo: vi.fn() }} onClose={() => {}} isMac />);
    const box = screen.getByRole("combobox", { name: "Search actions" });
    const [first, second] = screen.getAllByRole("option");
    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    await userEvent.type(box, "{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", second.id);
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("collapses the combobox and keeps the empty note outside the list when nothing matches", async () => {
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ undo: vi.fn() }} onClose={() => {}} isMac />);
    const box = screen.getByRole("combobox", { name: "Search actions" });
    expect(box).toHaveAttribute("aria-expanded", "true");
    await userEvent.type(box, "zzz");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("No matching action")).toBeInTheDocument();
  });

  it("scrolls the active option into view when it changes", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<CommandPalette keymap={resolveKeymap({})} handlers={{ "status.done": vi.fn(), undo: vi.fn() }} onClose={() => {}} isMac />);
      scroll.mockClear();
      await userEvent.type(screen.getByRole("combobox"), "{ArrowDown}");
      expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("shows the search field with a magnifying glass", () => {
    render(<CommandPalette keymap={resolveKeymap({})} handlers={{ undo: vi.fn() }} onClose={() => {}} isMac />);
    const box = screen.getByRole("combobox");
    expect(box.parentElement).toHaveClass("search-field");
    expect(box.parentElement?.querySelector(".symbol-magnifyingglass-large")).not.toBeNull();
  });
});
