import { describe, expect, it } from "vitest";
import { detail, row } from "../test/fixtures";
import { applyOptimistic } from "./optimistic";

describe("applyOptimistic", () => {
  it("patches status without mutating", () => {
    const rows = [row({ number: 1, status: "ready" })];
    const out = applyOptimistic(rows, null, { kind: "status", number: 1, change: { kind: "done", clean: false } });
    expect(out.rows[0].status).toBe("done");
    expect(rows[0].status).toBe("ready");
  });

  it("maps each status change to a status", () => {
    const rows = [row({ number: 1 })];
    const status = (change: Parameters<typeof applyOptimistic>[2] extends infer C ? C : never) =>
      applyOptimistic(rows, null, change).rows[0].status;
    expect(status({ kind: "status", number: 1, change: { kind: "ready" } })).toBe("ready");
    expect(status({ kind: "status", number: 1, change: { kind: "open" } })).toBe("open");
    expect(
      status({ kind: "status", number: 1, change: { kind: "start", dispatch: false, again: false, force: false } }),
    ).toBe("started");
    expect(
      status({ kind: "status", number: 1, change: { kind: "blocked", why: null, needs: null, options: [], on: null } }),
    ).toBe("blocked");
    expect(
      status({ kind: "status", number: 1, change: { kind: "review", done: null, checks: [], next: null, on: null } }),
    ).toBe("review");
  });

  it("updates the matching detail and leaves other rows alone", () => {
    const rows = [row({ number: 1 }), row({ number: 2 })];
    const d = detail({ number: 1 });
    const out = applyOptimistic(rows, d, { kind: "status", number: 1, change: { kind: "ready" } });
    expect(out.detail?.status).toBe("ready");
    expect(out.rows[1]).toBe(rows[1]);
    expect(d.status).toBe("open");
  });

  it("keeps a detail for another task unchanged", () => {
    const d = detail({ number: 9 });
    const out = applyOptimistic([row({ number: 1 })], d, { kind: "status", number: 1, change: { kind: "ready" } });
    expect(out.detail).toBe(d);
  });

  it("applies edits to title, notes and assignee", () => {
    const rows = [row({ number: 1, assignee: "ann" })];
    const d = detail({ number: 1, assignee: "ann" });
    const out = applyOptimistic(rows, d, {
      kind: "edit",
      number: 1,
      input: { title: "New", notes: "n", assignee: "bob" },
    });
    expect(out.rows[0]).toMatchObject({ title: "New", assignee: "bob" });
    expect(out.detail).toMatchObject({ title: "New", notes: "n", assignee: "bob" });
    const cleared = applyOptimistic(rows, d, { kind: "edit", number: 1, input: { unassign: true } });
    expect(cleared.rows[0].assignee).toBeNull();
    expect(cleared.rows[0].title).toBe("Example task");
  });

  it("patches steps for toggle, rename and remove", () => {
    const steps = [
      { id: "a", short_id: "a", text: "one", done: false },
      { id: "b", short_id: "b", text: "two", done: false },
    ];
    const d = detail({ number: 1, steps });
    const rows = [row({ number: 1 })];
    const toggled = applyOptimistic(rows, d, { kind: "step", number: 1, op: { kind: "toggle", id: "a" } });
    expect(toggled.detail?.steps[0].done).toBe(true);
    const renamed = applyOptimistic(rows, d, { kind: "step", number: 1, op: { kind: "rename", id: "b", text: "x" } });
    expect(renamed.detail?.steps[1].text).toBe("x");
    const removed = applyOptimistic(rows, d, { kind: "step", number: 1, op: { kind: "remove", id: "a" } });
    expect(removed.detail?.steps.map((s) => s.id)).toEqual(["b"]);
    expect(d.steps).toEqual(steps);
  });

  it("leaves steps unchanged for add and move", () => {
    const d = detail({ number: 1, steps: [{ id: "a", short_id: "a", text: "one", done: false }] });
    const add = applyOptimistic([], d, { kind: "step", number: 1, op: { kind: "add", text: "n", place: null } });
    expect(add.detail?.steps).toEqual(d.steps);
    const move = applyOptimistic([], d, {
      kind: "step",
      number: 1,
      op: { kind: "move", id: "a", place: { kind: "last" } },
    });
    expect(move.detail?.steps).toEqual(d.steps);
  });

  it("removes an archived row", () => {
    const rows = [row({ number: 1 }), row({ number: 2 })];
    const out = applyOptimistic(rows, null, { kind: "archive", number: 1, archived: true });
    expect(out.rows.map((r) => r.number)).toEqual([2]);
    expect(rows).toHaveLength(2);
  });
});
