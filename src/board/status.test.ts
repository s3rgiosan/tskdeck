import { describe, expect, it } from "vitest";
import { STATUS_LABELS } from "./status";

describe("STATUS_LABELS", () => {
  it("names a status tskdeck does not know as Unknown", () => {
    expect(STATUS_LABELS.unknown).toBe("Unknown");
  });
});
