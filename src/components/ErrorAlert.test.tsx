import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showAlert } from "../api/client";
import { failure, useDeck } from "../state/store";
import { ErrorAlert, InlineError } from "./ErrorAlert";

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  onBoardChanged: vi.fn(),
  showAlert: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
});
afterEach(cleanup);

describe("ErrorAlert", () => {
  it("shows a failure as an alert titled with the situation, and clears it once dismissed", async () => {
    let dismiss = () => {};
    vi.mocked(showAlert).mockReturnValue(new Promise<void>((resolve) => (dismiss = resolve)));
    useDeck.setState(failure("Archive couldn't be completed", "tsk refused the change"));
    render(<ErrorAlert />);
    expect(showAlert).toHaveBeenCalledWith("Archive couldn't be completed", "tsk refused the change");
    expect(useDeck.getState().error).toBe("tsk refused the change");
    dismiss();
    await vi.waitFor(() => expect(useDeck.getState().error).toBeNull());
    expect(useDeck.getState().errorTitle).toBeNull();
  });

  it("shows each failure once", () => {
    vi.mocked(showAlert).mockReturnValue(new Promise<void>(() => {}));
    useDeck.setState(failure("Archive couldn't be completed", "tsk refused the change"));
    const { rerender } = render(<ErrorAlert />);
    rerender(<ErrorAlert />);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it("names a failure without a title of its own after the action", () => {
    vi.mocked(showAlert).mockReturnValue(new Promise<void>(() => {}));
    useDeck.setState({ error: "boom" });
    render(<ErrorAlert />);
    expect(showAlert).toHaveBeenCalledWith("The action couldn't be completed", "boom");
  });

  it("draws nothing in the window", () => {
    vi.mocked(showAlert).mockReturnValue(new Promise<void>(() => {}));
    useDeck.setState({ error: "boom" });
    const { container } = render(<ErrorAlert />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InlineError", () => {
  it("shows the failure as selectable text in place", () => {
    useDeck.setState({ error: "project is archived" });
    render(<InlineError />);
    expect(screen.getByRole("alert")).toHaveTextContent("project is archived");
  });
});
