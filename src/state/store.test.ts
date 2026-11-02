import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, onBoardChanged } from "../api/client";
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

const settings = { openMode: "beside" as const, keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {} };

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
    const next = { openMode: "overlay" as const, keymap: { undo: ["x"] }, tskPath: null, sidebarHidden: true, projectNames: {} };
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
