import type { Api } from "../api/client";
import type { StatusChange, TaskDetail, TskError } from "../api/types";

export type FlowResult = { ok: true } | { ok: false; replied: boolean; error: TskError };

const START_QUIET: StatusChange = { kind: "start", dispatch: false, again: false, force: false };
const START_LAUNCH: StatusChange = { kind: "start", dispatch: true, again: false, force: false };

/** Whether an agent session is running for the task. */
function hasAgent(task: TaskDetail): boolean {
  return task.assignee !== null && task.dispatch != null;
}

function asError(e: unknown): TskError {
  if (typeof e === "object" && e !== null && "kind" in e) return e as TskError;
  return { kind: "unexpected", exit: null, message: String(e) };
}

async function replyThen(api: Api, task: TaskDetail, text: string, status: StatusChange): Promise<FlowResult> {
  try {
    await api.reply(task.number, text, hasAgent(task));
  } catch (e) {
    return { ok: false, replied: false, error: asError(e) };
  }
  try {
    await api.setStatus(task.number, status);
  } catch (e) {
    return { ok: false, replied: true, error: asError(e) };
  }
  return { ok: true };
}

/** What follows an answered block. */
function afterAnswer(task: TaskDetail): StatusChange {
  if (task.assignee === null) return { kind: "ready" };
  return hasAgent(task) ? START_QUIET : START_LAUNCH;
}

/** What follows a review sent back. */
function afterSendBack(task: TaskDetail): StatusChange {
  return task.assignee !== null && !hasAgent(task) ? START_LAUNCH : START_QUIET;
}

/** Replies once, then unblocks. A failed status call never repeats the reply. */
export function answerBlock(api: Api, task: TaskDetail, text: string): Promise<FlowResult> {
  return replyThen(api, task, text, afterAnswer(task));
}

/** Replies once with the feedback, then restarts the task. */
export function sendBack(api: Api, task: TaskDetail, feedback: string): Promise<FlowResult> {
  return replyThen(api, task, feedback, afterSendBack(task));
}

/** Repeats only the status call after a flow replied but could not change status. */
export async function retryStatus(api: Api, task: TaskDetail): Promise<FlowResult> {
  const status = task.status === "review" ? afterSendBack(task) : afterAnswer(task);
  try {
    await api.setStatus(task.number, status);
  } catch (e) {
    return { ok: false, replied: true, error: asError(e) };
  }
  return { ok: true };
}
