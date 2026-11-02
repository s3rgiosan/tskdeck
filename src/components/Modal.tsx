import type { ReactNode } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useDeck } from "../state/store";
import { InlineError } from "./ErrorAlert";

/** The control a dialog focuses when it opens. */
const FIRST_FIELD = "input, textarea, select, button";

/** Escape and Command-Period both cancel a sheet. */
function isCancelKey(e: React.KeyboardEvent): boolean {
  return e.key === "Escape" || (e.key === "." && e.metaKey && !e.ctrlKey && !e.altKey);
}

/**
 * A modal `<dialog>` shown as a sheet at the top of the window: it keeps focus inside, makes the
 * rest of the window inert, closes on Escape or Command-Period, and hands focus back to the element
 * that had it. A click outside it does nothing. With `title`, the sheet shows that title and takes
 * it as its name; otherwise `label` names it. Unless `errors` is false, failures show inside the
 * sheet and close with it. `initialFocus` picks the element that takes focus when it opens.
 */
export function Modal(props: {
  label?: string;
  title?: string;
  className?: string;
  errors?: boolean;
  initialFocus?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { label, title, className, errors = true, initialFocus = FIRST_FIELD, onClose, children } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Read while rendering, before a field inside the dialog takes focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  // A layout effect so focus is handed back before anything mounted in the same update takes it.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      const active = document.activeElement;
      const hadFocus = active === null || active === document.body || dialog.contains(active);
      if (dialog.open) dialog.close();
      if (hadFocus && opener?.isConnected) opener.focus();
      if (errors && useDeck.getState().error !== null) useDeck.setState({ error: null, errorTitle: null, errorTask: null });
    };
  }, [opener, errors, initialFocus]);

  return (
    <dialog
      ref={ref}
      className={className ? `modal ${className}` : "modal"}
      aria-label={title ? undefined : label}
      aria-labelledby={title ? titleId : undefined}
      // The key handler below closes the sheet; it leaves alone an Escape that a field inside kept for itself.
      onCancel={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!isCancelKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      {title && (
        <h2 className="sheet-title" id={titleId}>
          {title}
        </h2>
      )}
      {children}
      {errors && <InlineError />}
    </dialog>
  );
}
