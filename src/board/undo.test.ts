import { describe, expect, it } from "vitest";
import { inverseOf } from "./undo";

describe("inverseOf", () => {
  it("cannot undo a dispatched start", () => {
    expect(inverseOf({ kind: "status", number: 1, from: "ready", to: "started", dispatched: true })).toBeNull();
  });

  it("undoes a done back to started without dispatch", () => {
    expect(inverseOf({ kind: "status", number: 1, from: "started", to: "done", dispatched: false })).toEqual({
      kind: "status",
      number: 1,
      change: { kind: "start", dispatch: false, again: false, force: true },
    });
  });

  it("cannot undo leaving a block", () => {
    expect(inverseOf({ kind: "status", number: 1, from: "blocked", to: "ready", dispatched: false })).toBeNull();
  });

  it("cannot undo leaving a review", () => {
    expect(inverseOf({ kind: "status", number: 1, from: "review", to: "done", dispatched: false })).toBeNull();
  });

  it("maps plain statuses back", () => {
    const back = (from: "open" | "ready" | "done") =>
      inverseOf({ kind: "status", number: 2, from, to: "started", dispatched: false });
    expect(back("open")).toEqual({ kind: "status", number: 2, change: { kind: "open" } });
    expect(back("ready")).toEqual({ kind: "status", number: 2, change: { kind: "ready" } });
    expect(back("done")).toEqual({ kind: "status", number: 2, change: { kind: "done", clean: false } });
  });

  it("replays the before input for an edit", () => {
    expect(
      inverseOf({ kind: "edit", number: 3, before: { title: "Old", unassign: true }, after: { title: "New" } }),
    ).toEqual({ kind: "edit", number: 3, input: { title: "Old", unassign: true } });
  });

  it("undoes a step add by removing the new id", () => {
    const op = { kind: "add" as const, text: "x", place: null };
    expect(inverseOf({ kind: "step", number: 1, op, before: { newId: "ab" } })).toEqual({
      kind: "step",
      number: 1,
      op: { kind: "remove", id: "ab" },
    });
    expect(inverseOf({ kind: "step", number: 1, op, before: {} })).toBeNull();
  });

  it("undoes a step removal by re-adding at its place", () => {
    expect(
      inverseOf({
        kind: "step",
        number: 1,
        op: { kind: "remove", id: "cd" },
        before: { text: "x", place: { kind: "after", id: "ab" } },
      }),
    ).toEqual({
      kind: "step",
      number: 1,
      op: { kind: "add", text: "x", place: { kind: "after", id: "ab" } },
    });
  });

  it("inverts toggle, rename and move", () => {
    expect(inverseOf({ kind: "step", number: 1, op: { kind: "toggle", id: "ab" }, before: {} })).toEqual({
      kind: "step",
      number: 1,
      op: { kind: "toggle", id: "ab" },
    });
    expect(
      inverseOf({ kind: "step", number: 1, op: { kind: "rename", id: "ab", text: "new" }, before: { text: "old" } }),
    ).toEqual({ kind: "step", number: 1, op: { kind: "rename", id: "ab", text: "old" } });
    expect(
      inverseOf({
        kind: "step",
        number: 1,
        op: { kind: "move", id: "ab", place: { kind: "last" } },
        before: { place: { kind: "first" } },
      }),
    ).toEqual({ kind: "step", number: 1, op: { kind: "move", id: "ab", place: { kind: "first" } } });
  });

  it("returns null when a step inverse lacks its before data", () => {
    expect(inverseOf({ kind: "step", number: 1, op: { kind: "remove", id: "ab" }, before: {} })).toBeNull();
    expect(inverseOf({ kind: "step", number: 1, op: { kind: "rename", id: "ab", text: "n" }, before: {} })).toBeNull();
    expect(
      inverseOf({ kind: "step", number: 1, op: { kind: "move", id: "ab", place: { kind: "last" } }, before: {} }),
    ).toBeNull();
  });

  it("flips archive and ignores capture and reply", () => {
    expect(inverseOf({ kind: "archive", number: 4, archived: true })).toEqual({
      kind: "archive",
      number: 4,
      archived: false,
    });
    expect(inverseOf({ kind: "capture", number: 5 })).toBeNull();
    expect(inverseOf({ kind: "reply", number: 5 })).toBeNull();
  });
});
