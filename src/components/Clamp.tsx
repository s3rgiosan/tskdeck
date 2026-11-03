import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

/** Lines of text shown before the rest collapses behind Show More. */
export const CLAMP_LINES = 6;

/**
 * Shows its content at most six lines tall. When the content is taller, a Show More link button
 * below it expands it and reads Show Less. With `disabled`, the content shows in full.
 */
export function Clamp(props: { children: ReactNode; className?: string; disabled?: boolean }) {
  const { children, className, disabled = false } = props;
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // The content is measured while collapsed; once expanded, its last measurement stands.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || expanded || disabled) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, expanded, disabled]);

  const open = expanded || disabled;
  return (
    <div className={className}>
      <div ref={body} className={open ? "clamp" : "clamp is-clamped"}>
        {children}
      </div>
      {!disabled && overflows && (
        <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show Less" : "Show More"}
        </button>
      )}
    </div>
  );
}
