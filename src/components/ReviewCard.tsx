import { useEffect, useRef, useState } from "react";
import type { TaskDetail } from "../api/types";
import { useDeck } from "../state/store";
import { closeOnEscape, WaitsOn } from "./BlockCard";
import { lines } from "./lines";

/** Form that sends a task to review. Reviews wait on a person or an agent, never a task. */
export function ReviewCard(props: { task: TaskDetail; onClose: () => void }) {
  const { task } = props;
  const run = useDeck((s) => s.run);
  const [done, setDone] = useState(task.review?.done ?? "");
  const [checks, setChecks] = useState((task.review?.checks ?? []).map((c) => c.text).join("\n"));
  const [next, setNext] = useState(task.review?.next ?? "");
  const [on, setOn] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("textarea, input")?.focus();
  }, []);

  /** Writes the review request and closes the card once the write succeeded. */
  async function submit() {
    const trimmedDone = done.trim();
    const trimmedNext = next.trim();
    const change = {
      kind: "review" as const,
      done: trimmedDone === "" ? null : trimmedDone,
      checks: lines(checks),
      next: trimmedNext === "" ? null : trimmedNext,
      on,
    };
    const written = await run(
      { kind: "status", number: task.number, change },
      { kind: "status", number: task.number, from: task.status, to: "review", dispatched: false },
      "Request Review",
    );
    if (written) props.onClose();
  }

  return (
    <form
      ref={form}
      className="card group-box"
      aria-label="Request Review"
      onKeyDown={closeOnEscape(props.onClose)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
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
