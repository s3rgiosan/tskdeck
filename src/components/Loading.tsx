/** "Loading…" with a small spinner, which reduced motion hides. */
export function Loading() {
  return (
    <p className="board-note loading" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading…
    </p>
  );
}
