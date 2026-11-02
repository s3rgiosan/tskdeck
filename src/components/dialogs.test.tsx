import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeck } from "../state/store";
import { resolveKeymap } from "../keys/keymap";
import { AssignDialog } from "./AssignDialog";
import { CaptureDialog } from "./CaptureDialog";
import { CommandPalette } from "./CommandPalette";

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  onBoardChanged: vi.fn(),
}));

beforeEach(() => {
  useDeck.setState(useDeck.getInitialState(), true);
});
afterEach(cleanup);

/** A button that opens the dialog `render` returns and closes it through `onClose`. */
function Host(props: { dialog: (onClose: () => void) => ReactElement }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      {open && props.dialog(() => setOpen(false))}
    </>
  );
}

const DIALOGS: [string, (onClose: () => void) => ReactElement][] = [
  ["New Task", (onClose) => <CaptureDialog onClose={onClose} />],
  ["Assign", (onClose) => <AssignDialog count={1} onSubmit={() => {}} onClose={onClose} />],
  [
    "Command Palette",
    (onClose) => <CommandPalette keymap={resolveKeymap({})} handlers={{ undo: vi.fn() }} onClose={onClose} isMac />,
  ],
];

describe.each(DIALOGS)("%s dialog", (name, dialog) => {
  it("opens as a modal dialog and returns focus to the opener on Escape", async () => {
    const user = userEvent.setup();
    render(<Host dialog={dialog} />);
    await user.click(screen.getByRole("button", { name: "Opener" }));
    const shown = screen.getByRole("dialog", { name });
    expect(shown).toHaveAttribute("open");
    expect(shown).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus();
  });

  it("closes on Command-Period", async () => {
    const user = userEvent.setup();
    render(<Host dialog={dialog} />);
    await user.click(screen.getByRole("button", { name: "Opener" }));
    await user.keyboard("{Meta>}.{/Meta}");
    expect(screen.queryByRole("dialog", { name })).not.toBeInTheDocument();
  });

  it("stays open on a click outside it", async () => {
    const user = userEvent.setup();
    render(<Host dialog={dialog} />);
    await user.click(screen.getByRole("button", { name: "Opener" }));
    const shown = screen.getByRole("dialog", { name });
    fireEvent.mouseDown(shown);
    fireEvent.click(shown);
    expect(screen.getByRole("dialog", { name })).toBeInTheDocument();
  });
});

describe("New Task sheet", () => {
  it("shows its title and puts each label beside its field", async () => {
    render(<CaptureDialog onClose={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "New Task" });
    expect(within(sheet).getByRole("heading", { name: "New Task" })).toBeInTheDocument();
    const title = within(sheet).getByRole("textbox", { name: "Title" });
    expect(title.previousElementSibling).toHaveClass("form-label");
    expect(within(sheet).getByRole("textbox", { name: "Notes" }).previousElementSibling).toHaveClass("form-label");
  });
});
