import { describe, expect, it } from "vitest";
import { runBulk } from "./bulk";

describe("runBulk", () => {
  it("keeps going after a failure", async () => {
    const r = await runBulk([1, 2, 3], async (n) => {
      if (n === 2) throw { kind: "refused", code: "after-not-done", message: "m" };
    });
    expect(r.ok).toEqual([1, 3]);
    expect(r.failed.map((f) => f.number)).toEqual([2]);
    expect(r.failed[0].error).toEqual({ kind: "refused", code: "after-not-done", message: "m" });
  });

  it("awaits each call before starting the next", async () => {
    const log: string[] = [];
    await runBulk([1, 2], async (n) => {
      log.push(`start ${n}`);
      await Promise.resolve();
      await Promise.resolve();
      log.push(`end ${n}`);
    });
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });
});
