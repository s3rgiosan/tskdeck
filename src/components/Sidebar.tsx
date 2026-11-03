import { useEffect, useMemo, useRef, useState } from "react";
import { showPullDown } from "../api/client";
import type { Scope } from "../api/types";
import type { SidebarItem } from "../board/sidebar";
import { sidebarModel } from "../board/sidebar";
import { resolveKeymap } from "../keys/keymap";
import type { Handler, Handlers } from "../keys/useKeymap";
import { useKeymap } from "../keys/useKeymap";
import { useDeck } from "../state/store";
import { usePullDownChoice } from "./PullDown";
import type { SymbolName } from "./SymbolIcon";
import { SymbolIcon } from "./SymbolIcon";

type SectionName = "projects" | "threads" | "assignees";
type ListName = "views" | SectionName;

interface Filter {
  section: SectionName;
  text: string;
}

/** The project context menu item that renames the project. */
export const RENAME_PROJECT = "pane-rename-project";

const TITLES: Record<SectionName, string> = { projects: "Projects", threads: "Threads", assignees: "Assignees" };

function sameScope(a: Scope, b: Scope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function symbolFor(scope: Scope): SymbolName {
  switch (scope.kind) {
    case "desk":
      return "tray";
    case "all":
      return "rectangle-stack";
    case "project":
      return "folder";
    case "thread":
      return "number";
    default:
      return "person";
  }
}

function matchesFilter(item: SidebarItem, text: string): boolean {
  return item.label.toLowerCase().includes(text.trim().toLowerCase());
}

/** `onRename` receives the path of a project chosen for renaming from its context menu. */
export function Sidebar(props: { onRename: (path: string) => void }) {
  const { onRename } = props;
  const allRows = useDeck((s) => s.allRows);
  const scope = useDeck((s) => s.scope);
  const focus = useDeck((s) => s.focus);
  const settings = useDeck((s) => s.settings);
  const modalOpen = useDeck((s) => s.modalOpen);
  const selectScope = useDeck((s) => s.selectScope);
  const keymap = useMemo(() => resolveKeymap(settings.keymap), [settings.keymap]);
  const model = useMemo(() => sidebarModel(allRows, settings.projectNames), [allRows, settings.projectNames]);
  // The project whose context menu is open.
  const menuProject = useRef<string | null>(null);

  usePullDownChoice((id) => {
    if (id === RENAME_PROJECT && menuProject.current !== null) onRename(menuProject.current);
  });

  function showProjectMenu(e: React.MouseEvent, path: string) {
    e.preventDefault();
    menuProject.current = path;
    showPullDown([{ id: RENAME_PROJECT, title: "Rename…" }], e.clientX, e.clientY).catch(() => null);
  }

  /** Opens the highlighted project's menu below its row; the context-menu key and Shift+F10 reach the list. */
  function showHighlightedProjectMenu(e: React.MouseEvent, list: ListName) {
    if (e.target !== e.currentTarget || currentList !== list || current === undefined) return;
    if (current.scope.kind !== "project") return;
    const row = document.getElementById(itemId(current));
    if (!row) return;
    e.preventDefault();
    menuProject.current = current.scope.path;
    const rect = row.getBoundingClientRect();
    showPullDown([{ id: RENAME_PROJECT, title: "Rename…" }], rect.left, rect.bottom).catch(() => null);
  }

  const [filter, setFilter] = useState<Filter | null>(null);
  const [highlight, setHighlight] = useState(0);
  const filterInput = useRef<HTMLInputElement>(null);

  const sectionList: { name: SectionName; items: SidebarItem[] }[] = [
    { name: "projects", items: model.projects },
    { name: "threads", items: model.threads },
    { name: "assignees", items: model.assignees },
  ];
  const sections = sectionList.map((s) => ({
    ...s,
    items: filter && filter.section === s.name ? s.items.filter((i) => matchesFilter(i, filter.text)) : s.items,
  }));
  const visible: SidebarItem[] = [model.desk, model.all, ...sections.flatMap((s) => s.items)];
  // While a filter is open the highlight stays on that section's matching items.
  const range = filter
    ? { start: sectionStart(filter.section), count: sections.find((s) => s.name === filter.section)?.items.length ?? 0 }
    : { start: 0, count: visible.length };
  const current = range.count === 0 ? undefined : visible[clampToRange(highlight)];

  const filterSection = filter?.section;
  useEffect(() => {
    if (filterSection) filterInput.current?.focus();
  }, [filterSection]);

  const lists = useRef<Partial<Record<ListName, HTMLDivElement | null>>>({});
  const currentList: ListName | null = current === undefined ? null : listOf(current);

  // While the sidebar has the keyboard, DOM focus sits on the list holding the highlight so screen readers follow it.
  useEffect(() => {
    if (focus !== "sidebar" || filterSection || modalOpen || currentList === null) return;
    const list = lists.current[currentList];
    if (list && document.activeElement !== list) list.focus({ preventScroll: true });
  }, [focus, filterSection, modalOpen, currentList]);

  /** The list an item is shown in. */
  function listOf(item: SidebarItem): ListName {
    return sections.find((s) => s.items.includes(item))?.name ?? "views";
  }

  function itemId(item: SidebarItem): string {
    return `side-${visible.indexOf(item)}`;
  }

  useEffect(() => {
    if (focus !== "sidebar") setFilter(null);
  }, [focus]);

  function activate(item: SidebarItem | undefined) {
    if (!item) return;
    setFilter(null);
    void selectScope(item.scope);
  }

  /** Position of a section's first item in the flat list. */
  function sectionStart(name: SectionName): number {
    const names: SectionName[] = ["projects", "threads", "assignees"];
    return names.slice(0, names.indexOf(name)).reduce((n, prev) => n + model[prev].length, 2);
  }

  function startFilter(section: SectionName) {
    useDeck.setState({ focus: "sidebar" });
    setFilter({ section, text: "" });
    setHighlight(sectionStart(section));
  }

  function clampToRange(index: number): number {
    return Math.max(range.start, Math.min(range.start + range.count - 1, index));
  }

  function move(delta: number) {
    if (range.count === 0) return;
    setHighlight((h) => clampToRange(h + delta));
  }

  function whenFocused(fn: () => void): Handler {
    return () => {
      if (useDeck.getState().focus !== "sidebar") return false;
      fn();
    };
  }

  const sidebarKeys: Handlers = {
    "focus.projects": () => startFilter("projects"),
    "focus.threads": () => startFilter("threads"),
    "focus.assignees": () => startFilter("assignees"),
    "nav.down": whenFocused(() => move(1)),
    "nav.up": whenFocused(() => move(-1)),
    "task.open": whenFocused(() => activate(current)),
  };

  useKeymap(keymap, modalOpen ? {} : sidebarKeys, "board");

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        activate(current);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        setFilter(null);
        useDeck.setState({ focus: "board" });
        break;
      default:
        break;
    }
  }

  function onFilterChange(text: string) {
    if (!filter) return;
    setFilter({ ...filter, text });
    setHighlight(sectionStart(filter.section));
  }

  function renderItem(item: SidebarItem) {
    const isCurrent = focus === "sidebar" && current?.key === item.key;
    const isActive = sameScope(item.scope, scope);
    const project = item.scope.kind === "project" ? item.scope.path : null;
    return (
      <div
        key={item.key}
        id={itemId(item)}
        role="option"
        aria-selected={isActive}
        tabIndex={-1}
        data-own-keys
        className={`side-item${isActive ? " is-active" : ""}${isCurrent ? " is-current" : ""}`}
        onClick={() => activate(item)}
        onContextMenu={project === null ? undefined : (e) => showProjectMenu(e, project)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            activate(item);
          }
        }}
      >
        <SymbolIcon name={symbolFor(item.scope)} />
        <span className="side-label">{item.label}</span>
        <span className="side-count">{item.count}</span>
      </div>
    );
  }

  /** A titled list of items; it holds the active descendant while the highlight is in it. */
  function renderList(name: ListName, items: SidebarItem[]) {
    const holdsCurrent = currentList === name && current !== undefined;
    return (
      <div
        ref={(el) => {
          lists.current[name] = el;
        }}
        role="listbox"
        aria-labelledby={`side-title-${name}`}
        tabIndex={holdsCurrent ? 0 : -1}
        aria-activedescendant={holdsCurrent && current ? itemId(current) : undefined}
        onContextMenu={(e) => showHighlightedProjectMenu(e, name)}
        onFocus={(e) => {
          if (e.target === e.currentTarget && useDeck.getState().focus !== "sidebar") useDeck.setState({ focus: "sidebar" });
        }}
      >
        {items.map(renderItem)}
      </div>
    );
  }

  return (
    <nav className="sidebar" aria-label="Views">
      <div className="side-group">
        <div className="side-title" id="side-title-views">
          Views
        </div>
        {renderList("views", [model.desk, model.all])}
      </div>
      {sections.map(({ name, items }) => (
        <div className="side-group" key={name}>
          <div className="side-title" id={`side-title-${name}`}>
            {TITLES[name]}
          </div>
          {filter?.section === name && (
            <input
              ref={filterInput}
              className="side-filter"
              aria-label={`Filter ${TITLES[name].toLowerCase()}`}
              placeholder="Filter"
              value={filter.text}
              onChange={(e) => onFilterChange(e.target.value)}
              onKeyDown={onFilterKeyDown}
            />
          )}
          {renderList(name, items)}
          {items.length === 0 && <div className="side-empty">{filter?.section === name ? "No match" : "None"}</div>}
        </div>
      ))}
    </nav>
  );
}
