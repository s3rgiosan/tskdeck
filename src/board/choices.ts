import type { Group, Scope, Sort } from "../api/types";

const GROUPS: Group[] = ["none", "project", "thread", "assignee"];
const SORTS: Sort[] = ["recent", "project", "thread", "title", "assignee"];

/** The label each grouping and sorting choice shows; the value passed to tsk stays the key. */
export const CHOICE_LABELS: Record<Group | Sort, string> = {
  none: "None",
  project: "Project",
  thread: "Thread",
  assignee: "Assignee",
  recent: "Most Recent",
  title: "Title",
};

/** Dimension the scope already fixes, which grouping and sorting then omit. */
function fixedDimension(scope: Scope): "project" | "thread" | "assignee" | null {
  switch (scope.kind) {
    case "project":
      return "project";
    case "thread":
      return "thread";
    case "assignee":
      return "assignee";
    default:
      return null;
  }
}

/** tsk accepts project grouping and sorting only across projects. */
function offersProject(scope: Scope): boolean {
  return scope.kind === "all" || scope.kind === "thread" || scope.kind === "assignee";
}

function allowed(scope: Scope, choice: string): boolean {
  if (choice === "project") {
    return offersProject(scope);
  }
  return choice !== fixedDimension(scope);
}

export function groupChoices(scope: Scope): Group[] {
  return GROUPS.filter((g) => allowed(scope, g));
}

export function sortChoices(scope: Scope): Sort[] {
  return SORTS.filter((s) => allowed(scope, s));
}
