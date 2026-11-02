import { describe, expect, it } from "vitest";
import { activitySentence } from "./activity";

const at: [number, number] = [0, 0];

describe("activitySentence", () => {
  it("names the person who acted", () => {
    expect(activitySentence({ at, by: "alex", kind: "created", detail: null })).toBe("alex added this task");
  });

  it("reads without a person", () => {
    expect(activitySentence({ at, by: null, kind: "status_set", detail: { from: "ready", to: "started" } })).toBe(
      "Status changed to Started",
    );
  });

  it("names a status set without a readable target plainly", () => {
    expect(activitySentence({ at, by: null, kind: "status_set", detail: null })).toBe("Status changed");
  });

  it("reads a status word as a status change", () => {
    expect(activitySentence({ at, by: "claude", kind: "blocked", detail: { on: "human" } })).toBe(
      "claude changed the status to Blocked",
    );
  });

  it("shows an unknown verb as tsk wrote it", () => {
    expect(activitySentence({ at, by: "alex", kind: "base_set", detail: "main" })).toBe("alex base_set: main");
    expect(activitySentence({ at, by: null, kind: "cleaned", detail: null })).toBe("cleaned");
  });
});
