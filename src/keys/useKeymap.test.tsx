import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionId } from "./actions";
import { DEFAULT_KEYMAP, defaultKeymap } from "./keymap";
import { useKeymap } from "./useKeymap";

type Handlers = Partial<Record<ActionId, () => boolean | void>>;

function Harness(props: { handlers: Handlers; context?: "board" | "task" | "block" | "review"; mac?: boolean }) {
  useKeymap(DEFAULT_KEYMAP, props.handlers, props.context ?? "board", props.mac ?? false);
  return (
    <>
      <input aria-label="field" role="textbox" />
      <button type="button">Act</button>
    </>
  );
}

function MenuHarness(props: { handlers: Handlers; menuBar: boolean }) {
  useKeymap(defaultKeymap(true), props.handlers, "board", true, props.menuBar);
  return <button type="button">Act</button>;
}

describe("useKeymap with a menu bar", () => {
  afterEach(cleanup);
  it("leaves the menu's key equivalents to the menu", async () => {
    const user = userEvent.setup();
    const handlers = { "status.done": vi.fn(), capture: vi.fn(), undo: vi.fn() };
    render(<MenuHarness handlers={handlers} menuBar />);
    await user.keyboard("{Meta>}d{/Meta}{Meta>}n{/Meta}{Meta>}z{/Meta}");
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
    await user.keyboard("{Control>}d{/Control}");
    expect(handlers["status.done"]).toHaveBeenCalledTimes(1);
  });

  it("handles ⌘ chords itself without a menu bar", async () => {
    const user = userEvent.setup();
    const handlers = { "status.done": vi.fn() };
    render(<MenuHarness handlers={handlers} menuBar={false} />);
    await user.keyboard("{Meta>}d{/Meta}");
    expect(handlers["status.done"]).toHaveBeenCalledTimes(1);
  });
});

describe("useKeymap", () => {
  afterEach(cleanup);
  it("ignores bare keys in text fields", async () => {
    const user = userEvent.setup();
    const handlers = {
      "nav.down": vi.fn(),
      "nav.up": vi.fn(),
      "drawer.done": vi.fn(),
      sort: vi.fn(),
      search: vi.fn(),
      capture: vi.fn(),
      "view.desk": vi.fn(),
    };
    render(<Harness handlers={handlers} />);
    await user.type(screen.getByRole("textbox"), "jkds/+1");
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("jkds/+1");
  });
  it("still fires ctrl chords in text fields", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Harness handlers={{ "status.start": onStart }} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Control>}s{/Control}");
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it("fires escape in text fields", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness handlers={{ "task.close": onClose }} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("sends ctrl+f typed in a textbox to the field on a non-mac platform", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<Harness handlers={{ archive: onArchive }} mac={false} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Control>}f{/Control}");
    expect(onArchive).not.toHaveBeenCalled();
  });
  it("sends meta+f and ctrl+f typed in a textbox to the field on mac", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<Harness handlers={{ archive: onArchive, search: onArchive }} mac />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Meta>}f{/Meta}");
    expect(onArchive).not.toHaveBeenCalled();
    await user.keyboard("{Control>}f{/Control}");
    expect(onArchive).not.toHaveBeenCalled();
  });
  it("leaves ctrl+e in a textbox to the field on mac", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Harness handlers={{ "edit.title": onEdit }} mac />);
    await user.click(screen.getByRole("textbox"));
    const ev = new KeyboardEvent("keydown", { key: "e", ctrlKey: true, bubbles: true, cancelable: true });
    screen.getByRole("textbox").dispatchEvent(ev);
    expect(onEdit).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
  it("still fires meta chords in a textbox on mac", async () => {
    const user = userEvent.setup();
    const onPalette = vi.fn();
    render(<Harness handlers={{ palette: onPalette }} mac />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Meta>}k{/Meta}");
    expect(onPalette).toHaveBeenCalledTimes(1);
  });
  it("runs app undo on meta+z away from text fields on mac", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<Harness handlers={{ undo: onUndo }} mac />);
    await user.keyboard("{Meta>}z{/Meta}");
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
  it("leaves meta+z in a textbox to the field on mac", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<Harness handlers={{ undo: onUndo }} mac />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Meta>}z{/Meta}");
    expect(onUndo).not.toHaveBeenCalled();
  });
  it("opens search on meta+f and capture on meta+n away from text fields on mac", async () => {
    const user = userEvent.setup();
    const h = { search: vi.fn(), capture: vi.fn() };
    render(<Harness handlers={h} mac />);
    await user.keyboard("{Meta>}f{/Meta}{Meta>}n{/Meta}");
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledTimes(1);
  });
  it("keeps tsk's ctrl keys ahead of the mod aliases off mac", async () => {
    const user = userEvent.setup();
    const h = { search: vi.fn(), capture: vi.fn(), archive: vi.fn(), "status.ready": vi.fn() };
    render(<Harness handlers={h} mac={false} />);
    await user.keyboard("{Control>}n{/Control}{Control>}f{/Control}");
    expect(h["status.ready"]).toHaveBeenCalledTimes(1);
    expect(h.archive).toHaveBeenCalledTimes(1);
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.search).not.toHaveBeenCalled();
  });
  it("leaves a bare Tab to move focus and toggles focus on ctrl+tab", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Harness handlers={{ "focus.toggle": onToggle }} />);
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(onToggle).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    await user.keyboard("{Control>}{Tab}{/Control}");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it("fires bare keys outside text fields and prevents default", async () => {
    const user = userEvent.setup();
    const onDown = vi.fn();
    render(<Harness handlers={{ "nav.down": onDown }} />);
    await user.keyboard("j{ArrowDown}");
    expect(onDown).toHaveBeenCalledTimes(2);
    const ev = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
  it("leaves the key to the browser when the handler did not act", () => {
    render(<Harness handlers={{ "nav.down": () => false }} />);
    const ev = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
  it("leaves Enter, Space and Tab on a focused button to the button", async () => {
    const user = userEvent.setup();
    const h = { "task.open": vi.fn(), "mark.toggle": vi.fn(), "focus.toggle": vi.fn() };
    const onClick = vi.fn();
    render(<Harness handlers={h} />);
    const button = screen.getByRole("button", { name: "Act" });
    button.addEventListener("click", onClick);
    button.focus();
    await user.keyboard("{Enter} ");
    expect(onClick).toHaveBeenCalledTimes(2);
    await user.keyboard("{Tab}");
    expect(button).not.toHaveFocus();
    expect(h["task.open"]).not.toHaveBeenCalled();
    expect(h["mark.toggle"]).not.toHaveBeenCalled();
    expect(h["focus.toggle"]).not.toHaveBeenCalled();
  });
  it("still fires Enter away from native controls", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<Harness handlers={{ "task.open": onOpen }} />);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it("leaves unbound keys alone", () => {
    render(<Harness handlers={{ "nav.down": vi.fn() }} />);
    const ev = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
  it("resolves mod per platform", async () => {
    const user = userEvent.setup();
    const onPalette = vi.fn();
    const { unmount } = render(<Harness handlers={{ palette: onPalette }} mac />);
    await user.keyboard("{Control>}k{/Control}");
    expect(onPalette).not.toHaveBeenCalled();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(onPalette).toHaveBeenCalledTimes(1);
    unmount();
    render(<Harness handlers={{ palette: onPalette }} mac={false} />);
    await user.keyboard("{Control>}k{/Control}");
    expect(onPalette).toHaveBeenCalledTimes(2);
  });
  it("fires block and review actions only in their context, ahead of board actions", async () => {
    const user = userEvent.setup();
    const h = { "option.1": vi.fn(), "view.desk": vi.fn(), "review.approve": vi.fn(), "status.done": vi.fn() };
    const board = render(<Harness handlers={h} context="board" />);
    await user.keyboard("1{Control>}d{/Control}");
    expect(h["option.1"]).not.toHaveBeenCalled();
    expect(h["review.approve"]).not.toHaveBeenCalled();
    expect(h["view.desk"]).toHaveBeenCalledTimes(1);
    expect(h["status.done"]).toHaveBeenCalledTimes(1);
    board.unmount();

    const block = render(<Harness handlers={h} context="block" />);
    await user.keyboard("1");
    expect(h["option.1"]).toHaveBeenCalledTimes(1);
    expect(h["view.desk"]).toHaveBeenCalledTimes(1);
    block.unmount();

    render(<Harness handlers={h} context="review" />);
    await user.keyboard("{Control>}d{/Control}");
    expect(h["review.approve"]).toHaveBeenCalledTimes(1);
    expect(h["status.done"]).toHaveBeenCalledTimes(1);
  });
  it("falls back to the board action when the context has no handler", async () => {
    const user = userEvent.setup();
    const onDesk = vi.fn();
    render(<Harness handlers={{ "view.desk": onDesk }} context="block" />);
    await user.keyboard("1");
    expect(onDesk).toHaveBeenCalledTimes(1);
  });
});
