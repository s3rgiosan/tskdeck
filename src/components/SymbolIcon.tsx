/** SF Symbols exported as masks in `src/assets/symbols`; each name has a class that sets its image and size. */
export type SymbolName =
  | "tray"
  | "rectangle-stack"
  | "folder"
  | "number"
  | "person"
  | "number-small"
  | "person-small"
  | "sidebar-left"
  | "plus"
  | "plus-small"
  | "ellipsis-circle"
  | "magnifyingglass"
  | "magnifyingglass-large"
  | "xmark"
  | "xmark-circle-fill"
  | "gearshape"
  | "keyboard"
  | "chevron-up-chevron-down";

/** A symbol drawn in the current text colour; the control around it carries the accessible name. */
export function SymbolIcon(props: { name: SymbolName }) {
  return <span className={`symbol symbol-${props.name}`} aria-hidden="true" />;
}
