export type WaitsKind = "default" | "you" | "task" | "agent" | "other";

/** Splits a stored `block.on`/`review.on` into a control kind and the value tsk accepts back. */
export function onToInput(on: string): { kind: WaitsKind; value: string } {
  if (on === "you") return { kind: "you", value: "" };
  const task = /^task:(\d+)$/.exec(on);
  if (task) return { kind: "task", value: `T${task[1]}` };
  if (on.startsWith("other:")) return { kind: "other", value: on.slice("other:".length) };
  if (on.startsWith("agent:")) return { kind: "agent", value: on.slice("agent:".length) };
  return { kind: "agent", value: on };
}

/** The `--on` value for a control state, or null to leave it unset. */
export function inputToOn(kind: WaitsKind, value: string): string | null {
  switch (kind) {
    case "you":
      return "you";
    case "default":
      return null;
    default:
      return value === "" ? null : value;
  }
}
