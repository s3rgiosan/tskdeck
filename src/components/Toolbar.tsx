import type { Group, Sort } from "../api/types";
import { CHOICE_LABELS, groupChoices, sortChoices } from "../board/choices";
import { useDeck } from "../state/store";
import { SearchBar } from "./SearchBar";
import { SymbolIcon } from "./SymbolIcon";
import { PopUp } from "./PopUp";

/** What a grouping choice reads as in the Group By pop-up. */
function groupLabel(group: Group): string {
  return group === "none" ? "No Grouping" : `Group by ${CHOICE_LABELS[group]}`;
}

/** What a sorting choice reads as in the Sort By pop-up. */
function sortLabel(sort: Sort): string {
  return `Sort by ${CHOICE_LABELS[sort]}`;
}

interface ToolbarProps {
  /** The current scope's name, shown as the window title and in the search placeholder. */
  title: string;
  sidebarHidden: boolean;
  searchFocus: number;
  onToggleSidebar: () => void;
  onNewTask: () => void;
}

/**
 * The toolbar over the board and the task pane: the title at its leading edge, the Group and Sort
 * pop-ups, then New Task and the search field. The sidebar toggle sits at the sidebar's top-right
 * corner, or beside the window controls when the sidebar is hidden. The board scrolls under it.
 * Its empty space drags the window.
 */
export function Toolbar(props: ToolbarProps) {
  const { title, sidebarHidden, searchFocus, onToggleSidebar, onNewTask } = props;
  const scope = useDeck((s) => s.scope);
  const options = useDeck((s) => s.options);
  const setOptions = useDeck((s) => s.setOptions);

  return (
    <header className="toolbar" data-tauri-drag-region="deep">
      <div className="toolbar-leading">
        <button
          type="button"
          className="toolbar-button sidebar-toggle"
          aria-label={sidebarHidden ? "Show Sidebar" : "Hide Sidebar"}
          title={sidebarHidden ? "Show Sidebar" : "Hide Sidebar"}
          onClick={onToggleSidebar}
        >
          <SymbolIcon name="sidebar-left" />
        </button>
        <h1 className="toolbar-title">{title}</h1>
      </div>
      <div className="toolbar-center">
        <PopUp
          className="toolbar-popup"
          aria-label="Group By"
          title="Group By"
          value={options.group}
          onChange={(e) => void setOptions({ group: e.target.value as typeof options.group })}
        >
          {groupChoices(scope).map((g) => (
            <option key={g} value={g}>
              {groupLabel(g)}
            </option>
          ))}
        </PopUp>
        <PopUp
          className="toolbar-popup"
          aria-label="Sort By"
          title="Sort By"
          value={options.sort}
          onChange={(e) => void setOptions({ sort: e.target.value as typeof options.sort })}
        >
          {sortChoices(scope).map((s) => (
            <option key={s} value={s}>
              {sortLabel(s)}
            </option>
          ))}
        </PopUp>
      </div>
      <div className="toolbar-trailing">
        <button type="button" className="toolbar-button" aria-label="New Task" title="New Task" onClick={onNewTask}>
          <SymbolIcon name="plus" />
        </button>
        <SearchBar scope={title} focusRequest={searchFocus} />
      </div>
    </header>
  );
}
