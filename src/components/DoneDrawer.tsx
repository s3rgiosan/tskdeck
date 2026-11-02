import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { TaskRow, TskError } from "../api/types";
import { useDeck } from "../state/store";
import { SymbolIcon } from "./SymbolIcon";

/** What an empty group says, by its title. */
const EMPTY_NOTES: Record<string, string> = {
  Done: "Tasks you mark done show up here.",
  Archived: "Tasks you archive show up here.",
};

/** Rows with a count in a heading; `heading` renders the title, which the drawer's header can hold instead. */
function List(props: {
  title: string;
  rows: TaskRow[];
  heading?: boolean;
  onRestore?: (row: TaskRow) => void;
}) {
  const { title, rows, heading = true, onRestore } = props;
  const [cursor, setCursor] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = rows.some((r) => r.number === cursor) ? cursor : (rows[0]?.number ?? null);

  /** Moves the cursor one row and gives that row the keyboard. */
  function step(delta: number) {
    const at = rows.findIndex((r) => r.number === current);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))];
    if (!next) return;
    setCursor(next.number);
    list.current?.querySelector<HTMLElement>(`[data-number="${next.number}"]`)?.focus();
  }

  return (
    <section className="drawer-group" aria-label={title}>
      {heading && (
        <h3 className="group-title">
          {title} <span className="section-count">{rows.length}</span>
        </h3>
      )}
      {rows.length === 0 && <p className="board-note">{EMPTY_NOTES[title]}</p>}
      {rows.length > 0 && (
        <div
          ref={list}
          role="listbox"
          aria-label={`${title} tasks`}
          onKeyDown={(e) => {
            if (e.target instanceof HTMLElement && e.target.closest("button")) return;
            switch (e.key) {
              case "ArrowDown":
                e.preventDefault();
                step(1);
                break;
              case "ArrowUp":
                e.preventDefault();
                step(-1);
                break;
              default:
                break;
            }
          }}
        >
          {rows.map((r) => (
            <div
              key={r.number}
              data-number={r.number}
              role="option"
              aria-selected={r.number === current}
              tabIndex={r.number === current ? 0 : -1}
              className={`row${r.number === current ? " is-cursor" : ""}`}
              onFocus={() => setCursor(r.number)}
            >
              <span className="row-number">T{r.number}</span>
              <span className="row-title">{r.title}</span>
              {onRestore && (
                <button type="button" onClick={() => onRestore(r)}>
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Done tasks of the current scope, with archived tasks in their own group. */
export function DoneDrawer(props: { onClose: () => void }) {
  const { onClose } = props;
  const scope = useDeck((s) => s.scope);
  const run = useDeck((s) => s.run);
  const [done, setDone] = useState<TaskRow[]>([]);
  const [archived, setArchived] = useState<TaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api.listScope(scope, { shelf: "done", group: "none", sort: "recent" }),
        api.listScope(scope, { shelf: "archived", group: "none", sort: "recent" }),
      ]);
      setDone(d);
      setArchived(a);
      setError(null);
    } catch (e) {
      setError(errorMessage(e as TskError | string));
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(row: TaskRow) {
    const change = { kind: "archive" as const, number: row.number, archived: false };
    await run({ kind: "archive", number: row.number, archived: false }, change, "Restore");
    await load();
  }

  return (
    <aside className="drawer" aria-label="Done tasks">
      <header className="drawer-head">
        <h2 className="section-title">
          Done <span className="section-count">{done.length}</span>
        </h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <SymbolIcon name="xmark" />
        </button>
      </header>
      {error !== null && (
        <p role="alert" className="flow-error">
          {error}
        </p>
      )}
      <List title="Done" rows={done} heading={false} />
      <List title="Archived" rows={archived} onRestore={(r) => void restore(r)} />
    </aside>
  );
}
