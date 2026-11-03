import { useEffect, useRef, useState } from "react";
import type { TaskDetail } from "../api/types";
import { inputToOn, onToInput } from "../board/waits";
import type { WaitsKind } from "../board/waits";
import { useDeck } from "../state/store";
import { lines } from "./lines";
import { PopUp } from "./PopUp";

/**
 * Picks who a block or review waits on: the default, you, a live task, an agent
 * seen on the board, or free text. `onChange` receives the value tsk takes for `--on`.
 */
export function WaitsOn(props: {
  value: string | null;
  allowTask: boolean;
  exclude?: number;
  onChange: (value: string | null) => void;
}) {
  const allRows = useDeck((s) => s.allRows);
  const agents = [...new Set(allRows.map((r) => r.assignee).filter((a): a is string => a !== null))];
  const tasks = allRows.map((r) => r.number).filter((n) => n !== props.exclude);
  const initial = props.value === null ? { kind: "default" as WaitsKind, value: "" } : onToInput(props.value);
  const [kind, setKind] = useState<WaitsKind>(initial.kind);
  const [detail, setDetail] = useState(initial.value);
  const agentChoices = detail !== "" && kind === "agent" && !agents.includes(detail) ? [...agents, detail] : agents;

  function pick(nextKind: WaitsKind, nextDetail: string) {
    setKind(nextKind);
    setDetail(nextDetail);
    props.onChange(inputToOn(nextKind, nextDetail));
  }

  return (
    <span className="waits-on">
      <PopUp aria-label="Waits on" value={kind} onChange={(e) => pick(e.target.value as WaitsKind, "")}>
        <option value="default">Default</option>
        <option value="you">You</option>
        {props.allowTask && <option value="task">A Task</option>}
        <option value="agent">An Agent</option>
        <option value="other">Someone Else</option>
      </PopUp>
      {kind === "task" && (
        <PopUp aria-label="Task" value={detail} onChange={(e) => pick("task", e.target.value)}>
          <option value="">Choose…</option>
          {tasks.map((n) => (
            <option key={n} value={`T${n}`}>{`T${n}`}</option>
          ))}
        </PopUp>
      )}
      {kind === "agent" && (
        <PopUp aria-label="Agent" value={detail} onChange={(e) => pick("agent", e.target.value)}>
          <option value="">Choose…</option>
          {agentChoices.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </PopUp>
      )}
      {kind === "other" && (
        <input aria-label="Who" value={detail} onChange={(e) => pick("other", e.target.value)} />
      )}
    </span>
  );
}

/** Escape anywhere in a card closes it, as Cancel does, and stays out of the task view's keys. */
export function closeOnEscape(onClose: () => void) {
  return (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };
}

/** Form that sets a task blocked. */
export function BlockCard(props: { task: TaskDetail; onClose: () => void }) {
  const { task } = props;
  const run = useDeck((s) => s.run);
  const [why, setWhy] = useState(task.block?.why ?? "");
  const [needs, setNeeds] = useState(task.block?.needs ?? "");
  const [options, setOptions] = useState((task.block?.options ?? []).join("\n"));
  const [on, setOn] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("textarea, input")?.focus();
  }, []);

  /** Writes the block and closes the card once the write succeeded. */
  async function submit() {
    const trimmedWhy = why.trim();
    const trimmedNeeds = needs.trim();
    const change = {
      kind: "blocked" as const,
      why: trimmedWhy === "" ? null : trimmedWhy,
      needs: trimmedNeeds === "" ? null : trimmedNeeds,
      options: lines(options),
      on,
    };
    const written = await run(
      { kind: "status", number: task.number, change },
      { kind: "status", number: task.number, from: task.status, to: "blocked", dispatched: false },
      "Block",
    );
    if (written) props.onClose();
  }

  return (
    <form
      ref={form}
      className="card group-box"
      aria-label="Block"
      onKeyDown={closeOnEscape(props.onClose)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="group-box-title">Block</h3>
      <label>
        Why
        <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
      </label>
      <label>
        Needs
        <input value={needs} onChange={(e) => setNeeds(e.target.value)} />
      </label>
      <label>
        Options, one per line
        <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={3} />
      </label>
      <label>
        Waits on
        <WaitsOn value={on} allowTask exclude={task.number} onChange={setOn} />
      </label>
      <div className="group-box-actions">
        <button type="button" onClick={props.onClose}>
          Cancel
        </button>
        <button type="submit">Block</button>
      </div>
    </form>
  );
}
