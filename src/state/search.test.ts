import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, onBoardChanged } from "../api/client";
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
    },
    onBoardChanged: vi.fn(),
  };
});

beforeEach(() => {
  resetBoardSubscription();
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  vi.mocked(onBoardChanged).mockResolvedValue(() => {});
});

describe("search", () => {
  it("searches notes after loading details", async () => {
    const rows = [row({ number: 1, title: "Alpha" }), row({ number: 2, title: "Beta" })];
    useDeck.setState({ rows, allRows: rows });
    vi.mocked(api.getTask).mockImplementation(async (n: number) =>
      detail({ ...rows[n - 1], notes: n === 2 ? "request timeout" : "fine" }),
    );
    useDeck.getState().setQuery("timeout");
    await useDeck.getState().ensureSearchIndex();
    expect(useDeck.getState().visibleRows().map((r) => r.number)).toEqual([2]);
  });

  it("matches step text", async () => {
    const rows = [row({ number: 1 }), row({ number: 2 })];
    useDeck.setState({ rows, allRows: rows });
    vi.mocked(api.getTask).mockImplementation(async (n: number) =>
      detail({ ...rows[n - 1], steps: n === 1 ? [{ id: "a", short_id: "a", done: false, text: "Write docs" }] : [] }),
    );
    useDeck.getState().setQuery("docs");
    await useDeck.getState().ensureSearchIndex();
    expect(useDeck.getState().visibleRows().map((r) => r.number)).toEqual([1]);
  });

  it("fetches at most four details at a time and skips indexed rows", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ number: i + 1 }));
    useDeck.setState({ rows, allRows: rows });
    let inFlight = 0;
    let peak = 0;
    vi.mocked(api.getTask).mockImplementation(async (n: number) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return detail({ ...rows[n - 1] });
    });
    await useDeck.getState().ensureSearchIndex();
    expect(peak).toBe(4);
    expect(api.getTask).toHaveBeenCalledTimes(10);
    await useDeck.getState().ensureSearchIndex();
    expect(api.getTask).toHaveBeenCalledTimes(10);
  });

  it("clears the index on board-changed", async () => {
    let callback: () => void = () => {};
    vi.mocked(onBoardChanged).mockImplementation(async (cb) => {
      callback = cb;
      return () => {};
    });
    vi.mocked(api.tskInfo).mockResolvedValue({ path: "/bin/tsk", version: "0.13.0", supported: true, minimum: "0.13.0" });
    vi.mocked(api.getSettings).mockResolvedValue({ openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {} });
    vi.mocked(api.listScope).mockResolvedValue([row({ number: 1 })]);
    await useDeck.getState().init();
    useDeck.setState({ searchIndex: new Map([[1, { number: 1, title: "x", thread: null, assignee: null }]]) });
    callback();
    expect(useDeck.getState().searchIndex.size).toBe(0);
  });
});

describe("undo", () => {
  const done = (n: number) => ({
    cmd: { kind: "status" as const, number: n, change: { kind: "done" as const, clean: false } },
    change: { kind: "status" as const, number: n, from: "started" as const, to: "done" as const, dispatched: false },
  });

  it("undoes a bulk done as one entry", async () => {
    useDeck.setState({
      rows: [row({ number: 1, status: "started" }), row({ number: 2, status: "started" })],
    });
    vi.mocked(api.setStatus).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([]);
    await useDeck.getState().runBulk([done(1).cmd, done(2).cmd], [done(1).change, done(2).change], "Done");
    expect(useDeck.getState().undo).toHaveLength(1);
    vi.mocked(api.setStatus).mockClear();
    await useDeck.getState().undoLast();
    const start = { kind: "start", dispatch: false, again: false, force: true };
    expect(vi.mocked(api.setStatus).mock.calls).toEqual([
      [2, start],
      [1, start],
    ]);
    expect(useDeck.getState().undo).toHaveLength(0);
  });

  it("lists bulk failures by task number", async () => {
    useDeck.setState({ rows: [row({ number: 4, status: "started" }), row({ number: 7, status: "started" })] });
    vi.mocked(api.setStatus).mockImplementation(async (n: number) => {
      if (n === 7) throw { kind: "refused", code: "x", message: "T3 is not done" };
    });
    vi.mocked(api.listScope).mockResolvedValue([]);
    await useDeck.getState().runBulk([done(4).cmd, done(7).cmd], [done(4).change, done(7).change], "Done");
    expect(useDeck.getState().error).toBe("T7: T3 is not done");
    expect(useDeck.getState().undo[0].changes).toHaveLength(1);
  });

  it("never pushes an entry with a null inverse and says so on undo", async () => {
    useDeck.setState({ rows: [row({ number: 1, status: "ready" })] });
    vi.mocked(api.setStatus).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([]);
    await useDeck
      .getState()
      .run(
        { kind: "status", number: 1, change: { kind: "start", dispatch: true, again: false, force: false } },
        { kind: "status", number: 1, from: "ready", to: "started", dispatched: true },
        "Start",
      );
    expect(useDeck.getState().undo).toHaveLength(0);
    await useDeck.getState().undoLast();
    expect(useDeck.getState().error).toBe("Can't undo Start");
  });

  it("makes a step add undoable once the new step shows in the refreshed detail", async () => {
    const before = detail({ number: 1, steps: [{ id: "i1", short_id: "s1", done: false, text: "One" }] });
    const after = detail({
      number: 1,
      steps: [...before.steps, { id: "i2", short_id: "s2", done: false, text: "Two" }],
    });
    useDeck.setState({ rows: [before], allRows: [before], openTask: 1, detail: before });
    vi.mocked(api.step).mockResolvedValue();
    vi.mocked(api.listScope).mockResolvedValue([after]);
    vi.mocked(api.getTask).mockResolvedValue(after);
    const op = { kind: "add" as const, text: "Two", place: null };
    await useDeck.getState().run({ kind: "step", number: 1, op }, { kind: "step", number: 1, op, before: {} }, "Add step");
    expect(useDeck.getState().undo).toHaveLength(1);
    vi.mocked(api.step).mockClear();
    await useDeck.getState().undoLast();
    expect(api.step).toHaveBeenCalledWith(1, { kind: "remove", id: "s2" });
  });
});

describe("undo robustness", () => {
  it("records a step add from a direct fetch when a board refresh has superseded the detail", async () => {
    const before = detail({ number: 1, steps: [{ id: "i1", short_id: "s1", done: false, text: "One" }] });
    const after = detail({ number: 1, steps: [...before.steps, { id: "i2", short_id: "s2", done: false, text: "Two" }] });
    useDeck.setState({ rows: [before], allRows: [before], openTask: 1, detail: before });
    // The pane closes while the write runs, so the refresh delivers no detail.
    vi.mocked(api.step).mockImplementation(async () => {
      useDeck.setState({ openTask: null, detail: null });
    });
    vi.mocked(api.listScope).mockResolvedValue([before]);
    vi.mocked(api.getTask).mockResolvedValue(after);
    const op = { kind: "add" as const, text: "Two", place: null };
    await useDeck.getState().run({ kind: "step", number: 1, op }, { kind: "step", number: 1, op, before: {} }, "Add step");
    expect(useDeck.getState().undo).toHaveLength(1);
  });

  it("keeps the unrun changes as an entry when an inverse fails", async () => {
    const done = (n: number) => ({
      kind: "status" as const,
      number: n,
      from: "started" as const,
      to: "done" as const,
      dispatched: false,
    });
    useDeck.setState({ undo: [{ label: "Done", changes: [done(1), done(2), done(3)] }] });
    vi.mocked(api.listScope).mockResolvedValue([]);
    vi.mocked(api.setStatus).mockImplementation(async (n: number) => {
      if (n === 2) throw { kind: "refused", code: "x", message: "nope" };
    });
    await useDeck.getState().undoLast();
    const { undo, error } = useDeck.getState();
    expect(undo).toHaveLength(1);
    expect(undo[0].changes.map((c) => c.number)).toEqual([1, 2]);
    expect(error).toBe("T2: nope");
  });
});

describe("capture", () => {
  it("gives the new task the cursor", async () => {
    const rows = [row({ number: 1, status: "ready" }), row({ number: 9, status: "ready", title: "New" })];
    vi.mocked(api.capture).mockResolvedValue(9);
    vi.mocked(api.listScope).mockResolvedValue(rows);
    await useDeck.getState().capture({ title: "New" });
    const { cursor } = useDeck.getState();
    expect(cursor).toBe(9);
  });
});

describe("marks", () => {
  it("clears marks and mark mode when the view changes", async () => {
    useDeck.setState({ marks: [1, 2], markMode: true });
    vi.mocked(api.listScope).mockResolvedValue([]);
    await useDeck.getState().selectScope({ kind: "all" });
    expect(useDeck.getState().marks).toEqual([]);
    expect(useDeck.getState().markMode).toBe(false);
  });
});
