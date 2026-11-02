import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { DeckState } from "../state/store";
import { useDeck } from "../state/store";
import { row } from "../test/fixtures";
import { CaptureDialog } from "./CaptureDialog";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: { capture: vi.fn(), listScope: vi.fn(), getTask: vi.fn() },
    onBoardChanged: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  vi.mocked(api.capture).mockResolvedValue(5);
  vi.mocked(api.listScope).mockResolvedValue([row({ number: 5 })]);
});
afterEach(cleanup);

async function submitIn(scope: Partial<DeckState>) {
  useDeck.setState(scope);
  const onClose = vi.fn();
  render(<CaptureDialog onClose={onClose} />);
  await userEvent.type(screen.getByLabelText("Title"), "New{Enter}");
  return onClose;
}

describe("CaptureDialog", () => {
  it("captures into the selected project", async () => {
    const onClose = await submitIn({ scope: { kind: "project", path: "/home/test/site" } });
    expect(api.capture).toHaveBeenCalledWith({
      title: "New",
      notes: null,
      project: "/home/test/site",
      thread: null,
      assignee: null,
    });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("captures a thread scope onto the desk with the thread", async () => {
    await submitIn({ scope: { kind: "thread", name: "release" } });
    expect(api.capture).toHaveBeenCalledWith({ title: "New", notes: null, project: null, thread: "release", assignee: null });
  });

  it("captures an assignee scope onto the desk with the assignee", async () => {
    await submitIn({ scope: { kind: "assignee", name: "ada" } });
    expect(api.capture).toHaveBeenCalledWith({ title: "New", notes: null, project: null, thread: null, assignee: "ada" });
  });

  it("captures the desk and all views onto the desk", async () => {
    await submitIn({ scope: { kind: "all" } });
    expect(api.capture).toHaveBeenCalledWith({ title: "New", notes: null, project: null, thread: null, assignee: null });
  });

  it("requires a title", async () => {
    render(<CaptureDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Title"), "   {Enter}");
    expect(api.capture).not.toHaveBeenCalled();
  });

  it("stays open and keeps the text when tsk refuses", async () => {
    vi.mocked(api.capture).mockRejectedValue({ kind: "refused", code: "project-archived", message: "project is archived" });
    const onClose = await submitIn({ scope: { kind: "project", path: "/home/test/site" } });
    await vi.waitFor(() => expect(useDeck.getState().error).toBe("project is archived"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("New");
  });
});

describe("CaptureDialog target", () => {
  const path = "/home/test/a/wordpress/wp-content";

  function into(): string | null {
    return screen.getByText("Into").nextElementSibling?.textContent ?? null;
  }

  it("names a project by the name given to it", () => {
    useDeck.setState({
      scope: { kind: "project", path },
      allRows: [row({ project: path })],
      settings: { ...useDeck.getState().settings, projectNames: { [path]: "Alpha" } },
    });
    render(<CaptureDialog onClose={() => {}} />);
    expect(into()).toBe("Alpha");
  });

  it("names an unnamed project as the sidebar does", () => {
    useDeck.setState({
      scope: { kind: "project", path },
      allRows: [row({ project: path }), row({ project: "/home/test/b/wordpress/wp-content" })],
    });
    render(<CaptureDialog onClose={() => {}} />);
    expect(into()).toBe("a/wordpress/wp-content");
  });
});
