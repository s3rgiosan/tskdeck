import { useEffect, useRef } from "react";
import { useDeck } from "../state/store";
import { SymbolIcon } from "./SymbolIcon";

/**
 * Filters the board as you type. Each new `focusRequest` focuses the field. Enter keeps the filter and
 * hands the keys back to the board; Escape clears it.
 */
export function SearchBar(props: { scope: string; focusRequest: number }) {
  const { scope, focusRequest } = props;
  const query = useDeck((s) => s.query);
  const setQuery = useDeck((s) => s.setQuery);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest > 0) input.current?.focus();
  }, [focusRequest]);

  return (
    <div className="search-field">
      <SymbolIcon name="magnifyingglass-large" />
      <input
        ref={input}
        type="search"
        aria-label="Search"
        title="Searches titles, notes, steps, threads, @assignees and T numbers"
        placeholder={`Search ${scope}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          switch (e.key) {
            case "Enter":
              e.preventDefault();
              e.currentTarget.blur();
              break;
            case "Escape":
              e.stopPropagation();
              setQuery("");
              e.currentTarget.blur();
              break;
            default:
              break;
          }
        }}
      />
    </div>
  );
}
