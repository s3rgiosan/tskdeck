import { useEffect, useRef } from "react";
import type { PullDownItem } from "../api/client";
import { onMenu, showPullDown } from "../api/client";
import type { SymbolName } from "./SymbolIcon";
import { SymbolIcon } from "./SymbolIcon";

/** The id of an item that draws a separator line in the menu. */
export const PULL_DOWN_SEPARATOR = "pane-separator";

/** Space between the button's bottom edge and the menu. */
const MENU_GAP = 4;

/**
 * A pull-down button: a symbol button that opens a native menu of commands below itself. It
 * never shows a chosen value; a chosen item arrives through `usePullDownChoice`.
 */
export function PullDown(props: { label: string; symbol: SymbolName; items: PullDownItem[]; className?: string }) {
  const { label, symbol, items, className } = props;
  return (
    <button
      type="button"
      className={className ? `icon-button pull-down ${className}` : "icon-button pull-down"}
      aria-label={label}
      aria-haspopup="menu"
      title={label}
      disabled={items.length === 0}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        showPullDown(items, rect.left, rect.bottom + MENU_GAP).catch(() => null);
      }}
    >
      <SymbolIcon name={symbol} />
    </button>
  );
}

/** Calls `onChoose` with the id of each menu item chosen while this component is mounted. */
export function usePullDownChoice(onChoose: (id: string) => void) {
  const latest = useRef(onChoose);
  latest.current = onChoose;
  useEffect(() => {
    // Outside a Tauri window there is no menu to listen to.
    const stop = Promise.resolve()
      .then(() => onMenu((id) => latest.current(id)))
      .catch(() => null);
    return () => {
      void stop.then((unlisten) => unlisten?.());
    };
  }, []);
}
