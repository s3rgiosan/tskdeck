import { useEffect, useRef } from "react";
import { showAlert } from "../api/client";
import { useDeck } from "../state/store";

/** The alert title for a failure that names no situation of its own. */
const DEFAULT_TITLE = "The action couldn't be completed";

function dismiss(error: string) {
  if (useDeck.getState().error === error) useDeck.setState({ error: null, errorTitle: null, errorTask: null });
}

/**
 * Shows the latest failure as a native alert with an OK button, attached to this window, and clears
 * it once the alert is dismissed. Renders nothing.
 */
export function ErrorAlert() {
  const error = useDeck((s) => s.error);
  const title = useDeck((s) => s.errorTitle);
  // The failure on screen, so a repeated effect run does not show it twice.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (error === null || shown.current === error) return;
    shown.current = error;
    showAlert(title ?? DEFAULT_TITLE, error)
      .catch(() => null)
      .finally(() => {
        shown.current = null;
        dismiss(error);
      });
  }, [error, title]);

  return null;
}

/** The latest failure as selectable text in the place it belongs to, such as an open dialog. */
export function InlineError() {
  const error = useDeck((s) => s.error);
  if (error === null) return null;
  return (
    <p role="alert" className="flow-error">
      {error}
    </p>
  );
}
