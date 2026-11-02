import { useState } from "react";
import type { TaskDetail } from "../api/types";
import { useDeck } from "../state/store";
import { leaveFieldOnEscape, WaitsOn } from "./BlockCard";

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** Form that sends a task to review. Reviews wait on a person or an agent, never a task. */
export function ReviewCard(props: { task: TaskDetail; onClose: () => void }) {
  const { task } = props;
  const run = useDeck((s) => s.run);
  const [done, setDone] = useState(task.review?.done ?? "");
  const [checks, setChecks] = useState((task.review?.checks ?? []).map((c) => c.text).join("\n"));
  const [next, setNext] = useState(task.review?.next ?? "");
  const [on, setOn] = useState<string | null>(null);

  function submit() {
    const change = {
      kind: "review" as const,
      done: done.trim() === "" ? null : done.trim(),
      checks: lines(checks),
      next: next.trim() === "" ? null : next.trim(),
      on,
    };
    props.onClose();
    void run(
      { kind: "status", number: task.number, change },
      { kind: "status", number: task.number, from: task.status, to: "review", dispatched: false },
      "Request Review",
    );
  }

  return (
    <form
      className="card group-box"
      aria-label="Request Review"
      onKeyDown={leaveFieldOnEscape}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="group-box-title">Request Review</h3>
      <label>
        Done
        <textarea value={done} onChange={(e) => setDone(e.target.value)} rows={2} />
      </label>
      <label>
        Checks, one per line
        <textarea value={checks} onChange={(e) => setChecks(e.target.value)} rows={3} />
      </label>
      <label>
        Next
        <input value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        Waits on
        <WaitsOn value={on} allowTask={false} onChange={setOn} />
      </label>
      <div className="group-box-actions">
        <button type="button" onClick={props.onClose}>
          Cancel
        </button>
        <button type="submit">Request Review</button>
      </div>
    </form>
  );
}
