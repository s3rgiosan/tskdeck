import type { Scope, TaskRow } from "../api/types";

export interface SidebarItem {
  key: string;
  label: string;
  scope: Scope;
  count: number;
}

export interface SidebarModel {
  desk: SidebarItem;
  all: SidebarItem;
  projects: SidebarItem[];
  threads: SidebarItem[];
  assignees: SidebarItem[];
}

/** Names given to projects in tskdeck, keyed by the project's full path. */
export type ProjectNames = Record<string, string>;

export function sidebarModel(allRows: TaskRow[], names: ProjectNames = {}): SidebarModel {
  const deskCount = allRows.filter(onDesk).length;
  return {
    desk: { key: "desk", label: "Desk", scope: { kind: "desk" }, count: deskCount },
    all: { key: "all", label: "All Projects", scope: { kind: "all" }, count: allRows.length },
    projects: projectItems(allRows, names),
    threads: tally(allRows.map((r) => r.thread)).map(([name, count]) => ({
      key: `thread:${name}`,
      label: name,
      scope: { kind: "thread", name },
      count,
    })),
    assignees: tally(allRows.map((r) => r.assignee)).map(([name, count]) => ({
      key: `assignee:${name}`,
      label: name,
      scope: { kind: "assignee", name },
      count,
    })),
  };
}

/** The name the sidebar gives a scope; a project with no rows left is named by its given name or its folder. */
export function scopeTitle(scope: Scope, model: SidebarModel, names: ProjectNames = {}): string {
  switch (scope.kind) {
    case "desk":
      return model.desk.label;
    case "all":
      return model.all.label;
    case "project": {
      const item = model.projects.find((p) => p.key === `project:${scope.path}`);
      return item?.label ?? givenName(names, scope.path) ?? segments(scope.path).pop() ?? scope.path;
    }
    default:
      return scope.name;
  }
}

/**
 * The terminal desk rule: blocked, review and started tasks from every project, plus desk tasks
 * that are ready or open. A task with an unknown status counts as open.
 */
export function onDesk(row: TaskRow): boolean {
  switch (row.status) {
    case "blocked":
    case "review":
    case "started":
      return true;
    case "ready":
    case "open":
    case "unknown":
      return row.project === null;
    default:
      return false;
  }
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter((s) => s !== "");
}

/**
 * Each project's label, keyed by its path: the name given to it, or else its folder name, widened
 * until it differs from the other unnamed projects' labels.
 */
export function projectLabelsOf(rows: TaskRow[], names: ProjectNames = {}): Map<string, string> {
  const paths = [...new Set(rows.map((r) => r.project).filter((p): p is string => p !== null && p !== ""))];
  const unnamed = projectLabels(paths.filter((path) => givenName(names, path) === null));
  return new Map(paths.map((path) => [path, givenName(names, path) ?? unnamed.get(path) ?? path]));
}

/** Rows sorted A-Z by project label, desk rows last. Rows of one project stay together, in their order. */
export function sortByProject(rows: TaskRow[], labels: Map<string, string>): TaskRow[] {
  return [...rows].sort((a, b) => {
    if (a.project === b.project) return 0;
    if (a.project === null) return 1;
    if (b.project === null) return -1;
    const byLabel = (labels.get(a.project) ?? a.project).localeCompare(labels.get(b.project) ?? b.project);
    return byLabel !== 0 ? byLabel : a.project.localeCompare(b.project);
  });
}

/** The trimmed name given to a project, or null when it has none. */
function givenName(names: ProjectNames, path: string): string | null {
  const name = names[path]?.trim() ?? "";
  return name === "" ? null : name;
}

function projectItems(rows: TaskRow[], names: ProjectNames): SidebarItem[] {
  const counts = tally(rows.map((r) => r.project));
  const labels = projectLabelsOf(rows, names);
  const items = counts.map(
    ([path, count]): SidebarItem => ({
      key: `project:${path}`,
      label: labels.get(path) ?? path,
      scope: { kind: "project", path },
      count,
    }),
  );
  return items.sort(byLabel);
}

/** Basenames, with colliding labels widened one parent folder at a time until every label is unique. */
function projectLabels(paths: string[]): Map<string, string> {
  const parts = new Map(paths.map((path) => [path, segments(path)]));
  const depth = new Map(paths.map((path) => [path, 1]));
  const labelOf = (path: string): string => {
    const own = parts.get(path) ?? [];
    return own.length === 0 ? path : own.slice(-(depth.get(path) ?? 1)).join("/");
  };
  let widened = true;
  while (widened) {
    widened = false;
    const groups = new Map<string, string[]>();
    for (const path of paths) {
      const label = labelOf(path);
      groups.set(label, [...(groups.get(label) ?? []), path]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const path of group) {
        const current = depth.get(path) ?? 1;
        if (current < (parts.get(path) ?? []).length) {
          depth.set(path, current + 1);
          widened = true;
        }
      }
    }
  }
  return new Map(paths.map((path) => [path, labelOf(path)]));
}

/** Counts non-null values, sorted A-Z by value. */
function tally(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

function byLabel(a: SidebarItem, b: SidebarItem): number {
  return a.label.localeCompare(b.label);
}
