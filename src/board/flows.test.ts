import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { detail, row } from "../test/fixtures";
import { answerBlock, retryStatus, sendBack } from "./flows";

function fakeApi() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    setStatus: vi.fn().mockResolvedValue(undefined),
  } as unknown as Api & { reply: ReturnType<typeof vi.fn>; setStatus: ReturnType<typeof vi.fn> };
}

describe("answerBlock", () => {
  it("does not repeat the reply when the status call fails", async () => {
    const api = fakeApi();
    api.setStatus.mockRejectedValueOnce({ kind: "store", message: "x" });
    const r = await answerBlock(api, detail({ ...row({ number: 4, status: "blocked", assignee: null }) }), "use postgres");
    expect(r).toEqual({ ok: false, replied: true, error: { kind: "store", message: "x" } });
    expect(api.reply).toHaveBeenCalledTimes(1);
    await retryStatus(api, detail({ number: 4, assignee: null }));
    expect(api.reply).toHaveBeenCalledTimes(1);
  });

  it("sends the reply to a running agent", async () => {
    const api = fakeApi();
    await answerBlock(api, detail({ number: 4, assignee: "claude", dispatch: {} }), "yes");
    expect(api.reply).toHaveBeenCalledWith(4, "yes", true);
    expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "start", dispatch: false, again: false, force: false });
  });

  it("marks an unassigned task ready", async () => {
    const api = fakeApi();
    await answerBlock(api, detail({ number: 4, assignee: null }), "yes");
    expect(api.reply).toHaveBeenCalledWith(4, "yes", false);
    expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "ready" });
  });

  it("relaunches an assigned task that has no dispatch record", async () => {
    const api = fakeApi();
    await answerBlock(api, detail({ number: 4, assignee: "claude" }), "yes");
    expect(api.reply).toHaveBeenCalledWith(4, "yes", false);
    expect(api.setStatus).toHaveBeenCalledWith(4, { kind: "start", dispatch: true, again: false, force: false });
  });

  it("skips the status call when the reply fails", async () => {
    const api = fakeApi();
    api.reply.mockRejectedValueOnce({ kind: "usage", message: "no" });
    const r = await answerBlock(api, detail({ number: 4 }), "yes");
    expect(r).toEqual({ ok: false, replied: false, error: { kind: "usage", message: "no" } });
    expect(api.setStatus).not.toHaveBeenCalled();
  });
});

describe("sendBack", () => {
  it("restarts an unassigned task without launching", async () => {
    const api = fakeApi();
    expect(await sendBack(api, detail({ number: 5, assignee: null }), "fix it")).toEqual({ ok: true });
    expect(api.reply).toHaveBeenCalledWith(5, "fix it", false);
    expect(api.setStatus).toHaveBeenCalledWith(5, { kind: "start", dispatch: false, again: false, force: false });
  });

  it("sends feedback to a running agent", async () => {
    const api = fakeApi();
    await sendBack(api, detail({ number: 5, assignee: "claude", dispatch: {} }), "fix it");
    expect(api.reply).toHaveBeenCalledWith(5, "fix it", true);
    expect(api.setStatus).toHaveBeenCalledWith(5, { kind: "start", dispatch: false, again: false, force: false });
  });
});
