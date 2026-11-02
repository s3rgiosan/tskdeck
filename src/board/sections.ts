import type { TaskRow } from "../api/types";

export type SectionId = "needsYou" | "inMotion" | "onDeck" | "done";

export interface BoardModel {
  needsYou: TaskRow[];
  inMotion: TaskRow[];
  ready: TaskRow[];
  inbox: TaskRow[];
}

export function sectionOf(row: TaskRow, liveNumbers: ReadonlySet<number>): SectionId {
  switch (row.status) {
    case "blocked":
    case "review":
      return waitSection((row.block ?? row.review)?.on, liveNumbers);
    case "started":
      return "inMotion";
    case "ready":
    case "open":
      return "onDeck";
    case "done":
      return "done";
    default:
      return "onDeck";
  }
}

export function buildBoard(rows: TaskRow[], liveNumbers: ReadonlySet<number>): BoardModel {
  const board: BoardModel = { needsYou: [], inMotion: [], ready: [], inbox: [] };
  for (const row of rows) {
    const section = sectionOf(row, liveNumbers);
    switch (section) {
      case "needsYou":
        board.needsYou.push(row);
        break;
      case "inMotion":
        board.inMotion.push(row);
        break;
      case "onDeck":
        if (row.status === "open") {
          board.inbox.push(row);
        } else {
          board.ready.push(row);
        }
        break;
      default:
        break;
    }
  }
  return board;
}

/** Numbers of every non-done row in the `--all` live listing. */
export function liveNumbersOf(allRows: TaskRow[]): Set<number> {
  return new Set(allRows.filter((r) => r.status !== "done").map((r) => r.number));
}

function waitSection(on: string | undefined, liveNumbers: ReadonlySet<number>): SectionId {
  if (on === undefined || on === "you") {
    return "needsYou";
  }
  const match = /^task:(\d+)$/.exec(on);
  if (match) {
    return liveNumbers.has(Number(match[1])) ? "inMotion" : "needsYou";
  }
  return "inMotion";
}
