import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, errorMessage, onBoardChanged, openDocs, zoom } from "./client";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
});

describe("api", () => {
  it("invokes list_scope with scope and options", async () => {
    await api.listScope(
      { kind: "project", path: "/home/test/site" },
      { shelf: "live", group: "none", sort: "recent" },
    );
    expect(invoke).toHaveBeenCalledWith("list_scope", {
      scope: { kind: "project", path: "/home/test/site" },
      options: { shelf: "live", group: "none", sort: "recent" },
    });
  });

  it("invokes tsk_info without arguments", async () => {
    await api.tskInfo();
    expect(invoke).toHaveBeenCalledWith("tsk_info");
  });

  it("invokes get_task with the number", async () => {
    await api.getTask(7);
    expect(invoke).toHaveBeenCalledWith("get_task", { number: 7 });
  });

  it("invokes set_status with the change", async () => {
    const change = { kind: "start", dispatch: false, again: false, force: false } as const;
    await api.setStatus(3, change);
    expect(invoke).toHaveBeenCalledWith("set_status", { number: 3, change });
  });

  it("invokes reply with text and send", async () => {
    await api.reply(3, "hello", true);
    expect(invoke).toHaveBeenCalledWith("reply", { number: 3, text: "hello", send: true });
  });

  it("invokes set_archived and save_settings", async () => {
    await api.setArchived(3, true);
    expect(invoke).toHaveBeenCalledWith("set_archived", { number: 3, archived: true });
    const settings = { openMode: "overlay", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {} } as const;
    await api.saveSettings(settings);
    expect(invoke).toHaveBeenCalledWith("save_settings", { settings });
  });

  it("invokes relocate_tsk without arguments", async () => {
    await api.relocateTsk();
    expect(invoke).toHaveBeenCalledWith("relocate_tsk");
  });

  it("invokes zoom with the direction", async () => {
    await zoom("in");
    expect(invoke).toHaveBeenCalledWith("zoom", { direction: "in" });
    await zoom("reset");
    expect(invoke).toHaveBeenCalledWith("zoom", { direction: "reset" });
  });

  it("invokes open_docs without arguments", async () => {
    await openDocs();
    expect(invoke).toHaveBeenCalledWith("open_docs");
  });

  it("returns the invoke result", async () => {
    vi.mocked(invoke).mockResolvedValue(42);
    await expect(api.capture({ title: "Example task" })).resolves.toBe(42);
  });
});

describe("onBoardChanged", () => {
  it("listens for board-changed and returns the unlisten function", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    const cb = vi.fn();
    const off = await onBoardChanged(cb);
    expect(listen).toHaveBeenCalledWith("board-changed", expect.any(Function));
    vi.mocked(listen).mock.calls[0][1]({ event: "board-changed", id: 1, payload: null });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(off).toBe(unlisten);
  });
});

describe("errorMessage", () => {
  it("maps refused errors to their message", () => {
    expect(errorMessage({ kind: "refused", code: "empty-title", message: "title is empty" })).toBe(
      "title is empty",
    );
  });

  it("maps notFound to fixed text", () => {
    expect(errorMessage({ kind: "notFound" })).toBe("tsk was not found");
  });

  it("maps timeout to text with the seconds", () => {
    expect(errorMessage({ kind: "timeout", seconds: 60 })).toBe("tsk didn't finish within 60 seconds.");
  });

  it("shows tsk's message for a store error", () => {
    expect(errorMessage({ kind: "store", message: "the store is locked" })).toBe("the store is locked");
  });

  it("returns a string rejection unchanged", () => {
    expect(errorMessage("settings file is locked")).toBe("settings file is locked");
  });

  it("uses the message for the other kinds", () => {
    expect(errorMessage({ kind: "spawn", message: "no exec" })).toBe("no exec");
    expect(errorMessage({ kind: "usage", message: "bad flag" })).toBe("bad flag");
    expect(errorMessage({ kind: "parse", message: "bad json" })).toBe("bad json");
    expect(errorMessage({ kind: "unexpected", exit: 2, message: "boom" })).toBe("boom");
  });
});
