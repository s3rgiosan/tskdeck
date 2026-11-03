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
  const [active, setActive] = useState(false);
  const list = useRef<HTMLUListElement>(null);
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
        <ul
          ref={list}
          className="drawer-rows"
          aria-label={`${title} tasks`}
          onFocus={() => setActive(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false);
          }}
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
            <li
              key={r.number}
              data-number={r.number}
              tabIndex={r.number === current ? 0 : -1}
              className={`row${active && r.number === current ? " is-cursor" : ""}`}
              onFocus={() => setCursor(r.number)}
            >
              <span className="row-number">T{r.number}</span>
              <span className="row-title">{r.title}</span>
              {onRestore && (
                <button type="button" onClick={() => onRestore(r)}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
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

  // Counts the requests so only the newest listing is applied; unmounting retires the last one.
  const latest = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    latest.current += 1;
    const request = latest.current;
    try {
      const [d, a] = await Promise.all([
        api.listScope(scope, { shelf: "done", group: "none", sort: "recent" }),
        api.listScope(scope, { shelf: "archived", group: "none", sort: "recent" }),
      ]);
      if (!mounted.current || request !== latest.current) return;
      setDone(d);
      setArchived(a);
      setError(null);
    } catch (e) {
      if (!mounted.current || request !== latest.current) return;
      setError(errorMessage(e as TskError | string));
    }
  }, [scope]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const requests = latest;
    const alive = mounted;
    return () => {
      alive.current = false;
      requests.current += 1;
    };
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
