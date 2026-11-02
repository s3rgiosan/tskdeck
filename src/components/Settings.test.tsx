import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onMenu, onSettingsChanged, requestTskCheck, setWindowHeight, setWindowTitle, showAlert } from "../api/client";
import type { Settings as SettingsValue } from "../api/types";
import { useDeck } from "../state/store";
import { GeneralSettings } from "./Settings";
import { SettingsWindow } from "./SettingsWindow";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: { saveSettings: vi.fn(), getSettings: vi.fn(), tskInfo: vi.fn(), listScope: vi.fn(), relocateTsk: vi.fn() },
    onBoardChanged: vi.fn(),
    onSettingsChanged: vi.fn(),
    onMenu: vi.fn(),
    requestTskCheck: vi.fn(),
    setWindowTitle: vi.fn(),
    setWindowHeight: vi.fn(),
    showAlert: vi.fn(),
  };
});

const DEFAULTS: SettingsValue = { openMode: "beside", keymap: {}, tskPath: null, sidebarHidden: false, projectNames: {} };

beforeEach(() => {
  vi.resetAllMocks();
  useDeck.setState(useDeck.getInitialState(), true);
  vi.mocked(api.saveSettings).mockResolvedValue();
  vi.mocked(api.getSettings).mockResolvedValue(DEFAULTS);
  vi.mocked(showAlert).mockResolvedValue();
  vi.mocked(onSettingsChanged).mockResolvedValue(() => {});
  vi.mocked(onMenu).mockResolvedValue(() => {});
  vi.mocked(requestTskCheck).mockResolvedValue();
  vi.mocked(setWindowTitle).mockResolvedValue();
  vi.mocked(setWindowHeight).mockResolvedValue();
  localStorage.clear();
});
afterEach(cleanup);

describe("GeneralSettings", () => {
  it("saves the open mode", async () => {
    render(<GeneralSettings />);
    await userEvent.click(screen.getByLabelText("Over the board"));
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ ...DEFAULTS, openMode: "overlay" }));
  });

  it("has no close button; changes apply as they are made", () => {
    render(<GeneralSettings />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("detect clears a saved path", async () => {
    useDeck.setState({ settings: { ...DEFAULTS, tskPath: "/old/tsk" } });
    render(<GeneralSettings />);
    await userEvent.click(screen.getByRole("button", { name: "Detect" }));
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(DEFAULTS));
    expect(screen.getByLabelText("tsk path:")).toHaveValue("");
  });

  it("detect asks the main window to look for tsk again when no path is set", async () => {
    render(<GeneralSettings />);
    await userEvent.click(screen.getByRole("button", { name: "Detect" }));
    await vi.waitFor(() => expect(requestTskCheck).toHaveBeenCalledTimes(1));
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("saves a path typed by the user", async () => {
    render(<GeneralSettings />);
    await userEvent.type(screen.getByLabelText("tsk path:"), "/opt/tsk{Enter}");
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ ...DEFAULTS, tskPath: "/opt/tsk" }));
    expect(api.relocateTsk).not.toHaveBeenCalled();
  });
});

describe("SettingsWindow", () => {
  it("loads the saved settings", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...DEFAULTS, openMode: "overlay" });
    render(<SettingsWindow />);
    await vi.waitFor(() => expect(screen.getByLabelText("Over the board")).toBeChecked());
    expect(api.tskInfo).not.toHaveBeenCalled();
  });

  it("takes settings saved from the main window", async () => {
    render(<SettingsWindow />);
    await vi.waitFor(() => expect(onSettingsChanged).toHaveBeenCalled());
    vi.mocked(onSettingsChanged).mock.calls[0][0]({ ...DEFAULTS, sidebarHidden: true, projectNames: {} });
    expect(useDeck.getState().settings.sidebarHidden).toBe(true);
  });

  it("shows the message in an alert when saving fails", async () => {
    vi.mocked(api.saveSettings).mockRejectedValue("disk full");
    render(<SettingsWindow />);
    await userEvent.click(screen.getByLabelText("Over the board"));
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith("Settings couldn't be saved", "disk full"));
  });

  it("shows a failed Detect under the path field", async () => {
    vi.mocked(requestTskCheck).mockRejectedValue(new Error("no main window"));
    render(<SettingsWindow />);
    await userEvent.click(screen.getByRole("button", { name: "Detect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the main window");
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("titles its title bar after the pane and drags the window from it", async () => {
    render(<SettingsWindow />);
    const titlebar = screen.getByRole("banner");
    expect(titlebar).toHaveAttribute("data-tauri-drag-region", "deep");
    expect(within(titlebar).getByRole("heading", { name: "General" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(within(titlebar).getByRole("heading", { name: "Shortcuts" })).toBeInTheDocument();
  });

  it("opens on General, titled after the pane", async () => {
    render(<SettingsWindow />);
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Detect" })).toBeInTheDocument();
    await vi.waitFor(() => expect(setWindowTitle).toHaveBeenLastCalledWith("General"));
  });

  it("switches to Shortcuts and reopens on it", async () => {
    const first = render(<SettingsWindow />);
    await userEvent.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(screen.getByRole("region", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await vi.waitFor(() => expect(setWindowTitle).toHaveBeenLastCalledWith("Shortcuts"));
    first.unmount();
    render(<SettingsWindow />);
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute("aria-selected", "true");
  });

  it("fits the window on first render and on each pane change", async () => {
    render(<SettingsWindow />);
    expect(setWindowHeight).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(setWindowHeight).toHaveBeenCalledTimes(2);
    const heights = vi.mocked(setWindowHeight).mock.calls.map((c) => c[0]);
    expect(heights.every((h) => h <= 520)).toBe(true);
  });

  it("survives a failing resize", async () => {
    vi.mocked(setWindowHeight).mockRejectedValue(new Error("no window"));
    render(<SettingsWindow />);
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
  });

  it("moves between panes with the arrow keys", async () => {
    render(<SettingsWindow />);
    screen.getByRole("tab", { name: "General" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute("aria-selected", "true");
  });
});
