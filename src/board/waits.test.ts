import { describe, expect, it } from "vitest";
import { inputToOn, onToInput } from "./waits";

describe("waits-on mapping", () => {
  it("maps each stored form to a control kind", () => {
    expect(onToInput("you")).toEqual({ kind: "you", value: "" });
    expect(onToInput("task:12")).toEqual({ kind: "task", value: "T12" });
    expect(onToInput("other:ask legal")).toEqual({ kind: "other", value: "ask legal" });
    expect(onToInput("agent:builder")).toEqual({ kind: "agent", value: "builder" });
    expect(onToInput("claude")).toEqual({ kind: "agent", value: "claude" });
  });

  it("sends back a value tsk stores identically", () => {
    const sent = (on: string) => {
      const { kind, value } = onToInput(on);
      return inputToOn(kind, value);
    };
    expect(sent("you")).toBe("you");
    expect(sent("task:12")).toBe("T12");
    expect(sent("other:ask legal")).toBe("ask legal");
    expect(sent("agent:builder")).toBe("builder");
    expect(sent("claude")).toBe("claude");
  });

  it("sends null for the default or an empty value", () => {
    expect(inputToOn("default", "")).toBeNull();
    expect(inputToOn("other", "")).toBeNull();
  });
});
