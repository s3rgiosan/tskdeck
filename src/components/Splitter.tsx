import { useEffect, useState } from "react";

/** How far one arrow key press moves a divider. */
const STEP = 10;

export interface PaneSize {
  min: number;
  max: number;
  initial: number;
}

function clamp(value: number, size: PaneSize): number {
  return Math.round(Math.max(size.min, Math.min(size.max, value)));
}

function readStored(key: string, size: PaneSize): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return stored > 0 ? clamp(stored, size) : size.initial;
  } catch {
    return size.initial;
  }
}

/** A pane width kept between launches under `key`, clamped to `size`. */
export function useStoredWidth(key: string, size: PaneSize): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => readStored(key, size));
  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {
      // Without storage the pane opens at its default width next time.
    }
  }, [key, width]);
  return [width, (next: number) => setWidth(clamp(next, size))];
}

/**
 * A vertical divider that resizes the pane on one side of it: drag it, or focus it and use the
 * arrow keys, Home and End. `edge` is the side of the pane the divider sits on, so dragging away
 * from the pane widens it.
 */
export function Splitter(props: {
  label: string;
  edge: "left" | "right";
  width: number;
  size: PaneSize;
  className?: string;
  onResize: (width: number) => void;
}) {
  const { label, edge, width, size, className, onResize } = props;
  const sign = edge === "right" ? 1 : -1;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture?.(e.pointerId);
    document.documentElement.classList.add("is-resizing");
    const move = (ev: PointerEvent) => onResize(startWidth + sign * (ev.clientX - startX));
    const stop = () => {
      document.documentElement.classList.remove("is-resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = width + sign * STEP;
        break;
      case "ArrowLeft":
        next = width - sign * STEP;
        break;
      case "Home":
        next = size.min;
        break;
      case "End":
        next = size.max;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    onResize(next);
  }

  return (
    <div
      className={className ? `splitter ${className}` : "splitter"}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      tabIndex={0}
      data-own-keys
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
