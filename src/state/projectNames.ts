import { useMemo } from "react";
import type { TaskRow } from "../api/types";
import type { ProjectNames } from "../board/sidebar";
import { projectNamesOf } from "../board/sidebar";
import { useDeck } from "./store";

/** The project names to show for `rows`: tsk's titles, or the names kept in settings on a tsk without titles. */
export function useProjectNames(rows: TaskRow[]): ProjectNames {
  const titles = useDeck((s) => s.tsk?.projectTitles ?? false);
  const local = useDeck((s) => s.settings.projectNames);
  return useMemo(() => projectNamesOf(rows, titles, local), [rows, titles, local]);
}
