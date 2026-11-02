import { describe, expect, it } from "vitest";
import { groupChoices, sortChoices } from "./choices";

describe("choices", () => {
  it("offers no project grouping on a project board", () => {
    expect(groupChoices({ kind: "project", path: "/p" })).toEqual(["none", "thread", "assignee"]);
  });
  it("offers everything on the all board", () => {
    expect(groupChoices({ kind: "all" })).toEqual(["none", "project", "thread", "assignee"]);
    expect(sortChoices({ kind: "all" })).toEqual(["recent", "project", "thread", "title", "assignee"]);
  });
  it("drops the fixed dimension", () => {
    expect(groupChoices({ kind: "thread", name: "t" })).toEqual(["none", "project", "assignee"]);
    expect(groupChoices({ kind: "assignee", name: "a" })).toEqual(["none", "project", "thread"]);
    expect(sortChoices({ kind: "thread", name: "t" })).toEqual(["recent", "project", "title", "assignee"]);
    expect(sortChoices({ kind: "assignee", name: "a" })).toEqual(["recent", "project", "thread", "title"]);
  });
  it("offers no project choice on the desk or a project", () => {
    expect(groupChoices({ kind: "desk" })).toEqual(["none", "thread", "assignee"]);
    expect(sortChoices({ kind: "desk" })).toEqual(["recent", "thread", "title", "assignee"]);
    expect(sortChoices({ kind: "project", path: "/p" })).toEqual(["recent", "thread", "title", "assignee"]);
  });
});
