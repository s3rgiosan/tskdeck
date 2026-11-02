import type { SelectHTMLAttributes } from "react";
import { SymbolIcon } from "./SymbolIcon";

/** A pop-up button: a `<select>` drawn with the up-and-down chevrons at its trailing end. */
export function PopUp(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...select } = props;
  return (
    <span className={className ? `popup ${className}` : "popup"}>
      <select {...select} />
      <SymbolIcon name="chevron-up-chevron-down" />
    </span>
  );
}
