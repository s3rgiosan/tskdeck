import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search";

const d = { number: 12, title: "Fix login", thread: "auth", assignee: "claude", notes: "timeout", steps: ["add test"] };

describe("matchesQuery", () => {
  it("matches every word anywhere", () => {
    expect(matchesQuery(d, "login @claude")).toBe(true);
    expect(matchesQuery(d, "T12 timeout")).toBe(true);
    expect(matchesQuery(d, "login billing")).toBe(false);
  });
  it("matches case-insensitively, by number, thread, assignee and steps", () => {
    expect(matchesQuery(d, "LOGIN")).toBe(true);
    expect(matchesQuery(d, "12")).toBe(true);
    expect(matchesQuery(d, "t13")).toBe(false);
    expect(matchesQuery(d, "auth")).toBe(true);
    expect(matchesQuery(d, "claude")).toBe(true);
    expect(matchesQuery(d, "add")).toBe(true);
  });
  it("matches everything for an empty query", () => {
    expect(matchesQuery(d, "   ")).toBe(true);
  });
  it("tolerates missing optional fields", () => {
    expect(matchesQuery({ number: 1, title: "Solo", thread: null, assignee: null }, "solo")).toBe(true);
    expect(matchesQuery({ number: 1, title: "Solo", thread: null, assignee: null }, "@x")).toBe(false);
  });
});
