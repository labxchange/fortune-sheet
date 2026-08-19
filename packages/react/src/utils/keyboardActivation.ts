import React from "react";

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/** Forwards Enter/Space to a native click, reusing whatever onClick is
 * already attached to the element instead of duplicating its logic.
 * Stops propagation so activating a control doesn't also trigger unrelated
 * global keyboard shortcuts (e.g. the grid's own Enter/Space handling). */
export function activateOnEnterOrSpace<T extends HTMLElement = HTMLElement>(
  e: React.KeyboardEvent<T>
): void {
  if (!isActivationKey(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  e.currentTarget.click();
}

/** As activateOnEnterOrSpace, but for a control that can be aria-disabled.
 * A disabled control still *consumes* Enter/Space rather than ignoring them:
 * the grid's own keyboard handler is bound on .fortune-container, which wraps
 * the toolbar, so an unstopped Enter would bubble into handleGlobalEnter and
 * move the selection — making a disabled button do more than an enabled one. */
export function onActivationKeyDown<T extends HTMLElement = HTMLElement>(
  disabled?: boolean
): (e: React.KeyboardEvent<T>) => void {
  return (e) => {
    if (!isActivationKey(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (disabled || e.repeat) return;
    e.currentTarget.click();
  };
}

/**
 * For a trigger that toggles a popup closed by useOutsideClick (which
 * listens on mousedown): runs the toggle on mousedown, with
 * stopPropagation, so a press on this same trigger never reaches
 * useOutsideClick's listener — there is no "outside click closes it,
 * then click reopens it" race, because there's no second update at all.
 * click becomes a no-op (stopPropagation only); Enter/Space runs the
 * toggle directly rather than forwarding to .click(), since click no
 * longer does the toggling.
 */
export function mouseDownToggleHandlers<T extends HTMLElement = HTMLElement>(
  onToggle: () => void
): {
  onMouseDown: (e: React.MouseEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
} {
  return {
    onMouseDown: (e) => {
      e.stopPropagation();
      onToggle();
    },
    onClick: (e) => e.stopPropagation(),
    onKeyDown: (e) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      onToggle();
    },
  };
}
