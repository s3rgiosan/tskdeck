import { describe, expect, it } from "vitest";
import { row } from "../test/fixtures";
import { onDesk, projectLabelsOf, scopeTitle, sidebarModel, sortByProject } from "./sidebar";

describe("sidebarModel", () => {
  it("disambiguates colliding basenames", () => {
    const m = sidebarModel([row({ project: "/home/test/work/site" }), row({ project: "/home/test/client/site" })]);
    expect(m.projects.map((p) => p.label)).toEqual(["client/site", "work/site"]);
    expect(m.projects[0].scope).toEqual({ kind: "project", path: "/home/test/client/site" });
  });
  it("widens colliding labels until every label is unique", () => {
    const m = sidebarModel([
      row({ project: "/home/test/a/x/app" }),
      row({ project: "/home/test/b/x/app" }),
      row({ project: "/home/test/c/y/app" }),
      row({ project: "/home/test/tool" }),
    ]);
    expect(m.projects.map((p) => p.label)).toEqual(["a/x/app", "b/x/app", "tool", "y/app"]);
  });
  it("counts the desk like the terminal desk", () => {
    const m = sidebarModel([
      row({ project: "/p", status: "started" }),
      row({ project: "/p", status: "ready" }),
      row({ project: null, status: "open" }),
    ]);
    expect(m.desk.count).toBe(2);
    expect(m.all.count).toBe(3);
  });
  it("labels the cross-project view All Projects", () => {
    expect(sidebarModel([]).all.label).toBe("All Projects");
  });
  it("sorts projects by label and counts rows", () => {
    const m = sidebarModel([row({ project: "/x/beta" }), row({ project: "/x/alpha" }), row({ project: "/x/beta" })]);
    expect(m.projects.map((p) => [p.label, p.count])).toEqual([["alpha", 1], ["beta", 2]]);
  });
  it("labels a named project with its name", () => {
    const m = sidebarModel([row({ project: "/home/test/work/site" }), row({ project: "/home/test/client/site" })], {
      "/home/test/work/site": "Work Site",
    });
    expect(m.projects.map((p) => p.label)).toEqual(["site", "Work Site"]);
    expect(m.projects[1].scope).toEqual({ kind: "project", path: "/home/test/work/site" });
  });
  it("labels a project with a blank name by its folder", () => {
    const m = sidebarModel([row({ project: "/home/test/site" })], { "/home/test/site": "  " });
    expect(m.projects.map((p) => p.label)).toEqual(["site"]);
  });
  it("builds sorted thread and assignee items, skipping empty ones", () => {
    const m = sidebarModel([
      row({ thread: "zeta", assignee: "bob" }),
      row({ thread: "alpha", assignee: "amy" }),
      row({ thread: "alpha" }),
    ]);
    expect(m.threads.map((t) => [t.label, t.count])).toEqual([["alpha", 2], ["zeta", 1]]);
    expect(m.threads[0].scope).toEqual({ kind: "thread", name: "alpha" });
    expect(m.assignees.map((a) => a.label)).toEqual(["amy", "bob"]);
    expect(m.assignees[0].scope).toEqual({ kind: "assignee", name: "amy" });
  });
});

describe("scopeTitle", () => {
  const model = sidebarModel([row({ project: "/home/test/work/site" }), row({ project: "/home/test/client/site" })]);

  it("names the views", () => {
    expect(scopeTitle({ kind: "desk" }, model)).toBe("Desk");
    expect(scopeTitle({ kind: "all" }, model)).toBe("All Projects");
  });

  it("names a project as the sidebar does", () => {
    expect(scopeTitle({ kind: "project", path: "/home/test/work/site" }, model)).toBe("work/site");
  });

  it("names a project with no rows by its folder", () => {
    expect(scopeTitle({ kind: "project", path: "/home/test/empty" }, model)).toBe("empty");
  });

  it("names a named project with no rows by its name", () => {
    expect(scopeTitle({ kind: "project", path: "/home/test/empty" }, model, { "/home/test/empty": "Archive" })).toBe(
      "Archive",
    );
  });

  it("names threads and assignees", () => {
    expect(scopeTitle({ kind: "thread", name: "launch" }, model)).toBe("launch");
    expect(scopeTitle({ kind: "assignee", name: "ana" }, model)).toBe("ana");
  });
});

describe("projectLabelsOf", () => {
  it("maps each project path to its sidebar label", () => {
    const labels = projectLabelsOf(
      [row({ project: "/home/test/a/wp-content" }), row({ project: "/home/test/b/wp-content" }), row({ project: null })],
      { "/home/test/a/wp-content": "Alpha" },
    );
    expect(labels).toEqual(
      new Map([
        ["/home/test/a/wp-content", "Alpha"],
        ["/home/test/b/wp-content", "wp-content"],
      ]),
    );
  });
});

describe("sortByProject", () => {
  it("keeps projects that share a label apart", () => {
    const rows = [
      row({ number: 1, project: "/home/test/a" }),
      row({ number: 2, project: "/home/test/b" }),
      row({ number: 3, project: "/home/test/a" }),
    ];
    const labels = new Map([
      ["/home/test/a", "Site"],
      ["/home/test/b", "Site"],
    ]);
    expect(sortByProject(rows, labels).map((r) => r.number)).toEqual([1, 3, 2]);
  });
});

describe("onDesk", () => {
  it("keeps a desk task with an unknown status on the desk, like an open one", () => {
    expect(onDesk(row({ status: "unknown", project: null }))).toBe(true);
    expect(onDesk(row({ status: "unknown", project: "/home/test/alpha" }))).toBe(false);
  });
});
