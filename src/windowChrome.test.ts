import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFullscreen, onFullscreenChanged, reduceTransparency } from "./api/client";
import { trackWindowChrome } from "./windowChrome";

vi.mock("./api/client", () => ({
  isFullscreen: vi.fn(),
  onFullscreenChanged: vi.fn(),
  reduceTransparency: vi.fn(),
}));

let stop = () => {};
let unlisten: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  unlisten = vi.fn<() => void>();
  vi.mocked(isFullscreen).mockResolvedValue(false);
  vi.mocked(onFullscreenChanged).mockResolvedValue(unlisten);
  vi.mocked(reduceTransparency).mockResolvedValue(false);
});

afterEach(() => {
  stop();
  vi.resetAllMocks();
  document.documentElement.classList.remove("is-fullscreen", "reduce-transparency");
});

describe("trackWindowChrome", () => {
  it("marks the root while the window is in full screen", async () => {
    stop = trackWindowChrome();
    const changed = vi.mocked(onFullscreenChanged).mock.calls[0][0];
    changed(true);
    expect(document.documentElement).toHaveClass("is-fullscreen");
    changed(false);
    expect(document.documentElement).not.toHaveClass("is-fullscreen");
  });

  it("starts in full screen when the window already is", async () => {
    vi.mocked(isFullscreen).mockResolvedValue(true);
    stop = trackWindowChrome();
    await vi.waitFor(() => expect(document.documentElement).toHaveClass("is-fullscreen"));
  });

  it("reads Reduce Transparency at start and again on focus", async () => {
    stop = trackWindowChrome();
    await vi.waitFor(() => expect(reduceTransparency).toHaveBeenCalledTimes(1));
    expect(document.documentElement).not.toHaveClass("reduce-transparency");
    vi.mocked(reduceTransparency).mockResolvedValue(true);
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(document.documentElement).toHaveClass("reduce-transparency"));
  });

  it("stops listening when cleaned up", async () => {
    trackWindowChrome()();
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalled());
    window.dispatchEvent(new Event("focus"));
    expect(reduceTransparency).toHaveBeenCalledTimes(1);
  });
});
