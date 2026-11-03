import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useDeck } from "../state/store";
import { KeymapEditor } from "./KeymapEditor";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, api: { saveSettings: vi.fn() }, onBoardChanged: vi.fn() };
});

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  useDeck.setState({ settingsLoaded: true });
  vi.mocked(api.saveSettings).mockResolvedValue();
});
afterEach(cleanup);

function saved() {
  return vi.mocked(api.saveSettings).mock.calls.map((c) => c[0].keymap);
}

describe("KeymapEditor", () => {
  it("records a new key and saves only the override", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record Mark Done" }));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await vi.waitFor(() => expect(saved()).toEqual([{ "status.done": ["ctrl+enter"] }]));
    expect(api.saveSettings).toHaveBeenCalledWith({ openMode: "beside", keymap: { "status.done": ["ctrl+enter"] }, tskPath: null, sidebarHidden: false, projectNames: {} });
  });

  it("ignores a lone modifier and cancels on Escape", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record Mark Done" }));
    await userEvent.keyboard("{Control}");
    expect(screen.getByText("Press a key combination, or Esc to cancel.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Press a key combination, or Esc to cancel.")).not.toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("refuses a reserved key", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record Mark Done" }));
    await userEvent.keyboard("{Meta>}q{/Meta}");
    expect(screen.getByRole("alert")).toHaveTextContent("reserved");
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("offers swap on conflict", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record New Task" }));
    await userEvent.keyboard("{Control>}d{/Control}");
    expect(screen.getByText("Used by Mark Done")).toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Swap" }));
    await vi.waitFor(() => expect(saved()).toEqual([{ capture: ["ctrl+d"], "status.done": ["+", "mod+n"] }]));
  });

  it("replaces the other binding on conflict", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record New Task" }));
    await userEvent.keyboard("{Control>}d{/Control}");
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await vi.waitFor(() => expect(saved()).toEqual([{ capture: ["ctrl+d"], "status.done": ["mod+d"] }]));
  });

  it("finds the palette's mod+k when recording cmd+k on mac and replaces it", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Record New Task" }));
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByText("Used by Command Palette")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await vi.waitFor(() => expect(saved()).toEqual([{ capture: ["meta+k"], palette: [":"] }]));
  });

  it("resets one action and all actions", async () => {
    useDeck.setState({ settings: { openMode: "beside", keymap: { undo: ["ctrl+z"], sort: ["x"] }, tskPath: null, sidebarHidden: false, projectNames: {} } });
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Reset Undo" }));
    await vi.waitFor(() => expect(saved()).toEqual([{ sort: ["x"] }]));
    await userEvent.click(screen.getByRole("button", { name: "Reset All" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Reset All Shortcuts" })).getByRole("button", { name: "Reset All" }));
    await vi.waitFor(() => expect(saved()).toEqual([{ sort: ["x"] }, {}]));
  });

  it("asks before resetting all shortcuts and keeps them on Cancel", async () => {
    useDeck.setState({ settings: { openMode: "beside", keymap: { sort: ["x"] }, tskPath: null, sidebarHidden: false, projectNames: {} } });
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Reset All" }));
    const sheet = screen.getByRole("dialog", { name: "Reset All Shortcuts" });
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(within(sheet).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Reset All"]);
    expect(within(sheet).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Reset All Shortcuts" })).not.toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("closes the confirmation with Escape without resetting", async () => {
    render(<KeymapEditor isMac />);
    await userEvent.click(screen.getByRole("button", { name: "Reset All" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Reset All Shortcuts" })).not.toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("reads Press Keys… on the recording button and returns to Record afterwards", async () => {
    render(<KeymapEditor isMac />);
    const record = screen.getByRole("button", { name: "Record Mark Done" });
    expect(record).toHaveTextContent("Record");
    await userEvent.click(record);
    const active = screen.getByRole("button", { name: /Mark Done/ });
    expect(active).toHaveTextContent("Press Keys…");
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Record Undo" })).toHaveTextContent("Record");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Record Mark Done" })).toHaveTextContent("Record");
  });
});
