import { beforeEach, describe, expect, it, vi } from "vitest";

const win = vi.hoisted(() => ({
  innerSize: vi.fn(),
  scaleFactor: vi.fn(),
  outerPosition: vi.fn(),
  setSize: vi.fn(),
  setPosition: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tauri-apps/api/window")>();
  return { ...actual, getCurrentWindow: () => win };
});

import { setWindowHeight } from "./client";

beforeEach(() => {
  vi.resetAllMocks();
  win.innerSize.mockResolvedValue({ width: 1120, height: 1040 });
  win.scaleFactor.mockResolvedValue(2);
  win.outerPosition.mockResolvedValue({ x: 100, y: 200 });
  win.setSize.mockResolvedValue(undefined);
  win.setPosition.mockResolvedValue(undefined);
});

describe("setWindowHeight", () => {
  it("keeps the width, sets the height and puts the top edge back", async () => {
    await setWindowHeight(300);
    const size = win.setSize.mock.calls[0][0];
    expect([size.width, size.height]).toEqual([560, 300]);
    expect(win.setPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it("rejects outside Tauri so callers can catch it", async () => {
    win.innerSize.mockRejectedValue(new Error("no window"));
    await expect(setWindowHeight(300)).rejects.toThrow();
  });
});
