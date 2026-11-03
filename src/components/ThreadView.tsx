import { forwardRef, useRef, useState } from "react";
import type { Block, Check, CheckState, Reply, Review, TaskDetail } from "../api/types";
import { formatBinding } from "../keys/format";
import { isMacPlatform } from "../keys/keymap";
import { dateOf, formatWhen } from "../when";
import { WaitsOn } from "./BlockCard";
import { Clamp } from "./Clamp";

function Replies(props: { items: Reply[] }) {
  if (props.items.length === 0) return null;
  return (
    <ul className="replies">
      {props.items.map((r) => {
        const at = dateOf(r.at);
        return (
          <li key={`${r.at[0]}-${r.at[1]}`}>
            <span className="reply-meta">
              {r.by} · <time dateTime={at.toISOString()}>{formatWhen(at)}</time>
            </span>
            <div>{r.text}</div>
          </li>
        );
      })}
    </ul>
  );
}

function BlockBody(props: { block: Block; onPick: (text: string) => void }) {
  const { block } = props;
  return (
    <>
      {block.why && (
        <Clamp>
          <p>{block.why}</p>
        </Clamp>
      )}
      {block.needs && (
        <Clamp>
          <p className="muted">Needs: {block.needs}</p>
        </Clamp>
      )}
      {block.options.length > 0 && (
        <ol className="options">
          {block.options.map((option, i) => (
            <li key={`${i}-${option}`}>
              <button type="button" onClick={() => props.onPick(option)}>
                <kbd>{i + 1}</kbd>
                {option}
              </button>
            </li>
          ))}
        </ol>
      )}
      <Replies items={block.replies} />
    </>
  );
}

const CHECK_LABELS: Record<CheckState, string> = { open: "Open", passed: "Passed", failed: "Failed", unknown: "Unknown" };

/** The key that sends a reply: ⌘Return on macOS, Ctrl+Enter elsewhere. Return inserts a new line. */
const SEND_BINDING = "mod+enter";

function Checks(props: { items: Check[] }) {
  if (props.items.length === 0) return null;
  return (
    <ul className="checks">
      {props.items.map((c, i) => (
        <li key={`${i}-${c.text}`}>
          <span className={`badge badge-${c.state}`}>{CHECK_LABELS[c.state] ?? c.state}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewBody(props: { review: Review; earlier: Review[] }) {
  const { review, earlier } = props;
  return (
    <>
      {review.done && <p>{review.done}</p>}
      <Checks items={review.checks} />
      {review.next && <p className="muted">Next: {review.next}</p>}
      <Replies items={review.feedback} />
      {earlier.length > 0 && (
        <details className="earlier">
          <summary>Earlier rounds ({earlier.length})</summary>
          {earlier.map((r) => (
            <div key={r.round} className="earlier-round">
              <p className="muted">Round {r.round}</p>
              {r.done && <p>{r.done}</p>}
              <Checks items={r.checks} />
              <Replies items={r.feedback} />
              {r.resolution && <p className="muted">{r.resolution}</p>}
            </div>
          ))}
        </details>
      )}
    </>
  );
}

interface ThreadViewProps {
  task: TaskDetail;
  draft: string;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  /** Saves a new "waits on". Omit to hide the control. */
  onSaveWaits?: (on: string) => void;
  editingWaits?: boolean;
  onEditWaits: () => void;
  /** Closes the "waits on" editor without saving. */
  onCancelWaits?: () => void;
  onFocusChange?: (focused: boolean) => void;
  busy?: boolean;
  /** The focusable thread region, where the block and review keys apply. */
  regionRef?: React.Ref<HTMLElement>;
}

/** Picks a new "waits on"; it is mounted only while editing, so each opening starts from the saved value. */
function WaitsEditor(props: {
  value: string;
  allowTask: boolean;
  exclude: number;
  onSave?: (on: string) => void;
  onCancel?: () => void;
}) {
  const { value, allowTask, exclude, onSave, onCancel } = props;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div
      className="waits-edit"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onCancel?.();
      }}
    >
      <WaitsOn value={value} allowTask={allowTask} exclude={exclude} onChange={setDraft} />
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" disabled={draft === null} onClick={() => draft && onSave?.(draft)}>
        Save
      </button>
    </div>
  );
}

/** The open block or review, or a plain reply box, with the reply field. */
export const ThreadView = forwardRef<HTMLTextAreaElement, ThreadViewProps>(function ThreadView(props, ref) {
  const { task } = props;
  const block = task.status === "blocked" ? task.block : null;
  const review = task.status === "review" ? task.review : null;
  const change = useRef<HTMLButtonElement>(null);
  const label = block ? "Blocked" : review ? "In Review" : "Reply";
  const submitLabel = review ? "Send Back" : block ? "Answer" : "Reply";
  const waiting = block ?? review;
  const isMac = isMacPlatform();

  return (
    <section
      ref={props.regionRef}
      className="thread group-box"
      role="region"
      aria-label={label}
      tabIndex={0}
      onFocus={() => props.onFocusChange?.(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) props.onFocusChange?.(false);
      }}
    >
      <div className="group-box-head">
        <h3 className="group-box-title">
          {label}
          {review && <span className="group-box-note">Round {review.round}</span>}
        </h3>
        {waiting && (
          <span className="waits-line">
            Waiting on {waiting.on} ·{" "}
            <button ref={change} type="button" className="link-button" onClick={props.onEditWaits}>
              Change
            </button>
          </span>
        )}
      </div>
      {props.editingWaits && waiting && (
        <WaitsEditor
          value={waiting.on}
          allowTask={block !== null}
          exclude={task.number}
          onSave={props.onSaveWaits}
          onCancel={() => {
            props.onCancelWaits?.();
            change.current?.focus();
          }}
        />
      )}
      {block && <BlockBody block={block} onPick={props.onDraft} />}
      {review && <ReviewBody review={review} earlier={task.past_reviews ?? []} />}
      <textarea
        ref={ref}
        aria-label={review ? "Feedback" : "Reply"}
        rows={3}
        value={props.draft}
        onChange={(e) => props.onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
            e.preventDefault();
            if (!props.busy && props.draft.trim() !== "") props.onSubmit();
            return;
          }
          if (e.key !== "Escape") return;
          e.stopPropagation();
          e.currentTarget.closest<HTMLElement>(".thread")?.focus();
        }}
      />
      <div className="group-box-actions">
        <button
          type="button"
          className="is-default"
          title={`${submitLabel} (${formatBinding(SEND_BINDING, isMac)})`}
          disabled={props.busy || props.draft.trim() === ""}
          onClick={props.onSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </section>
  );
});
