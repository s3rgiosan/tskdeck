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
});
