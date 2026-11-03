import { useEffect, useMemo, useRef } from "react";
import { showTaskMenu } from "../api/client";
import type { TaskRow } from "../api/types";
import { buildBoard, liveNumbersOf } from "../board/sections";
import { projectLabelsOf } from "../board/sidebar";
import { STATUS_LABELS } from "../board/status";
import { isTextTarget } from "../keys/keymap";
import { boardOrder, filterRows, useDeck } from "../state/store";
import { Loading } from "./Loading";
import { SymbolIcon } from "./SymbolIcon";

interface SectionProps {
  title: string;
  rows: TaskRow[];
  cursorNumber: number | null;
  marks: number[];
  markMode: boolean;
  focused: boolean;
  groupOf: GroupOf;
  onPick: (row: TaskRow) => void;
}

export { STATUS_LABELS };

/** The id of a task's row, which the task list points at as its active descendant. */
export function rowId(number: number): string {
  return `task-${number}`;
}

/** Selects the row, then shows the task context menu for it. */
function showRowMenu(e: React.MouseEvent, number: number) {
  e.preventDefault();
  useDeck.getState().select(number);
  showTaskMenu().catch(() => null);
}

function RowView(props: {
  row: TaskRow;
  isCursor: boolean;
  isMarked: boolean;
  markMode: boolean;
  focused: boolean;
  onPick: () => void;
}) {
  const { row, isCursor, isMarked, markMode, focused, onPick } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCursor) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [isCursor]);
  const waiting = row.block ?? row.review;
  const status = STATUS_LABELS[row.status];
  return (
    <div
      ref={ref}
      id={rowId(row.number)}
      role="option"
      aria-selected={markMode ? isMarked : isCursor}
      className={`row${isCursor ? " is-cursor" : ""}${isCursor && focused ? " is-focused" : ""}${isMarked ? " is-marked" : ""}`}
      onClick={onPick}
      onContextMenu={(e) => showRowMenu(e, row.number)}
    >
      {markMode && <span className={isMarked ? "row-check is-checked" : "row-check"} aria-hidden="true" />}
      <span className="row-number">T{row.number}</span>
      <span className={`row-status status-${row.status}`} role="img" aria-label={status} title={status} />
      <span className="row-title">{row.title}</span>
      {waiting && (
        <span className="row-wait">{row.status === "review" ? STATUS_LABELS.review : STATUS_LABELS.blocked}</span>
      )}
      {row.thread && (
        <span className="row-tag" title="Thread">
          <SymbolIcon name="number-small" />
          {row.thread}
        </span>
      )}
      {row.assignee && (
        <span className="row-tag" title="Assignee">
          <SymbolIcon name="person-small" />
          {row.assignee}
        </span>
      )}
    </div>
  );
}

/** A row's group: the key that tells groups apart and the name its heading shows. */
type GroupOf = (row: TaskRow) => { key: string; name: string } | null;

/** The group tsk gives a row. */
const TSK_GROUP: GroupOf = (row) => (row.group ? { key: row.group, name: row.group } : null);

/** Consecutive rows that share a group. */
function chunksOf(rows: TaskRow[], groupOf: GroupOf): { key: string | null; group: string | null; rows: TaskRow[] }[] {
  const chunks: { key: string | null; group: string | null; rows: TaskRow[] }[] = [];
  for (const row of rows) {
    const group = groupOf(row);
    const key = group?.key ?? null;
    const last = chunks[chunks.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else chunks.push({ key, group: group?.name ?? null, rows: [row] });
  }
  return chunks;
}

/** One labelled group of rows in the task list, with the visual headings shown above its rows. */
interface RowGroup {
  label: string;
  sectionHeading: boolean;
  subTitle: string | null;
  groupTitle: string | null;
  rows: TaskRow[];
}

/**
 * The groups of a section. Each sub-group (a group name, the Inbox) is its own group labelled
 * after the section, so every row sits in exactly one group of the list.
 */
function groupsOf(title: string, rows: TaskRow[], inbox: TaskRow[], groupOf: GroupOf): RowGroup[] {
  const groups: RowGroup[] = [];
  const add = (prefix: string, list: TaskRow[], subTitle: string | null) => {
    chunksOf(list, groupOf).forEach((chunk, i) => {
      groups.push({
        label: chunk.group === null ? prefix : `${prefix} — ${chunk.group}`,
        sectionHeading: groups.length === 0,
        subTitle: i === 0 ? subTitle : null,
        groupTitle: chunk.group,
        rows: chunk.rows,
      });
    });
  };
  add(title, rows, null);
  add(`${title} — Inbox`, inbox, "Inbox");
  return groups;
}

/** `inbox` rows follow `rows` in an "Inbox" group. The headings are visual; the groups carry the names. */
function Section(props: SectionProps & { inbox?: TaskRow[] }) {
  const { title, rows, inbox = [], groupOf, cursorNumber, marks, markMode, focused, onPick } = props;
  if (rows.length + inbox.length === 0) return null;
  return (
    <div className="section" role="presentation">
      {groupsOf(title, rows, inbox, groupOf).map((group, i) => (
        <div key={i} role="group" aria-label={group.label}>
          {group.sectionHeading && (
            <h2 className="section-title" aria-hidden="true">
              {title} <span className="section-count">{rows.length + inbox.length}</span>
            </h2>
          )}
          {group.subTitle && (
            <h3 className="sub-title" aria-hidden="true">
              {group.subTitle}
            </h3>
          )}
          {group.groupTitle && (
            <h3 className="group-title" aria-hidden="true">
              {group.groupTitle}
            </h3>
          )}
          {group.rows.map((row) => (
            <RowView
              key={row.number}
              row={row}
              isCursor={row.number === cursorNumber}
              isMarked={marks.includes(row.number)}
              markMode={markMode}
              focused={focused}
              onPick={() => onPick(row)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Board(props: { onNewTask: () => void }) {
  const { onNewTask } = props;
  const allListed = useDeck((s) => s.rows);
  const query = useDeck((s) => s.query);
  const searchIndex = useDeck((s) => s.searchIndex);
  const allRows = useDeck((s) => s.allRows);
  const loaded = useDeck((s) => s.loaded);
  const cursor = useDeck((s) => s.cursor);
  const marks = useDeck((s) => s.marks);
  const markMode = useDeck((s) => s.markMode);
  const focus = useDeck((s) => s.focus);
  const modalOpen = useDeck((s) => s.modalOpen);
  const open = useDeck((s) => s.open);
  const setQuery = useDeck((s) => s.setQuery);
  const grouping = useDeck((s) => s.options.group);
  const projectNames = useDeck((s) => s.settings.projectNames);

  const rows = useMemo(() => filterRows(allListed, query, searchIndex), [allListed, query, searchIndex]);
  const board = useMemo(() => buildBoard(rows, liveNumbersOf(allRows)), [rows, allRows]);
  const order = useMemo(() => boardOrder(rows, allRows), [rows, allRows]);
  // tsk names a project group by its folder, so projects are grouped by path and headed by their label.
  const groupOf = useMemo((): GroupOf => {
    if (grouping !== "project") return TSK_GROUP;
    const labels = projectLabelsOf([...allRows, ...allListed], projectNames);
    return (row) => (row.project ? { key: row.project, name: labels.get(row.project) ?? row.project } : TSK_GROUP(row));
  }, [grouping, allRows, allListed, projectNames]);
  const list = useRef<HTMLDivElement>(null);
  function pick(row: TaskRow) {
    void open(row.number);
  }

  // When the board takes the keyboard, DOM focus moves to the task list so screen readers follow the cursor.
  // A pane divider keeps focus while it has it, so its arrow keys keep resizing.
  useEffect(() => {
    const active = document.activeElement;
    const onDivider = active instanceof HTMLElement && active.getAttribute("role") === "separator";
    if (focus !== "board" || modalOpen || !list.current || list.current.contains(active) || isTextTarget(active) || onDivider)
      return;
    list.current.focus({ preventScroll: true });
  }, [focus, modalOpen]);

  const cursorListed = cursor !== null && order.some((r) => r.number === cursor);

  const shared = { cursorNumber: cursor, marks, markMode, focused: focus === "board", groupOf, onPick: pick };

  return (
    <div className="board">
      <div className="board-scroll">
        {!loaded && <Loading />}
        {loaded && order.length === 0 &&
          (query.trim() === "" ? (
            <div className="empty-state">
              <h2>No Tasks</h2>
              <p>Tasks you capture show up here.</p>
              <button type="button" onClick={onNewTask}>
                New Task
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <h2>No Results</h2>
              <p>No tasks match “{query.trim()}”.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear Search
              </button>
            </div>
          ))}
        <div
          ref={list}
          className="board-list"
          role="listbox"
          aria-label="Tasks"
          aria-multiselectable={markMode ? true : undefined}
          tabIndex={0}
          aria-activedescendant={cursor !== null && cursorListed ? rowId(cursor) : undefined}
          onFocus={(e) => {
            if (e.target === e.currentTarget && useDeck.getState().focus !== "board") useDeck.setState({ focus: "board" });
          }}
        >
          <Section title="Needs You" rows={board.needsYou} {...shared} />
          <Section title="In Motion" rows={board.inMotion} {...shared} />
          <Section title="On Deck" rows={board.ready} inbox={board.inbox} {...shared} />
        </div>
      </div>
    </div>
  );
}
