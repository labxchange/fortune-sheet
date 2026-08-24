import React, { useEffect } from "react";

const DEFAULT_FOCUSABLE_SELECTOR =
  '[role="button"]:not([aria-disabled="true"])';

// A React onKeyDown handler inside the container can't defend itself against
// this hook's native listener: since React 17, synthetic events are
// delegated from a listener at the app root, so a native listener on an
// ancestor (this container) always fires first on the real DOM bubble path,
// regardless of any stopPropagation() called from a React handler. Text
// entry (a rename field, a native input, ...) must be excluded here instead.
// Checked via the contenteditable attribute (inherited via closest(), same
// as the isContentEditable property) rather than the isContentEditable
// property itself, which jsdom doesn't implement.
const isTextEntry = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node || typeof node.closest !== "function") return false;
  return !!node.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
  );
};

export type RovingFocusOrientation = "horizontal" | "vertical" | "grid";

export type UseRovingFocusOptions = {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Default "vertical". */
  orientation?: RovingFocusOrientation;
  /** Required for orientation "grid". */
  columns?: number;
  itemSelector?: string;
  /** Wrap around at the ends. Grid mode never wraps vertically. Default true. */
  loop?: boolean;
  /** Default true. Pass e.g. an "open" flag to gate popup-scoped navigation. */
  enabled?: boolean;
};

export function useRovingFocus({
  containerRef,
  orientation = "vertical",
  columns,
  itemSelector = DEFAULT_FOCUSABLE_SELECTOR,
  loop = true,
  enabled = true,
}: UseRovingFocusOptions): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const getItems = () =>
      Array.from(container.querySelectorAll<HTMLElement>(itemSelector));

    const step = (current: number, delta: number, length: number) => {
      if (current < 0) return 0;
      const next = current + delta;
      if (loop) return ((next % length) + length) % length;
      return Math.min(Math.max(next, 0), length - 1);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      const items = getItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      // Focus sitting on something that is not an item — inside a popup the
      // selector excludes, say — must do nothing. `step()` maps a negative
      // current to 0, so without this an arrow key would teleport to the first
      // item. The container itself is exempt: `focusRegion` lands there when a
      // region has not been visited yet, and the first arrow should enter it.
      if (current < 0 && document.activeElement !== container) return;
      let next: number | null = null;

      if (orientation === "grid") {
        const cols = columns ?? items.length;
        const row = Math.floor(Math.max(current, 0) / cols);
        const col = Math.max(current, 0) % cols;
        if (e.key === "ArrowRight") next = row * cols + step(col, 1, cols);
        else if (e.key === "ArrowLeft") next = row * cols + step(col, -1, cols);
        else if (e.key === "ArrowDown" && (row + 1) * cols + col < items.length)
          next = (row + 1) * cols + col;
        else if (e.key === "ArrowUp" && row > 0) next = (row - 1) * cols + col;
      } else {
        const fwd = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
        const back = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
        if (e.key === fwd) next = step(current, 1, items.length);
        else if (e.key === back) next = step(current, -1, items.length);
      }
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = items.length - 1;

      if (next == null) return;
      e.preventDefault();
      e.stopPropagation();
      items[next]?.focus();
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, orientation, columns, itemSelector, loop, enabled]);
}
