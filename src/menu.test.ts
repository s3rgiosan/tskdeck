import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultKeymap, resolveKeymap } from "./keys/keymap";
import { acceleratorOf, menuAccelerators, menuChords, runMenuItem } from "./menu";

let exec: ReturnType<typeof vi.fn>;

beforeEach(() => {
  exec = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
});
afterEach(() => {
  document.body.innerHTML = "";
});

function focusField() {
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
}

describe("runMenuItem", () => {
  it("undoes the last board change away from text fields", () => {
    const undo = vi.fn();
    runMenuItem("undo", { undo });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalled();
  });

  it("undoes and redoes typing in a focused text field", () => {
    const undo = vi.fn();
    focusField();
    runMenuItem("undo", { undo });
    runMenuItem("redo", { undo });
    expect(exec.mock.calls).toEqual([["undo"], ["redo"]]);
    expect(undo).not.toHaveBeenCalled();
  });

  it("does nothing for redo on the board", () => {
    runMenuItem("redo", {});
    expect(exec).not.toHaveBeenCalled();
  });

  it("leaves Find to a focused text field", () => {
    const search = vi.fn();
    focusField();
    runMenuItem("find", { search });
    expect(search).not.toHaveBeenCalled();
  });

  it("runs the board actions behind each item", () => {
    const h = { capture: vi.fn(), search: vi.fn(), "sidebar.toggle": vi.fn(), "drawer.done": vi.fn(), palette: vi.fn() };
    for (const id of ["new-task", "find", "sidebar", "done-drawer", "palette", "unknown"]) runMenuItem(id, h);
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs the task action behind each Task and context menu item", () => {
    const ids: Record<string, string> = {
      "task-open": "task.open",
      "task-start": "status.start",
      "task-ready": "status.ready",
      "task-done": "status.done",
      "task-block": "status.block",
      "task-review": "status.review",
      "task-assign": "assign",
      "task-archive": "archive",
    };
    for (const [id, action] of Object.entries(ids)) {
      const fn = vi.fn();
      runMenuItem(id, { [action]: fn });
      expect(fn, id).toHaveBeenCalledTimes(1);
    }
  });
});

describe("menu key equivalents", () => {
  it("spells ⌘ bindings the way the menu reads them", () => {
    expect(acceleratorOf("mod+shift+d")).toBe("Shift+Cmd+D");
    expect(acceleratorOf("ctrl+meta+s")).toBe("Ctrl+Cmd+S");
    expect(acceleratorOf("mod+,")).toBe("Cmd+,");
    expect(acceleratorOf("mod+arrowup")).toBe("Cmd+Up");
  });

  it("leaves bindings without ⌘ or with keys the menu cannot show to the keymap", () => {
    expect(acceleratorOf("ctrl+d")).toBeNull();
    expect(acceleratorOf("d")).toBeNull();
    expect(acceleratorOf("mod+@")).toBeNull();
    expect(acceleratorOf("mod++")).toBeNull();
  });

  it("gives the Task items their macOS defaults", () => {
    expect(menuAccelerators(defaultKeymap(true))).toMatchObject({
      "task-open": "Cmd+O",
      "task-start": "Cmd+L",
      "task-ready": "Cmd+Y",
      "task-done": "Cmd+D",
      "task-review": "Cmd+R",
      "new-task": "Cmd+N",
      find: "Cmd+F",
      palette: "Cmd+K",
      settings: "Cmd+,",
      sidebar: "Ctrl+Cmd+S",
      "done-drawer": "Shift+Cmd+D",
    });
  });

  it("leaves Block, Assign and Archive without a menu key on macOS", () => {
    expect(menuAccelerators(defaultKeymap(true))).toMatchObject({ "task-block": null, "task-assign": null, "task-archive": null });
  });

  it("follows a rebound key, and clears an item left without a ⌘ binding", () => {
    const keymap = resolveKeymap({ "status.done": ["meta+j"], "status.start": ["ctrl+s"] }, true);
    expect(menuAccelerators(keymap)).toMatchObject({ "task-done": "Cmd+J", "task-start": null });
    expect(menuChords(keymap)).toContain("meta+j");
    expect(menuChords(keymap)).not.toContain("meta+l");
  });

  it("keeps Undo and Redo on their standard keys", () => {
    expect(menuChords(resolveKeymap({ undo: ["ctrl+u"] }, true))).toEqual(expect.arrayContaining(["meta+z", "shift+meta+z"]));
  });
});

describe("View menu choices", () => {
  it("hands Group By and Sort By choices on", () => {
    const onChoice = vi.fn();
    runMenuItem("group-thread", {}, onChoice);
    runMenuItem("sort-title", {}, onChoice);
    expect(onChoice.mock.calls).toEqual([[{ group: "thread" }], [{ sort: "title" }]]);
  });
});
