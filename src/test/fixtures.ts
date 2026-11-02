import type { Block, Review, TaskDetail, TaskRow } from "../api/types";

export function row(partial: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    number: 1,
    title: "Example task",
    status: "open",
    project: null,
    thread: null,
    assignee: null,
    assignee_kind: null,
    base: null,
    after: [],
    before: [],
    ...partial,
  };
}

export function detail(partial: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...row(),
    notes: null,
    steps: [],
    activity: [],
    ...partial,
  };
}

export function blockOn(on: string): Block {
  return {
    why: "Waiting",
    needs: null,
    options: [],
    on,
    by: "tester",
    at: [1700000000, 0],
    edited: false,
    replies: [],
    answered: false,
  };
}

export function reviewOn(on: string): Review {
  return {
    round: 1,
    done: "Finished the work",
    checks: [],
    next: null,
    on,
    by: "tester",
    at: [1700000000, 0],
    edited: false,
    feedback: [],
    answered: false,
  };
}
