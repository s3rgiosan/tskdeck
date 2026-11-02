import { afterEach, describe, expect, it } from "vitest";
import { trackWindowActivity } from "./windowActivity";

let stop = () => {};
afterEach(() => {
  stop();
  document.documentElement.classList.remove("window-inactive");
});

describe("trackWindowActivity", () => {
  it("marks the root inactive on blur and clears it on focus", () => {
    stop = trackWindowActivity();
    window.dispatchEvent(new Event("blur"));
    expect(document.documentElement).toHaveClass("window-inactive");
    window.dispatchEvent(new Event("focus"));
    expect(document.documentElement).not.toHaveClass("window-inactive");
  });

  it("stops listening when cleaned up", () => {
    trackWindowActivity()();
    document.documentElement.classList.add("window-inactive");
    window.dispatchEvent(new Event("focus"));
    expect(document.documentElement).toHaveClass("window-inactive");
  });
});
