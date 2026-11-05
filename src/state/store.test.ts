import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, onBoardChanged } from "../api/client";
import type { Settings } from "../api/types";
import { sidebarModel } from "../board/sidebar";
import { detail, row } from "../test/fixtures";
import { resetBoardSubscription, useDeck } from "./store";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      tskInfo: vi.fn(),
      listScope: vi.fn(),
      getTask: vi.fn(),
      capture: vi.fn(),
      setStatus: vi.fn(),
      editTask: vi.fn(),
      step: vi.fn(),
      reply: vi.fn(),
      setArchived: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      relocateTsk: vi.fn(),
    },
    onBoardChanged: vi.fn(),
  };
});

const settings = { openMode: "beside" as const, keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {}, checkForUpdates: true };

beforeEach(() => {
  resetBoardSubscription();
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
  vi.mocked(api.getSettings).mockResolvedValue(settings);
  vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "ready" })]);
  vi.mocked(onBoardChanged).mockResolvedValue(() => {});
  vi.mocked(api.relocateTsk).mockResolvedValue();
});

describe("useDeck", () => {
  it("refreshes both listings on init", async () => {
    await useDeck.getState().init();
    expect(api.listScope).toHaveBeenCalledWith({ kind: "all" }, expect.objectContaining({ shelf: "live" }));
    expect(useDeck.getState().rows).toHaveLength(1);
    expect(useDeck.getState().loaded).toBe(true);
  });

  it("builds the desk board with the rule the desk count uses", async () => {
    vi.mocked(api.listScope).mockResolvedValue([
      row({ number: 1, project: "/home/test/alpha", status: "started" }),
      row({ number: 2, project: "/home/test/alpha", status: "ready" }),
      row({ number: 3, project: "/home/test/beta", status: "blocked" }),
      row({ number: 4, project: null, status: "open" }),
      row({ number: 5, project: null, status: "ready" }),
    ]);
    await useDeck.getState().init();
    const { rows, allRows } = useDeck.getState();
    expect(rows.map((r) => r.number).sort()).toEqual([1, 3, 4, 5]);
    expect(sidebarModel(allRows).desk.count).toBe(rows.length);
    expect(api.listScope).not.toHaveBeenCalledWith({ kind: "desk" }, expect.anything());
    expect(api.listScope).toHaveBeenCalledTimes(1);
  });

  it("lists the desk across projects with its own grouping", async () => {
    await useDeck.getState().init();
    vi.mocked(api.listScope).mockClear();
    await useDeck.getState().setOptions({ group: "thread" });
    expect(api.listScope).toHaveBeenCalledWith({ kind: "all" }, { shelf: "live", group: "none", sort: "recent" });
    expect(api.listScope).toHaveBeenCalledWith({ kind: "all" }, { shelf: "live", group: "thread", sort: "recent" });
  });

  it("rolls back and shows tsk's message when a write is refused", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "ready" })] });
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "after-not-done", message: "T3 is not done" });
    await useDeck
      .getState()
      .run(
        { kind: "status", number: 1, change: { kind: "done", clean: false } },
        { kind: "status", number: 1, from: "ready", to: "done", dispatched: false },
        "Done",
      );
    expect(useDeck.getState().rows[0].status).toBe("ready");
    expect(useDeck.getState().error).toBe("T3 is not done");
    expect(useDeck.getState().undo).toHaveLength(0);
  });

  it("pushes an undo entry and refreshes after a successful write", async () => {
    useDeck.setState({ scope: { kind: "all" }, rows: [row({ number: 1, status: "ready" })] });
    vi.mocked(api.setStatus).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "done" })]);
    await useDeck
      .getState()
      .run(
        { kind: "status", number: 1, change: { kind: "done", clean: false } },
        { kind: "status", number: 1, from: "ready", to: "done", dispatched: false },
        "Done",
      );
    expect(useDeck.getState().undo).toHaveLength(1);
    expect(useDeck.getState().rows[0].status).toBe("done");
  });

  it("re-reads on board-changed", async () => {
    let callback: () => void = () => {};
    vi.mocked(onBoardChanged).mockImplementation(async (cb) => {
      callback = cb;
      return () => {};
    });
    await useDeck.getState().init();
    vi.mocked(api.listScope).mockClear();
    callback();
    await vi.waitFor(() => expect(api.listScope).toHaveBeenCalledTimes(1));
  });

  it("records tsk-not-found without listing", async () => {
    vi.mocked(api.tskInfo).mockRejectedValue({ kind: "notFound" });
    await useDeck.getState().init();
    expect(useDeck.getState().tskError).toEqual({ kind: "notFound" });
    expect(api.listScope).not.toHaveBeenCalled();
  });

  it("ends with the newer rows when a write is rejected after a refresh landed", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "ready" })] });
    let reject: (e: unknown) => void = () => {};
    vi.mocked(api.setStatus).mockReturnValue(new Promise<void>((_, r) => (reject = r)));
    const pending = useDeck
      .getState()
      .run(
        { kind: "status", number: 1, change: { kind: "done", clean: false } },
        { kind: "status", number: 1, from: "ready", to: "done", dispatched: false },
        "Done",
      );
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "started", title: "Newer" })]);
    await useDeck.getState().refresh();
    reject({ kind: "refused", code: "x", message: "nope" });
    await pending;
    expect(useDeck.getState().rows[0].title).toBe("Newer");
    expect(useDeck.getState().error).toBe("nope");
  });

  it("looks for the tsk binary again before checking tsk", async () => {
    await useDeck.getState().recheckTsk();
    expect(api.relocateTsk).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.relocateTsk).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.tskInfo).mock.invocationCallOrder[0],
    );
  });

  it("subscribes again on the next init after a failed subscribe", async () => {
    let callback: () => void = () => {};
    vi.mocked(onBoardChanged)
      .mockRejectedValueOnce("listen failed")
      .mockImplementationOnce(async (cb) => {
        callback = cb;
        return () => {};
      });
    await useDeck.getState().init();
    expect(useDeck.getState().error).toBe("listen failed");
    await useDeck.getState().init();
    expect(onBoardChanged).toHaveBeenCalledTimes(2);
    vi.mocked(api.listScope).mockClear();
    callback();
    await vi.waitFor(() => expect(api.listScope).toHaveBeenCalledTimes(1));
  });

  it("re-reads when the window regains focus", async () => {
    await useDeck.getState().init();
    vi.mocked(api.listScope).mockClear();
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(api.listScope).toHaveBeenCalledTimes(1));
  });

  it("listens for window focus once across inits", async () => {
    const add = vi.spyOn(window, "addEventListener");
    try {
      await useDeck.getState().init();
      await useDeck.getState().init();
      expect(add.mock.calls.filter(([type]) => type === "focus")).toHaveLength(1);
    } finally {
      add.mockRestore();
    }
  });

  it("subscribes to board changes once when init runs twice concurrently", async () => {
    await Promise.all([useDeck.getState().init(), useDeck.getState().init()]);
    expect(onBoardChanged).toHaveBeenCalledTimes(1);
  });
});

describe("cursor", () => {
  it("moves to the task in its place when the cursor task leaves the board", async () => {
    useDeck.setState({ scope: { kind: "all" } });
    vi.mocked(api.listScope).mockResolvedValue([
      row({ number: 1, status: "started" }),
      row({ number: 2, status: "started" }),
      row({ number: 3, status: "started" }),
    ]);
    await useDeck.getState().refresh();
    useDeck.getState().moveCursor(1);
    useDeck.getState().moveCursor(1);
    expect(useDeck.getState().cursor).toBe(2);
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "started" }), row({ number: 3, status: "started" })]);
    await useDeck.getState().refresh();
    expect(useDeck.getState().cursor).toBe(3);
  });
});

describe("capture cursor", () => {
  it("moves the cursor to the captured task when a newer refresh lists it", async () => {
    const releases: ((rows: ReturnType<typeof row>[]) => void)[] = [];
    vi.mocked(api.listScope).mockImplementation(() => new Promise((r) => releases.push(r)));
    vi.mocked(api.capture).mockResolvedValue(9);
    const rows = [row({ number: 1, status: "open" }), row({ number: 9, status: "open" })];
    const capturing = useDeck.getState().capture({ title: "Example task" });
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    const watching = useDeck.getState().refresh();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[0](rows);
    await capturing;
    releases[1](rows);
    await watching;
    expect(useDeck.getState().cursor).toBe(9);
  });
});

describe("open task guards", () => {
  it("does not let a slow refresh replace another task's detail", async () => {
    let release: (d: ReturnType<typeof detail>) => void = () => {};
    vi.mocked(api.getTask).mockImplementationOnce(() => new Promise((r) => (release = r)));
    useDeck.setState({ openTask: 1 });
    const pending = useDeck.getState().refresh();
    await vi.waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(1));
    vi.mocked(api.getTask).mockResolvedValueOnce(detail({ number: 2 }));
    await useDeck.getState().open(2);
    release(detail({ number: 1 }));
    await pending;
    expect(useDeck.getState().detail?.number).toBe(2);
  });

  it("remembers a refusal code for the failed command", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "ready" })] });
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "agent-gone", message: "gone" });
    const cmd = { kind: "status" as const, number: 1, change: { kind: "start" as const, dispatch: true, again: false, force: false } };
    await useDeck.getState().run(cmd, { kind: "status", number: 1, from: "ready", to: "started", dispatched: true }, "Start");
    expect(useDeck.getState().refusal).toEqual({ code: "agent-gone", cmd, label: "Start" });
  });
});

describe("marking the open task done", () => {
  const done = { kind: "done" as const, clean: false };

  beforeEach(() => {
    vi.mocked(api.getTask).mockResolvedValue(detail({ number: 1 }));
    useDeck.setState({ rows: [row({ number: 1, status: "ready" }), row({ number: 2, status: "ready" })], openTask: 1, detail: detail({ number: 1 }) });
  });

  it("closes the task", async () => {
    vi.mocked(api.setStatus).mockResolvedValue();
    await useDeck.getState().run({ kind: "status", number: 1, change: done }, { kind: "status", number: 1, from: "ready", to: "done", dispatched: false }, "Mark Done");
    expect(useDeck.getState().openTask).toBeNull();
    expect(useDeck.getState().detail).toBeNull();
  });

  it("keeps the task open when tsk refuses", async () => {
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "after-not-done", message: "T3 is not done" });
    await useDeck.getState().run({ kind: "status", number: 1, change: done }, { kind: "status", number: 1, from: "ready", to: "done", dispatched: false }, "Mark Done");
    expect(useDeck.getState().openTask).toBe(1);
    expect(useDeck.getState().error).toBe("T3 is not done");
  });

  it("keeps the task open when another status is set", async () => {
    vi.mocked(api.setStatus).mockResolvedValue();
    await useDeck.getState().run({ kind: "status", number: 1, change: { kind: "open" } }, { kind: "status", number: 1, from: "ready", to: "open", dispatched: false }, "Reopen");
    expect(useDeck.getState().openTask).toBe(1);
  });

  it("closes the task when a bulk Mark Done includes it", async () => {
    vi.mocked(api.setStatus).mockResolvedValue();
    await useDeck.getState().runBulk(
      [1, 2].map((number) => ({ kind: "status" as const, number, change: done })),
      [1, 2].map((number) => ({ kind: "status" as const, number, from: "ready" as const, to: "done" as const, dispatched: false })),
      "Mark Done",
    );
    expect(useDeck.getState().openTask).toBeNull();
  });

  it("keeps the task open when a bulk Mark Done leaves it out", async () => {
    vi.mocked(api.setStatus).mockResolvedValue();
    await useDeck.getState().runBulk([{ kind: "status", number: 2, change: done }], [{ kind: "status", number: 2, from: "ready", to: "done", dispatched: false }], "Mark Done");
    expect(useDeck.getState().openTask).toBe(1);
  });

  it("keeps the task open when its part of a bulk Mark Done fails", async () => {
    vi.mocked(api.setStatus).mockImplementation((number) => (number === 1 ? Promise.reject({ kind: "refused", code: "x", message: "no" }) : Promise.resolve()));
    await useDeck.getState().runBulk(
      [1, 2].map((number) => ({ kind: "status" as const, number, change: done })),
      [1, 2].map((number) => ({ kind: "status" as const, number, from: "ready" as const, to: "done" as const, dispatched: false })),
      "Mark Done",
    );
    expect(useDeck.getState().openTask).toBe(1);
  });
});

describe("applySettings", () => {
  it("takes settings saved elsewhere and reports whether the tsk path changed", () => {
    const next = { openMode: "overlay" as const, keymap: { undo: ["x"] }, tskPath: null, sidebarHidden: true, projectNames: {}, checkForUpdates: true };
    expect(useDeck.getState().applySettings(next)).toBe(false);
    expect(useDeck.getState().settings).toEqual(next);
    expect(useDeck.getState().applySettings({ ...next, tskPath: "/opt/test/tsk" })).toBe(true);
    expect(useDeck.getState().settings.tskPath).toBe("/opt/test/tsk");
  });
});

describe("renameProject", () => {
  it("saves the trimmed name for the project's path", async () => {
    vi.mocked(api.saveSettings).mockResolvedValue();
    await useDeck.getState().renameProject("/home/test/a/wp-content", "  Alpha  ");
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ projectNames: { "/home/test/a/wp-content": "Alpha" } }),
    );
    expect(useDeck.getState().settings.projectNames).toEqual({ "/home/test/a/wp-content": "Alpha" });
  });

  it("clears the name when the new name is blank", async () => {
    vi.mocked(api.saveSettings).mockResolvedValue();
    useDeck.setState({
      settings: { ...useDeck.getState().settings, projectNames: { "/home/test/a": "Alpha", "/home/test/b": "Beta" } },
      settingsLoaded: true,
    });
    await useDeck.getState().renameProject("/home/test/a", " ");
    expect(useDeck.getState().settings.projectNames).toEqual({ "/home/test/b": "Beta" });
  });
});

describe("sort by project", () => {
  const A = "/home/test/a/wordpress/wp-content";
  const B = "/home/test/b/wordpress/wp-content";
  const Z = "/home/test/zeta";
  // tsk sorts by folder name, so two projects with the same folder name come back mixed.
  const listed = [
    row({ number: 1, status: "started", project: A }),
    row({ number: 2, status: "started", project: B }),
    row({ number: 3, status: "started", project: null }),
    row({ number: 4, status: "started", project: A }),
    row({ number: 5, status: "started", project: Z }),
  ];

  async function listSortedByProject() {
    vi.mocked(api.listScope).mockResolvedValue(listed);
    useDeck.setState({ scope: { kind: "all" }, options: { ...useDeck.getState().options, sort: "project" } });
    await useDeck.getState().refresh();
    return useDeck.getState().rows.map((r) => r.number);
  }

  it("orders rows by project label, keeping each project's rows together and desk rows last", async () => {
    expect(await listSortedByProject()).toEqual([1, 4, 2, 5, 3]);
  });

  it("orders a named project by its name", async () => {
    useDeck.setState({ settings: { ...settings, projectNames: { [B]: "Alpha" } } });
    expect(await listSortedByProject()).toEqual([2, 1, 4, 5, 3]);
  });

  it("orders the rows again when a project is renamed", async () => {
    vi.mocked(api.saveSettings).mockResolvedValue();
    await listSortedByProject();
    await useDeck.getState().renameProject(B, "Zulu");
    expect(useDeck.getState().rows.map((r) => r.number)).toEqual([1, 4, 5, 2, 3]);
  });

  it("keeps tsk's order under other sorts", async () => {
    vi.mocked(api.listScope).mockResolvedValue(listed);
    useDeck.setState({ scope: { kind: "all" } });
    await useDeck.getState().refresh();
    expect(useDeck.getState().rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
  });
});

const DONE = { kind: "done" as const, clean: false };

function markDone(number: number) {
  return useDeck
    .getState()
    .run(
      { kind: "status", number, change: DONE },
      { kind: "status", number, from: "started", to: "done", dispatched: false },
      "Mark Done",
    );
}

function markReady(number: number) {
  return { kind: "status" as const, number, from: "open" as const, to: "ready" as const, dispatched: false };
}

describe("write results", () => {
  it("resolves to true when a write succeeds and to false when tsk refuses it", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "started" })] });
    vi.mocked(api.setStatus)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce({ kind: "refused", code: "after-not-done", message: "T3 is not done" });
    await expect(markDone(1)).resolves.toBe(true);
    await expect(markDone(1)).resolves.toBe(false);
  });

  it("resolves a bulk write to true only when every task was written", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "ready" }), row({ number: 2, status: "ready" })] });
    const cmds = [1, 2].map((number) => ({ kind: "status" as const, number, change: DONE }));
    const changes = [1, 2].map((number) => ({ kind: "status" as const, number, from: "ready" as const, to: "done" as const, dispatched: false }));
    vi.mocked(api.setStatus).mockResolvedValue();
    await expect(useDeck.getState().runBulk(cmds, changes, "Mark Done")).resolves.toBe(true);
    vi.mocked(api.setStatus).mockImplementation((number) =>
      number === 2 ? Promise.reject({ kind: "refused", code: "x", message: "no" }) : Promise.resolve(),
    );
    await expect(useDeck.getState().runBulk(cmds, changes, "Mark Done")).resolves.toBe(false);
  });
});

describe("cursor after a write", () => {
  const started = (number: number) => row({ number, status: "started" });

  async function listThree(cursor: number) {
    useDeck.setState({ scope: { kind: "all" } });
    vi.mocked(api.listScope).mockResolvedValue([started(1), started(2), started(3)]);
    await useDeck.getState().refresh();
    useDeck.setState({ cursor });
  }

  it("moves to the next row after Mark Done of the cursor task", async () => {
    await listThree(2);
    vi.mocked(api.setStatus).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([started(1), started(3)]);
    await markDone(2);
    expect(useDeck.getState().cursor).toBe(3);
  });

  it("moves to the next row after Archive of the cursor task", async () => {
    await listThree(2);
    vi.mocked(api.setArchived).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([started(1), started(3)]);
    await useDeck
      .getState()
      .run({ kind: "archive", number: 2, archived: true }, { kind: "archive", number: 2, archived: true }, "Archive");
    expect(useDeck.getState().cursor).toBe(3);
  });

  it("moves to the new last row when the last row is marked done", async () => {
    await listThree(3);
    vi.mocked(api.setStatus).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([started(1), started(2)]);
    await markDone(3);
    expect(useDeck.getState().cursor).toBe(2);
  });
});

describe("settings that failed to load", () => {
  const onDisk = { ...settings, tskPath: "/home/test/bin/tsk", projectNames: { "/home/test/a": "Alpha" } };

  it("reads the settings again before a save and keeps what the file holds", async () => {
    let file: Settings = onDisk;
    vi.mocked(api.getSettings).mockRejectedValueOnce("settings file is locked").mockImplementation(async () => file);
    vi.mocked(api.saveSettings).mockImplementation(async (next) => {
      file = next;
    });
    await useDeck.getState().init();
    await useDeck.getState().saveSettings({ ...useDeck.getState().settings, openMode: "overlay" });
    expect(file).toEqual({ ...onDisk, openMode: "overlay" });
    expect(useDeck.getState().settings).toEqual(file);
  });

  it("keeps the file when the settings still cannot be read", async () => {
    let file: Settings = onDisk;
    vi.mocked(api.getSettings).mockRejectedValue("settings file is locked");
    vi.mocked(api.saveSettings).mockImplementation(async (next) => {
      file = next;
    });
    await useDeck.getState().init();
    await useDeck.getState().saveSettings({ ...useDeck.getState().settings, openMode: "overlay" });
    await useDeck.getState().renameProject("/home/test/b", "Beta");
    expect(file).toBe(onDisk);
    expect(useDeck.getState().errorTitle).toBe("Settings couldn't be saved");
    expect(useDeck.getState().error).toBe("settings file is locked");
  });

  it("renames a project without dropping the names the file holds", async () => {
    let file: Settings = onDisk;
    vi.mocked(api.getSettings).mockRejectedValueOnce("settings file is locked").mockImplementation(async () => file);
    vi.mocked(api.saveSettings).mockImplementation(async (next) => {
      file = next;
    });
    await useDeck.getState().init();
    await useDeck.getState().renameProject("/home/test/b", "Beta");
    expect(file.projectNames).toEqual({ "/home/test/a": "Alpha", "/home/test/b": "Beta" });
    expect(file.tskPath).toBe("/home/test/bin/tsk");
  });
});

describe("reading the open task", () => {
  it("reports a failed read during a refresh as that task's failure", async () => {
    useDeck.setState({ openTask: 2 });
    vi.mocked(api.getTask).mockRejectedValue({ kind: "notFound" });
    await useDeck.getState().refresh();
    const state = useDeck.getState();
    expect(state.errorTitle).toBe("T2 couldn't be opened");
    expect(state.error).toBe("tsk was not found");
    expect(state.errorTask).toBe(2);
    expect(state.tskError).toBeNull();
    expect(state.rows).toHaveLength(1);
  });

  it("clears the previous task's detail as soon as another task opens", () => {
    useDeck.setState({ openTask: 1, detail: detail({ number: 1 }) });
    vi.mocked(api.getTask).mockReturnValue(new Promise(() => {}));
    void useDeck.getState().open(2);
    expect(useDeck.getState().detail).toBeNull();
  });

  it("ties a failed open to the task", async () => {
    vi.mocked(api.getTask).mockRejectedValue({ kind: "unexpected", exit: 1, message: "T4 is unreadable" });
    await useDeck.getState().open(4);
    expect(useDeck.getState().errorTask).toBe(4);
    expect(useDeck.getState().errorTitle).toBe("T4 couldn't be opened");
  });

  it("drops a late failure for a task that is no longer open", async () => {
    let reject: (e: unknown) => void = () => {};
    vi.mocked(api.getTask)
      .mockImplementationOnce(() => new Promise((_, r) => (reject = r)))
      .mockResolvedValueOnce(detail({ number: 2 }));
    const first = useDeck.getState().open(1);
    await useDeck.getState().open(2);
    reject({ kind: "unexpected", exit: 1, message: "T1 is unreadable" });
    await first;
    expect(useDeck.getState().error).toBeNull();
    expect(useDeck.getState().detail?.number).toBe(2);
  });
});

describe("changing scope", () => {
  it("closes the open task when another scope is selected", async () => {
    useDeck.setState({ scope: { kind: "project", path: "/home/test/alpha" }, openTask: 1, detail: detail({ number: 1 }) });
    await useDeck.getState().selectScope({ kind: "project", path: "/home/test/beta" });
    const state = useDeck.getState();
    expect(state.openTask).toBeNull();
    expect(state.detail).toBeNull();
    expect(api.getTask).not.toHaveBeenCalled();
  });

  it("keeps the open task when the current scope is selected again", async () => {
    vi.mocked(api.getTask).mockResolvedValue(detail({ number: 1 }));
    useDeck.setState({ scope: { kind: "project", path: "/home/test/alpha" }, openTask: 1, detail: detail({ number: 1 }) });
    await useDeck.getState().selectScope({ kind: "project", path: "/home/test/alpha" });
    expect(useDeck.getState().openTask).toBe(1);
  });
});

describe("marks", () => {
  it("drops the mark of a task that leaves the board", async () => {
    useDeck.setState({ scope: { kind: "all" } });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "started" }), row({ number: 2, status: "started" })]);
    await useDeck.getState().refresh();
    useDeck.setState({ marks: [1, 2] });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "started" })]);
    await useDeck.getState().refresh();
    expect(useDeck.getState().marks).toEqual([1]);
  });

  it("drops the mark of a task a search filters out", () => {
    vi.mocked(api.getTask).mockRejectedValue({ kind: "unexpected", exit: 1, message: "unreadable" });
    useDeck.setState({
      rows: [row({ number: 1, title: "Alpha report" }), row({ number: 2, title: "Beta report" })],
      marks: [1, 2],
    });
    useDeck.getState().setQuery("alpha");
    expect(useDeck.getState().marks).toEqual([1]);
  });
});

describe("undo", () => {
  const entry = (number: number) => ({ label: "Mark Ready", changes: [markReady(number)] });

  it("ignores an Undo while another Undo runs", async () => {
    const releases: (() => void)[] = [];
    vi.mocked(api.setStatus).mockImplementation(() => new Promise<void>((r) => releases.push(r)));
    useDeck.setState({ undo: [entry(1), entry(2)] });
    const first = useDeck.getState().undoLast();
    const second = useDeck.getState().undoLast();
    for (const release of releases) release();
    await Promise.all([first, second]);
    expect(useDeck.getState().undo).toEqual([entry(1)]);
  });

  it("ties a failed undo to the task it could not change", async () => {
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "refused", code: "x", message: "T4 is locked" });
    useDeck.setState({ undo: [entry(4)] });
    await useDeck.getState().undoLast();
    expect(useDeck.getState().errorTask).toBe(4);
    expect(useDeck.getState().error).toBe("T4: T4 is locked");
  });

  it("keeps the part of a bulk undo that failed", async () => {
    vi.mocked(api.setStatus).mockImplementation((number) =>
      number === 1 ? Promise.reject({ kind: "refused", code: "x", message: "T1 is locked" }) : Promise.resolve(),
    );
    useDeck.setState({ undo: [{ label: "Mark Ready", changes: [markReady(1), markReady(2)] }] });
    await useDeck.getState().undoLast();
    expect(useDeck.getState().undo).toEqual([{ label: "Mark Ready", changes: [markReady(1)] }]);
    expect(useDeck.getState().errorTitle).toBe("Mark Ready couldn't be undone");
  });

  it("names a change it cannot reverse when asked to undo it", async () => {
    useDeck.setState({ irreversible: "Add Step" });
    await useDeck.getState().undoLast();
    expect(useDeck.getState().errorTitle).toBe("Undo isn't available");
    expect(useDeck.getState().error).toBe("Can't undo Add Step");
    expect(useDeck.getState().irreversible).toBeNull();
  });
});

describe("adding a step", () => {
  const outline = { id: "00000000-0000-4000-8000-00000000000a", short_id: "a", text: "Outline", done: false };
  const summary = { id: "00000000-0000-4000-8000-00000000000b", short_id: "b", text: "Write the summary", done: false };
  const op = { kind: "add" as const, text: "Write the summary", place: null };
  let steps: (typeof outline)[];

  beforeEach(() => {
    steps = [outline];
    vi.mocked(api.step).mockImplementation(async (_number, stepOp) => {
      if (stepOp.kind === "add") steps = [...steps, summary];
      if (stepOp.kind === "remove") steps = steps.filter((s) => s.short_id !== stepOp.id);
    });
    vi.mocked(api.getTask).mockImplementation(async () => detail({ number: 1, steps }));
  });

  function addStep() {
    return useDeck.getState().run({ kind: "step", number: 1, op }, { kind: "step", number: 1, op, before: {} }, "Add Step");
  }

  it("can be undone while the task is open", async () => {
    useDeck.setState({ openTask: 1, detail: detail({ number: 1, steps: [outline] }) });
    await addStep();
    expect(useDeck.getState().irreversible).toBeNull();
    await useDeck.getState().undoLast();
    expect(steps).toEqual([outline]);
    expect(useDeck.getState().detail?.steps).toEqual([outline]);
  });

  it("is reported as irreversible while the task is closed", async () => {
    await addStep();
    expect(useDeck.getState().undo).toHaveLength(0);
    expect(useDeck.getState().irreversible).toBe("Add Step");
  });
});

describe("search after a write", () => {
  it("matches an edited title by its new text", async () => {
    vi.mocked(api.editTask).mockResolvedValue();
    vi.mocked(api.getTask).mockResolvedValue(detail({ number: 1, title: "New title" }));
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1, status: "started", title: "New title" })]);
    useDeck.setState({
      scope: { kind: "all" },
      rows: [row({ number: 1, status: "started", title: "Old title" })],
      query: "new",
      searchIndex: new Map([[1, { number: 1, title: "Old title", thread: null, assignee: null, notes: null, steps: [] }]]),
    });
    await useDeck
      .getState()
      .run(
        { kind: "edit", number: 1, input: { title: "New title" } },
        { kind: "edit", number: 1, before: { title: "Old title" }, after: { title: "New title" } },
        "Edit Title",
      );
    await useDeck.getState().ensureSearchIndex();
    expect(useDeck.getState().visibleRows().map((r) => r.number)).toEqual([1]);
  });
});

describe("store failures", () => {
  it("adds that the board was re-read when tsk could not save a write", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "started" })] });
    vi.mocked(api.setStatus).mockRejectedValue({ kind: "store", message: "the store is locked" });
    await markDone(1);
    expect(useDeck.getState().error).toBe("the store is locked; the board was re-read");
  });

  it("shows tsk's message when the board could not be read", async () => {
    vi.mocked(api.listScope).mockRejectedValue({ kind: "store", message: "the store is unreadable" });
    await useDeck.getState().refresh();
    expect(useDeck.getState().error).toBe("the store is unreadable");
  });
});

describe("renaming projects back to back", () => {
  it("keeps both names", async () => {
    let file: Settings = settings;
    vi.mocked(api.saveSettings).mockImplementation(async (next) => {
      await Promise.resolve();
      file = next;
    });
    useDeck.setState({ settingsLoaded: true });
    await Promise.all([
      useDeck.getState().renameProject("/home/test/a", "Alpha"),
      useDeck.getState().renameProject("/home/test/b", "Beta"),
    ]);
    const both = { "/home/test/a": "Alpha", "/home/test/b": "Beta" };
    expect(file.projectNames).toEqual(both);
    expect(useDeck.getState().settings.projectNames).toEqual(both);
  });
});
