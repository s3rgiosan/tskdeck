import { describe, expect, it } from "vitest";
import { blockOn, reviewOn, row } from "../test/fixtures";
import { buildBoard, liveNumbersOf, sectionOf } from "./sections";

describe("sectionOf", () => {
  it("places a block waiting on a live task in motion", () => {
    expect(sectionOf(row({ status: "blocked", block: blockOn("task:7") }), new Set([7]))).toBe("inMotion");
  });
  it("places a block waiting on a finished task in needs you", () => {
    expect(sectionOf(row({ status: "blocked", block: blockOn("task:7") }), new Set())).toBe("needsYou");
  });
  it("treats a review with no record as needing you", () => {
    expect(sectionOf(row({ status: "review" }), new Set())).toBe("needsYou");
  });
  it("treats a block waiting on you as needing you", () => {
    expect(sectionOf(row({ status: "blocked", block: blockOn("you") }), new Set())).toBe("needsYou");
  });
  it("puts agent waits in motion", () => {
    expect(sectionOf(row({ status: "review", review: reviewOn("agent:builder") }), new Set())).toBe("inMotion");
    expect(sectionOf(row({ status: "blocked", block: blockOn("other:vendor") }), new Set())).toBe("inMotion");
    expect(sectionOf(row({ status: "review", review: reviewOn("builder") }), new Set())).toBe("inMotion");
  });
  it("maps the remaining statuses", () => {
    expect(sectionOf(row({ status: "started" }), new Set())).toBe("inMotion");
    expect(sectionOf(row({ status: "ready" }), new Set())).toBe("onDeck");
    expect(sectionOf(row({ status: "open" }), new Set())).toBe("onDeck");
    expect(sectionOf(row({ status: "done" }), new Set())).toBe("done");
  });
});

describe("buildBoard", () => {
  it("splits ready from the inbox", () => {
    const b = buildBoard([row({ number: 1, status: "open" }), row({ number: 2, status: "ready" })], new Set());
    expect(b.ready.map((r) => r.number)).toEqual([2]);
    expect(b.inbox.map((r) => r.number)).toEqual([1]);
  });
  it("keeps row order inside each section and drops done rows", () => {
    const b = buildBoard(
      [
        row({ number: 3, status: "started" }),
        row({ number: 1, status: "review" }),
        row({ number: 2, status: "started" }),
        row({ number: 4, status: "done" }),
      ],
      new Set(),
    );
    expect(b.inMotion.map((r) => r.number)).toEqual([3, 2]);
    expect(b.needsYou.map((r) => r.number)).toEqual([1]);
  });
});

describe("liveNumbersOf", () => {
  it("collects every non-done number", () => {
    const s = liveNumbersOf([row({ number: 1, status: "done" }), row({ number: 2, status: "open" })]);
    expect([...s]).toEqual([2]);
  });
});
