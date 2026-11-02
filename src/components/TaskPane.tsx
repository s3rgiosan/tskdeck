import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { EditInput, Place, Status, StatusChange, Step, StepOp, TaskDetail } from "../api/types";
import type { FlowResult } from "../board/flows";
import { answerBlock, retryStatus, sendBack } from "../board/flows";
import { projectLabelsOf } from "../board/sidebar";
import type { Change } from "../board/undo";
import { inputToOn, onToInput } from "../board/waits";
import type { Keymap } from "../keys/keymap";
import { isTextTarget, resolveKeymap } from "../keys/keymap";
import type { Handler, Handlers } from "../keys/useKeymap";
import { useKeymap } from "../keys/useKeymap";
import { useDeck } from "../state/store";
import { dateOf, formatWhen } from "../when";
import { BlockCard } from "./BlockCard";
import { STATUS_LABELS } from "./Board";
import { Loading } from "./Loading";
import { ReviewCard } from "./ReviewCard";
import { ThreadView } from "./ThreadView";
import { SymbolIcon } from "./SymbolIcon";
import { PopUp } from "./PopUp";
import { PULL_DOWN_SEPARATOR, PullDown, usePullDownChoice } from "./PullDown";
import { activitySentence } from "../board/activity";

const START: StatusChange = { kind: "start", dispatch: true, again: false, force: false };
const START_QUIET: StatusChange = { kind: "start", dispatch: false, again: false, force: false };

function statusAfter(change: StatusChange): Status {
  return change.kind === "start" ? "started" : change.kind;
}

/** The `--on` value that restores a stored `block.on`/`review.on`. */
function onArg(stored: string | null): string | null {
  if (stored === null) return null;
  const { kind, value } = onToInput(stored);
  return inputToOn(kind, value);
}

/** Text that turns into an input on click and saves on Enter or blur; Escape cancels. */
function InlineText(props: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  editing?: boolean;
  onEditing?: (editing: boolean) => void;
  className?: string;
  onSave: (value: string) => void;
}) {
  const [local, setLocal] = useState(false);
  const editing = props.editing ?? local;
  const settled = useRef(false);

  useEffect(() => {
    if (editing) settled.current = false;
  }, [editing]);

  function setEditing(next: boolean) {
    settled.current = !next;
    setLocal(next);
    props.onEditing?.(next);
  }

  function commit(value: string) {
    if (settled.current) return;
    settled.current = true;
    setLocal(false);
    props.onEditing?.(false);
    if (value !== props.value) props.onSave(value);
  }

  if (!editing) {
    return (
      <div
        className={`inline ${props.className ?? ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${props.label.toLowerCase()}: ${props.value}`}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          setEditing(true);
        }}
      >
        {props.value === "" ? <span className="muted">{props.placeholder}</span> : props.value}
      </div>
    );
  }
  const common = {
    "aria-label": props.label,
    className: props.className,
    autoFocus: true,
    defaultValue: props.value,
    onBlur: (e: { currentTarget: { value: string } }) => commit(e.currentTarget.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        settled.current = true;
        setLocal(false);
        props.onEditing?.(false);
      } else if (e.key === "Enter" && (!props.multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit(e.currentTarget.value);
      }
    },
  };
  return props.multiline ? <textarea rows={5} {...common} /> : <input {...common} />;
}

function stepPlace(steps: Step[], index: number): Place {
  return index === 0 ? { kind: "first" } : { kind: "after", id: steps[index - 1].short_id };
}

function Steps(props: { task: TaskDetail; keymap: Keymap }) {
  const { task, keymap } = props;
  const run = useDeck((s) => s.run);
  const modalOpen = useDeck((s) => s.modalOpen);
  const [dragging, setDragging] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const newStep = useRef<HTMLInputElement>(null);
  const steps = task.steps;

  function send(op: StepOp, before: Extract<Change, { kind: "step" }>["before"], label: string) {
    return run({ kind: "step", number: task.number, op }, { kind: "step", number: task.number, op, before }, label);
  }

  function rowOf(id: string): HTMLElement | null {
    return list.current?.querySelector<HTMLElement>(`[data-step-id="${CSS.escape(id)}"]`) ?? null;
  }

  /** Index of the step row that has keyboard focus, or -1. */
  function focusedIndex(): number {
    const id = (document.activeElement as HTMLElement | null)?.dataset?.stepId;
    return id === undefined ? -1 : steps.findIndex((s) => s.short_id === id);
  }

  /** Moves the focused step one place up or down and keeps it focused. */
  function moveFocused(delta: -1 | 1): boolean {
    const from = focusedIndex();
    const neighbour = steps[from + delta];
    if (from === -1 || neighbour === undefined) return false;
    const id = steps[from].short_id;
    const place: Place = delta < 0 ? { kind: "before", id: neighbour.short_id } : { kind: "after", id: neighbour.short_id };
    void send({ kind: "move", id, place }, { place: stepPlace(steps, from) }, "Move Step").then(() => rowOf(id)?.focus());
    return true;
  }

  /** Focuses the new step field. A focused text field keeps the key for its own use. */
  function focusNewStep(): boolean {
    if (useDeck.getState().focus !== "task" || isTextTarget(document.activeElement)) return false;
    newStep.current?.focus();
    return true;
  }

  useKeymap(
    keymap,
    modalOpen
      ? {}
      : { "step.add": focusNewStep, "step.moveUp": () => moveFocused(-1), "step.moveDown": () => moveFocused(1) },
    "task",
  );

  function dropOn(target: string | "end") {
    const from = steps.findIndex((s) => s.short_id === dragging);
    setDragging(null);
    if (from === -1 || target === dragging) return;
    const to = target === "end" ? steps.length : steps.findIndex((s) => s.short_id === target);
    if (to === from + 1) return;
    const place: Place = target === "end" ? { kind: "last" } : { kind: "before", id: target };
    void send({ kind: "move", id: steps[from].short_id, place }, { place: stepPlace(steps, from) }, "Move Step");
  }

  function onRowKeyDown(e: React.KeyboardEvent<HTMLLIElement>, step: Step) {
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        setRenaming(step.short_id);
        break;
      case " ":
        e.preventDefault();
        void send({ kind: "toggle", id: step.short_id }, {}, "Toggle Step");
        break;
      default:
        break;
    }
  }

  /** A rename finished from the keyboard hands focus back to its row. */
  function endRename(id: string) {
    const row = rowOf(id);
    if (row?.contains(document.activeElement)) row.focus();
    setRenaming(null);
  }

  return (
    <section className="steps" aria-label="Steps">
      <h3 className="pane-section-title">Steps</h3>
      <ul ref={list}>
        {steps.map((step, i) => (
          <li
            key={step.short_id}
            aria-label={`Step ${step.text}`}
            tabIndex={0}
            data-step-id={step.short_id}
            data-own-keys
            onKeyDown={(e) => onRowKeyDown(e, step)}
            draggable
            onDragStart={() => setDragging(step.short_id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(step.short_id)}
          >
            <input
              type="checkbox"
              aria-label={`Toggle step ${step.text}`}
              checked={step.done}
              onChange={() => void send({ kind: "toggle", id: step.short_id }, {}, "Toggle Step")}
            />
            {renaming === step.short_id ? (
              <InlineText
                label="Step text"
                value={step.text}
                editing
                onEditing={(on) => !on && endRename(step.short_id)}
                onSave={(text) => {
                  if (text.trim() !== "") void send({ kind: "rename", id: step.short_id, text }, { text: step.text }, "Rename Step");
                }}
              />
            ) : (
              <span className={step.done ? "step-text is-done" : "step-text"} onClick={() => setRenaming(step.short_id)}>
                {step.text}
              </span>
            )}
            <button
              type="button"
              className="icon-button step-remove"
              aria-label={`Remove step ${step.text}`}
              onClick={() =>
                void send({ kind: "remove", id: step.short_id }, { text: step.text, place: stepPlace(steps, i) }, "Remove Step")
              }
            >
              <SymbolIcon name="xmark" />
            </button>
          </li>
        ))}
      </ul>
      <div className="drop-end" onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn("end")} />
      <input
        ref={newStep}
        className="step-new"
        aria-label="New step"
        placeholder="Add a step"
        onKeyDown={(e) => {
          const text = e.currentTarget.value.trim();
          if (e.key === "Enter" && text !== "") {
            void send({ kind: "add", text, place: null }, {}, "Add Step");
            e.currentTarget.value = "";
          } else if (e.key === "Escape") {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
      />
    </section>
  );
}

function Assignee(props: { task: TaskDetail; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { task } = props;
  const run = useDeck((s) => s.run);
  const allRows = useDeck((s) => s.allRows);
  const seen = useMemo(
    () => [...new Set(["me", ...allRows.map((r) => r.assignee).filter((a): a is string => a !== null)])],
    [allRows],
  );

  function edit(input: EditInput, before: EditInput, label: string) {
    void run(
      { kind: "edit", number: task.number, input },
      { kind: "edit", number: task.number, before, after: input },
      label,
    );
  }
  const beforeAssignee: EditInput = task.assignee === null ? { unassign: true } : { assignee: task.assignee };

  function commit(value: string) {
    const name = value.trim();
    if (name === (task.assignee ?? "")) return;
    if (name === "") edit({ unassign: true }, beforeAssignee, "Unassign");
    else edit({ assignee: name }, beforeAssignee, "Assign");
  }

  return (
    <span className="assignee">
      <input
        className={task.assignee === null ? undefined : "has-clear"}
        key={task.assignee ?? ""}
        ref={props.inputRef}
        aria-label="Assignee"
        list="assignee-options"
        defaultValue={task.assignee ?? ""}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          else if (e.key === "Escape") {
            e.stopPropagation();
            e.currentTarget.value = task.assignee ?? "";
            e.currentTarget.blur();
          }
        }}
      />
      <datalist id="assignee-options">
        {seen.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {task.assignee !== null && (
        <button
          type="button"
          className="field-clear"
          aria-label="Unassign"
          onClick={() => edit({ unassign: true }, beforeAssignee, "Unassign")}
        >
          <SymbolIcon name="xmark-circle-fill" />
        </button>
      )}
    </span>
  );
}

const AFTER_PREFIX = "pane-after-";

function RunsAfter(props: { task: TaskDetail }) {
  const { task } = props;
  const run = useDeck((s) => s.run);
  const allRows = useDeck((s) => s.allRows);
  const current = task.after.map((a) => a.task);
  const choices = allRows.filter((r) => r.number !== task.number && !current.includes(r.number));

  function write(after: number[], label: string) {
    void run(
      { kind: "edit", number: task.number, input: { after } },
      { kind: "edit", number: task.number, before: { after: current }, after: { after } },
      label,
    );
  }

  usePullDownChoice((id) => {
    if (!id.startsWith(AFTER_PREFIX)) return;
    const number = Number(id.slice(AFTER_PREFIX.length));
    if (choices.some((r) => r.number === number)) write([...current, number], "Add Dependency");
  });

  return (
    <div role="group" aria-label="Runs after" className="runs-after">
      {task.after.map((link) => (
        <button
          key={link.task}
          type="button"
          className={link.done ? "chip is-done" : "chip"}
          aria-label={`Remove T${link.task}`}
          onClick={() => write(current.filter((n) => n !== link.task), "Remove Dependency")}
        >
          T{link.task} <SymbolIcon name="xmark" />
        </button>
      ))}
      <PullDown
        label="Add Dependency…"
        symbol="plus-small"
        items={choices.map((r) => ({ id: `${AFTER_PREFIX}${r.number}`, title: `T${r.number} ${r.title}` }))}
      />
    </div>
  );
}

function Activity(props: { task: TaskDetail }) {
  return (
    <section aria-label="Activity">
      <h3 className="pane-section-title">Activity</h3>
      <ul className="activity">
        {props.task.activity.map((a, i) => {
          const at = dateOf(a.at);
          return (
            <li key={i}>
              <span className="activity-text">{activitySentence(a)}</span>
              <time className="activity-time" dateTime={at.toISOString()}>
                {formatWhen(at)}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Card = "block" | "review" | null;

/** The open task: editable fields, steps, block and review thread, activity. */
export function TaskPane() {
  const openTask = useDeck((s) => s.openTask);
  const task = useDeck((s) => s.detail);
  const settings = useDeck((s) => s.settings);
  const refusal = useDeck((s) => s.refusal);
  // A failure of a change to this task shows here, beside the task it belongs to.
  const taskError = useDeck((s) => (s.errorTask !== null && s.errorTask === s.openTask ? s.error : null));
  const run = useDeck((s) => s.run);
  const keymap = useMemo(() => resolveKeymap(settings.keymap), [settings.keymap]);
  const allRows = useDeck((s) => s.allRows);
  // The task is included so a project with no live rows left still gets its label.
  const projectLabel = useMemo(() => {
    if (!task?.project) return "Desk";
    return projectLabelsOf([...allRows, task], settings.projectNames).get(task.project) ?? task.project;
  }, [allRows, task, settings.projectNames]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [card, setCard] = useState<Card>(null);
  const [threadFocused, setThreadFocused] = useState(false);
  const [editingWaits, setEditingWaits] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState<{ replied: boolean; message: string } | null>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const assigneeRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLElement>(null);
  const focus = useDeck((s) => s.focus);
  const modalOpen = useDeck((s) => s.modalOpen);

  const inTask = task !== null && task.number === openTask;
  const pendingCard = useDeck((s) => s.pendingCard);
  useEffect(() => {
    if (pendingCard === null || !inTask) return;
    setCard(pendingCard);
    useDeck.setState({ pendingCard: null });
  }, [pendingCard, inTask]);
  const block = inTask && task.status === "blocked" ? task.block : null;
  const review = inTask && task.status === "review" ? task.review : null;
  const context = threadFocused && review ? "review" : threadFocused && block ? "block" : "task";
  const canReply = inTask && (task.status === "blocked" || task.status === "review");

  // An opened task takes the keyboard: its open block or review when it has one, else the pane.
  // A dialog opened from the task hands the keyboard back here when it closes.
  // The pane keeps its scroll position, so the task's title stays in view.
  const shownNumber = inTask ? task.number : null;
  useEffect(() => {
    const pane = paneRef.current;
    if (modalOpen || focus !== "task" || shownNumber === null || !pane || pane.contains(document.activeElement)) return;
    (threadRef.current ?? pane).focus({ preventScroll: true });
  }, [focus, shownNumber, modalOpen]);

  function change(cmd: StatusChange, label: string) {
    if (!inTask) return;
    const dispatched = cmd.kind === "start" && cmd.dispatch && task.assignee !== null;
    void run(
      { kind: "status", number: task.number, change: cmd },
      { kind: "status", number: task.number, from: task.status, to: statusAfter(cmd), dispatched },
      label,
    );
  }

  function finish(result: FlowResult, clearDraft: boolean) {
    if (result.ok) {
      setFlowError(null);
      setDraft("");
    } else {
      setFlowError({ replied: result.replied, message: errorMessage(result.error) });
      if (result.replied || clearDraft) setDraft("");
    }
    return useDeck.getState().refresh();
  }

  /** Answers the block or sends the review back. A reply cannot be taken back, so undo reports it. */
  async function submit() {
    const text = draft.trim();
    if (!canReply || text === "" || busy) return;
    const answering = task.status === "blocked";
    setBusy(true);
    try {
      const result = answering ? await answerBlock(api, task, text) : await sendBack(api, task, text);
      if (result.ok || result.replied) useDeck.setState({ irreversible: answering ? "Answer" : "Send back" });
      await finish(result, false);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!inTask) return;
    setBusy(true);
    try {
      await finish(await retryStatus(api, task), true);
    } finally {
      setBusy(false);
    }
  }

  function saveWaits(on: string) {
    if (!inTask) return;
    const before = onArg(block?.on ?? review?.on ?? null);
    setEditingWaits(false);
    void run(
      { kind: "edit", number: task.number, input: { on } },
      { kind: "edit", number: task.number, before: { on: before }, after: { on } },
      "Change Waits On",
    );
  }

  function archive() {
    if (!inTask) return;
    void run({ kind: "archive", number: task.number, archived: true }, { kind: "archive", number: task.number, archived: true }, "Archive").then(
      () => useDeck.getState().close(),
    );
  }

  function openReply() {
    if (!canReply) return false;
    setTimeout(() => replyRef.current?.focus(), 0);
  }

  function pickOption(n: number) {
    const option = block?.options[n - 1];
    if (option === undefined) return false;
    setDraft(option);
    setTimeout(() => replyRef.current?.focus(), 0);
  }

  const focused = () => useDeck.getState().focus === "task";
  const when_ = (fn: Handler): Handler => () => focused() && fn() !== false;
  const option = (n: number) => when_(() => pickOption(n));

  const paneKeys: Handlers = {
    "edit.title": when_(() => setEditingTitle(true)),
    "status.start": when_(() => change(START, "Start")),
    "status.ready": when_(() => change({ kind: "ready" }, "Mark Ready")),
    "status.open": when_(() => change({ kind: "open" }, "Reopen")),
    "status.done": when_(() => change({ kind: "done", clean: false }, "Mark Done")),
    "status.block": when_(() => setCard("block")),
    "status.review": when_(() => setCard("review")),
    archive: when_(archive),
    reply: when_(openReply),
    assign: when_(() => assigneeRef.current?.focus()),
    "option.1": option(1),
    "option.2": option(2),
    "option.3": option(3),
    "option.4": option(4),
    "option.5": option(5),
    "option.6": option(6),
    "option.7": option(7),
    "option.8": option(8),
    "option.9": option(9),
    waitsOn: when_(() => setEditingWaits(true)),
    "review.approve": when_(() => change({ kind: "done", clean: false }, "Approve")),
    "review.sendBack": when_(() => void submit()),
  };

  useKeymap(keymap, modalOpen ? {} : paneKeys, context);

  usePullDownChoice((id) => {
    switch (id) {
      case "pane-block":
        setCard("block");
        break;
      case "pane-review":
        setCard("review");
        break;
      case "pane-start-quiet":
        change(START_QUIET, "Start");
        break;
      default:
        break;
    }
  });

  if (!inTask)
    return (
      <aside className="task-pane" aria-label="Task">
        <Loading />
      </aside>
    );

  /** Applies a state chosen in the Status pop-up. */
  function onStatus(value: string) {
    switch (value) {
      case "open":
        return change({ kind: "open" }, "Reopen");
      case "ready":
        return change({ kind: "ready" }, "Mark Ready");
      case "started":
        return change(START, "Start");
      case "done":
        return change({ kind: "done", clean: false }, "Mark Done");
      default:
        return undefined;
    }
  }

  // Changes that ask for more than the state itself.
  const statusActions = [
    { id: "pane-block", title: "Block…" },
    { id: "pane-review", title: "Request Review…" },
    { id: "pane-assign", title: "Assign…" },
    ...(task.assignee !== null ? [{ id: "pane-start-quiet", title: "Start Without Launching Agent" }] : []),
    { id: PULL_DOWN_SEPARATOR, title: "" },
    { id: "pane-archive", title: "Archive" },
  ];

  function offerRefusal() {
    if (!refusal || refusal.cmd.kind !== "status" || refusal.cmd.number !== openTask) return null;
    const original = refusal.cmd.change;
    switch (refusal.code) {
      case "agent-gone":
        return (
          <button type="button" onClick={() => change({ kind: "start", dispatch: true, again: true, force: false }, "Relaunch")}>
            Relaunch
          </button>
        );
      case "after-not-done":
        return original.kind === "start" ? (
          <button type="button" onClick={() => change({ ...original, force: true }, "Start")}>
            Start Anyway
          </button>
        ) : null;
      default:
        return null;
    }
  }

  return (
    <aside
      ref={paneRef}
      className="task-pane"
      aria-label="Task"
      tabIndex={-1}
      onFocus={() => useDeck.setState({ focus: "task" })}
      onKeyDown={(e) => {
        // Escape closes an open block or review card before it closes the task.
        if (e.key !== "Escape" || card === null) return;
        e.stopPropagation();
        paneRef.current?.focus();
        setCard(null);
      }}
      onBlur={(e) => {
        const deck = useDeck.getState();
        if (deck.modalOpen || deck.focus !== "task" || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        useDeck.setState({ focus: "board" });
      }}
    >
      <header className="pane-head">
        <div className="pane-meta">
          <span>T{task.number}</span>
          <span aria-hidden="true">·</span>
          <span className="pane-status">
            <span className={`row-status status-${task.status}`} aria-hidden="true" />
            {STATUS_LABELS[task.status]}
          </span>
          <button type="button" className="icon-button pane-close" aria-label="Close" onClick={() => useDeck.getState().close()}>
            <SymbolIcon name="xmark" />
          </button>
        </div>
        <InlineText
          label="Title"
          className="pane-title"
          value={task.title}
          editing={editingTitle}
          onEditing={setEditingTitle}
          onSave={(title) =>
            void run(
              { kind: "edit", number: task.number, input: { title } },
              { kind: "edit", number: task.number, before: { title: task.title }, after: { title } },
              "Edit Title",
            )
          }
        />
        <InlineText
          label="Notes"
          className="pane-notes"
          multiline
          placeholder="Add notes"
          value={task.notes ?? ""}
          onSave={(notes) =>
            void run(
              { kind: "edit", number: task.number, input: { notes } },
              { kind: "edit", number: task.number, before: { notes: task.notes ?? "" }, after: { notes } },
              "Edit Notes",
            )
          }
        />
      </header>

      <dl className="fields">
        <dt>Status</dt>
        <dd>
          <PopUp aria-label="Status" value={task.status} onChange={(e) => onStatus(e.target.value)}>
            {(["open", "ready", "started", "done"] as const).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
            {(task.status === "blocked" || task.status === "review") && (
              <option value={task.status} disabled>
                {STATUS_LABELS[task.status]}
              </option>
            )}
          </PopUp>
          <PullDown label="Actions" symbol="ellipsis-circle" items={statusActions} />
          {offerRefusal()}
        </dd>
        <dt>Assignee</dt>
        <dd>
          <Assignee task={task} inputRef={assigneeRef} />
        </dd>
        <dt>Runs after</dt>
        <dd>
          <RunsAfter task={task} />
        </dd>
        <dt>Thread</dt>
        <dd className="field-value">
          {task.thread === null ? (
            <span className="muted">None</span>
          ) : (
            <>
              <SymbolIcon name="number" />
              {task.thread}
            </>
          )}
        </dd>
        <dt>Project</dt>
        <dd className="field-value">
          <SymbolIcon name="folder" />
          {projectLabel}
        </dd>
      </dl>

      {card === "block" && <BlockCard task={task} onClose={() => setCard(null)} />}
      {card === "review" && <ReviewCard task={task} onClose={() => setCard(null)} />}

      {canReply && (
        <ThreadView
          ref={replyRef}
          regionRef={threadRef}
          task={task}
          draft={draft}
          onDraft={setDraft}
          onSubmit={() => void submit()}
          busy={busy}
          editingWaits={editingWaits}
          onEditWaits={() => setEditingWaits(true)}
          onSaveWaits={saveWaits}
          onFocusChange={setThreadFocused}
        />
      )}
      {flowError && (
        <p role="alert" className="flow-error">
          {flowError.message}
          {flowError.replied && (
            <button type="button" disabled={busy} onClick={() => void retry()}>
              Retry Status Change
            </button>
          )}
        </p>
      )}

      {taskError !== null && (
        <p role="alert" className="flow-error">
          {taskError}
        </p>
      )}

      <Steps task={task} keymap={keymap} />
      <Activity task={task} />

      <footer className="pane-actions">
        <button type="button" onClick={() => change({ kind: "done", clean: false }, "Mark Done")}>
          Mark Done
        </button>
        <button type="button" onClick={archive}>
          Archive
        </button>
      </footer>
    </aside>
  );
}
